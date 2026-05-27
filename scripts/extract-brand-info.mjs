#!/usr/bin/env node
// Fills color/font gaps for brands missing those fields. For each target brand:
//   - If the brand has a website  → fetch the homepage, regex hex colors out of
//     the CSS, and pull font names from `@font-face` + `font-family` rules
//   - Else if the brand has a logo → ship the primary logo to Claude vision
//     and ask for the dominant brand colors
//
// Prints a per-brand report you can manually paste into the Brand Hub editor.
// Does NOT write to the database — review-first, apply-yourself flow.
//
// Run:
//   node scripts/extract-brand-info.mjs               # all brands with gaps
//   node scripts/extract-brand-info.mjs "Allied Marine"  # one brand by name

import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { loadEnv } from "./_load-env.mjs";

loadEnv();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const target = process.argv[2]?.toLowerCase();

const isEmpty = (a) => !Array.isArray(a) || a.length === 0;

// ---------- Helpers ----------

// Common non-brand colors to filter out of scraped CSS.
const COMMON_FILLER = new Set([
  "#FFFFFF", "#000000", "#FFF", "#000",
  "#F5F5F5", "#FAFAFA", "#EEEEEE", "#DDDDDD", "#CCCCCC",
  "#999999", "#666666", "#333333", "#222222", "#111111",
]);

function normalizeHex(hex) {
  let h = hex.toUpperCase().replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return `#${h}`;
}

function stripUrlJunk(url) {
  try {
    const u = new URL(url);
    return `${u.origin}/`;
  } catch {
    return url;
  }
}

async function fetchPage(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "text/html,*/*;q=0.8",
    },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return await res.text();
}

async function fetchCss(html, baseUrl) {
  // Inline <style>...</style>
  const inline = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)]
    .map((m) => m[1])
    .join("\n");

  // Linked stylesheets — up to 8, prefer same-origin
  const linkRe = /<link[^>]+rel=["']?stylesheet["']?[^>]*href=["']([^"']+)["']/gi;
  const linkUrls = [...html.matchAll(linkRe)].map((m) => {
    try {
      return new URL(m[1], baseUrl).toString();
    } catch {
      return null;
    }
  }).filter(Boolean);

  // Inline style="..." attributes too
  const inlineAttrs = [...html.matchAll(/style=["']([^"']*)["']/gi)]
    .map((m) => m[1])
    .join("\n");

  const externalCss = await Promise.all(
    linkUrls.slice(0, 8).map(async (u) => {
      try {
        const r = await fetch(u, { headers: { "User-Agent": "Mozilla/5.0" } });
        if (!r.ok) return "";
        return await r.text();
      } catch {
        return "";
      }
    })
  );

  return [inline, inlineAttrs, ...externalCss].join("\n");
}

function extractColors(css) {
  const hexes = [...css.matchAll(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g)].map(
    (m) => normalizeHex(m[0])
  );
  // Count + filter
  const counts = new Map();
  for (const h of hexes) {
    if (COMMON_FILLER.has(h)) continue;
    counts.set(h, (counts.get(h) ?? 0) + 1);
  }
  // Sort by frequency, take top 6
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([hex, count]) => ({ hex, count }));
}

function extractFonts(css) {
  const fonts = new Set();
  // @font-face { font-family: "Foo"; ... }
  for (const m of css.matchAll(/@font-face\s*\{[^}]*font-family\s*:\s*["']([^"']+)["']/gi)) {
    fonts.add(m[1].trim());
  }
  // font-family: "Foo", "Bar", sans-serif;
  for (const m of css.matchAll(/font-family\s*:\s*([^;}]+)/gi)) {
    const names = m[1]
      .split(",")
      .map((s) => s.trim().replace(/^["']|["']$/g, ""));
    for (const n of names) {
      // Drop generic fallbacks
      if (/^(sans-serif|serif|monospace|cursive|fantasy|system-ui|inherit|initial|unset|revert)$/i.test(n)) {
        continue;
      }
      // Drop empty / very short
      if (!n || n.length < 2) continue;
      // Drop common system fonts that are usually fallbacks
      if (/^(arial|helvetica|times|courier|verdana|tahoma|georgia|trebuchet|impact|comic sans)/i.test(n)) {
        continue;
      }
      fonts.add(n);
    }
  }
  return [...fonts].slice(0, 6);
}

async function extractFromWebsite(url) {
  const cleanUrl = stripUrlJunk(url);
  const html = await fetchPage(cleanUrl);
  const css = await fetchCss(html, cleanUrl);
  return {
    source: cleanUrl,
    colors: extractColors(css),
    fonts: extractFonts(css),
  };
}

async function extractFromLogo(logoUrl, fileName = "") {
  const res = await fetch(logoUrl);
  if (!res.ok) throw new Error(`Logo HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  let mime = res.headers.get("content-type") ?? "";
  // Some Supabase URLs return application/octet-stream — sniff from filename.
  if (!mime || mime === "application/octet-stream") {
    const ext = fileName.toLowerCase().split(".").pop();
    mime =
      ext === "pdf" ? "application/pdf" :
      ext === "png" ? "image/png" :
      ext === "gif" ? "image/gif" :
      ext === "webp" ? "image/webp" :
      ext === "jpg" || ext === "jpeg" ? "image/jpeg" :
      "application/octet-stream";
  }
  const b64 = buf.toString("base64");

  const isPdf = mime === "application/pdf";
  const isImage = /^image\/(jpeg|png|gif|webp)$/.test(mime);
  if (!isPdf && !isImage) {
    throw new Error(`Unsupported logo format: ${mime} (skip .ai/.eps/.svg files)`);
  }

  const prompt = `Look at this brand logo${isPdf ? " (PDF)" : ""} and return ONLY the dominant brand colors as JSON. Skip pure black/white background colors unless they're clearly part of the brand mark. Return at most 4 colors, ordered most-to-least prominent.

Output exactly this shape, no prose:
{ "colors": [{ "hex": "#RRGGBB", "role": "primary" | "secondary", "name": "<one-word descriptor>" }] }`;

  const content = isPdf
    ? [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } },
        { type: "text", text: prompt },
      ]
    : [
        { type: "image", source: { type: "base64", media_type: mime, data: b64 } },
        { type: "text", text: prompt },
      ];

  const msg = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 400,
    messages: [{ role: "user", content }],
  });

  const text = msg.content.find((c) => c.type === "text")?.text ?? "";
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("No JSON in vision response");
  return JSON.parse(m[0]);
}

// ---------- Main ----------

let { data: brands, error } = await supabase
  .from("brands")
  .select("id, business_name, website, status, colors, fonts")
  .order("business_name");
if (error) {
  console.error(error);
  process.exit(1);
}

if (target) {
  brands = brands.filter((b) => b.business_name.toLowerCase().includes(target));
}

const needsHelp = brands.filter((b) => isEmpty(b.colors) || isEmpty(b.fonts));

if (needsHelp.length === 0) {
  console.log("No brands need extraction.");
  process.exit(0);
}

console.log(`\nExtracting for ${needsHelp.length} brand(s)...\n`);

for (const b of needsHelp) {
  const noColors = isEmpty(b.colors);
  const noFonts = isEmpty(b.fonts);
  console.log("─".repeat(70));
  console.log(`▸ ${b.business_name}  [${b.status}]`);
  console.log(`  Missing: ${[noColors && "colors", noFonts && "fonts"].filter(Boolean).join(" + ")}`);

  if (b.website?.trim()) {
    try {
      const out = await extractFromWebsite(b.website);
      console.log(`  Source:  ${out.source}`);
      if (noColors) {
        console.log(`  Colors:`);
        out.colors.forEach((c) => console.log(`    ${c.hex}   (×${c.count} in CSS)`));
      }
      if (noFonts) {
        console.log(`  Fonts:`);
        out.fonts.forEach((f) => console.log(`    ${f}`));
        if (out.fonts.length === 0) console.log(`    (none detected in CSS)`);
      }
    } catch (e) {
      console.log(`  ✗ Website extraction failed: ${e.message}`);
    }
  } else {
    // No website — look up a logo and use Claude vision.
    const { data: logos } = await supabase
      .from("brand_logos")
      .select("public_url, file_name, logo_type")
      .eq("brand_id", b.id)
      .order("display_order")
      .limit(8);
    const primaryLogo = logos?.find((l) => l.logo_type !== "reference") ?? logos?.[0];
    if (!primaryLogo) {
      console.log(`  ✗ No website AND no logo — manual entry needed`);
      continue;
    }
    try {
      console.log(`  Source:  logo "${primaryLogo.file_name}" (vision)`);
      const out = await extractFromLogo(primaryLogo.public_url, primaryLogo.file_name);
      if (noColors && out.colors) {
        console.log(`  Colors:`);
        out.colors.forEach((c) =>
          console.log(`    ${c.hex}   role=${c.role}  name=${c.name}`)
        );
      }
      if (noFonts) {
        console.log(`  Fonts:`);
        console.log(`    (skipped — logo font detection is unreliable)`);
      }
    } catch (e) {
      console.log(`  ✗ Logo extraction failed: ${e.message}`);
    }
  }
  console.log();
}
