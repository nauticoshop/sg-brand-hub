#!/usr/bin/env node
// One-shot importer: Monday board → Brand Hub.
// Reads scripts/monday-data.json (cached MCP output), maps Monday columns to
// the brand schema, and inserts records into Supabase as `in_review`.
//
// Run from project root with .env.local loaded:
//   node --env-file=.env.local scripts/import-from-monday.mjs
//
// Logos are NOT downloaded in this pass — Monday's protected_static URLs need
// signed auth. Each record gets a note pointing back at the Monday item so the
// AM can grab logos manually from the Logos tab if needed.

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const data = JSON.parse(readFileSync(join(__dirname, "monday-data.json"), "utf8"));
const items = data.items.filter((i) => i.column_values?.link_mkv84m88);

console.log(`Found ${items.length} items with Brand Guideline filled in Monday.\n`);

// ---------- Parsers ----------

function parseHexCodes(text) {
  if (!text) return [];
  const matches = text.match(/#[0-9A-Fa-f]{6}/g) ?? [];
  return [...new Set(matches.map((h) => h.toUpperCase()))];
}

function buildColors(color1Text, color2Text, additionalText) {
  const primary = parseHexCodes(color1Text).map((hex, i) => ({
    name: `Primary ${i + 1}`,
    hex,
    role: "primary",
  }));
  const secondary = parseHexCodes(color2Text).map((hex, i) => ({
    name: `Secondary ${i + 1}`,
    hex,
    role: "secondary",
  }));
  // Additional colors may also contain hex codes — treat as secondary.
  const extras = parseHexCodes(additionalText)
    .filter((hex) => ![...primary, ...secondary].some((c) => c.hex === hex))
    .map((hex, i) => ({
      name: `Secondary ${secondary.length + i + 1}`,
      hex,
      role: "secondary",
    }));
  return [...primary, ...secondary, ...extras];
}

function parseFonts(primaryText, secondaryText) {
  const fonts = [];
  if (primaryText && primaryText.trim()) {
    // Common formats:
    //   "Title: BN BERGEN Copy: Interstate Regular"
    //   "BN Bergen / Interstate"
    //   "Proxima Nova"
    const titleCopyMatch = primaryText.match(/title[:\s]+(.+?)\s+copy[:\s]+(.+)/i);
    if (titleCopyMatch) {
      fonts.push({
        name: titleCopyMatch[1].trim(),
        role: "primary",
        use_case: "Headlines, titles",
      });
      fonts.push({
        name: titleCopyMatch[2].trim(),
        role: "secondary",
        use_case: "Body copy",
      });
      return fonts;
    }
    const slashSplit = primaryText.split(/[\/,]|\s+and\s+/i);
    if (slashSplit.length === 2 && slashSplit.every((s) => s.trim().length > 0)) {
      fonts.push({
        name: slashSplit[0].trim(),
        role: "primary",
        use_case: "Headlines, titles",
      });
      fonts.push({
        name: slashSplit[1].trim(),
        role: "secondary",
        use_case: "Body copy",
      });
      return fonts;
    }
    fonts.push({
      name: primaryText.trim(),
      role: "primary",
      use_case: "Headlines, titles",
    });
  }
  if (secondaryText && secondaryText.trim() && !fonts.some((f) => f.role === "secondary")) {
    fonts.push({
      name: secondaryText.trim(),
      role: "secondary",
      use_case: "Body copy",
    });
  }
  return fonts;
}

function extractUrl(linkText) {
  // Monday link column values often look like "Display Text - https://..."
  if (!linkText) return null;
  const match = linkText.match(/https?:\/\/\S+/);
  return match ? match[0] : null;
}

function splitList(text) {
  if (!text) return [];
  return text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// ---------- Vertical inference ----------

// Cheap heuristic — guess vertical from the business name + overview text.
// Keeps records out of the "Other" bucket where possible. AM can fix on review.
function inferVertical(name, overview) {
  const t = `${name} ${overview ?? ""}`.toLowerCase();
  if (/yacht|marine|boat|sportfish|powerboat|charter|marina/.test(t)) return "marine";
  if (/jet|aviation|aircraft/.test(t)) return "private_aviation";
  if (/auto|motorsport|car/.test(t)) return "automotive";
  if (/apartment|residences|residential|community|park (?:apartments|living)/.test(t))
    return "multifamily_residential";
  if (/resort|hospitality|vacation|travel/.test(t)) return "resort_travel";
  if (/stone|tile|landscap|home services|design group|interiors/.test(t)) return "home_services";
  if (/real estate development|developer/.test(t)) return "real_estate_development";
  if (/real estate|realtor|broker/.test(t)) return "real_estate";
  return null;
}

// ---------- Main loop ----------

let inserted = 0;
let skipped = 0;
const errors = [];

for (const item of items) {
  const cv = item.column_values;
  const name = item.name?.trim();
  if (!name) {
    skipped += 1;
    continue;
  }

  // De-dupe: if a brand with this exact business_name already exists, skip.
  const { data: existing } = await supabase
    .from("brands")
    .select("id")
    .eq("business_name", name)
    .limit(1);

  if (existing && existing.length > 0) {
    console.log(`↷ Skipping ${name} — already exists`);
    skipped += 1;
    continue;
  }

  const overview = cv.long_text_Mjj24ZDl?.trim() || null;
  const colors = buildColors(cv.text_Mjj2kdtv, cv.text_1_Mjj2woeO, cv.long_texts67w3m6f);
  const fonts = parseFonts(cv.text_2_Mjj2PJRM, cv.short_text7wntlpr3);
  const moodList = splitList(cv.dropdown_mkpjx25f);
  const genreList = splitList(cv.dropdown_mkpj4adr);

  const logoUrls = cv.files_Mjj2lpXw
    ? cv.files_Mjj2lpXw.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  const internalNote = [
    `Imported from Monday: ${item.url}`,
    logoUrls.length > 0
      ? `Logo files in Monday (${logoUrls.length}) — download manually from Monday and upload via Logos tab:\n  ${logoUrls.join("\n  ")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  const insert = {
    business_name: name,
    overview_client_raw: overview,
    overview_polished: overview, // mirror so it shows in PDF/share until AM polishes
    look_and_feel: cv.long_texti5cdp5gb?.trim() || null,
    what_to_avoid: cv.long_textf2itp495?.trim() || null,
    inspiration_references: cv.link_Mjj24P82?.trim() || null,
    audience_type: cv.long_text9qcmxe7t?.trim() || null,
    brand_voice: cv.long_texti5cdp5gb?.trim() || null,
    music_notes: cv.long_text9c1yj1i3?.trim() || cv.text_2_Mjj2yQkE?.trim() || null,
    music_mood: moodList,
    music_genre: genreList,
    website: cv.short_textl2prmqt6?.trim() || null,
    account_manager: cv.text_Mjj2PgpX?.trim() || null,
    client_asset_folder_url: cv.short_textisdjfc6l?.trim() || null,
    dropbox_folder_url: cv.link_mkqgc924?.trim() || null,
    canva_brand_kit_url: extractUrl(cv.link_mkv84m88),
    vertical: inferVertical(name, overview),
    colors,
    fonts,
    internal_notes: internalNote,
    status: "in_review",
  };

  const { data: brand, error } = await supabase
    .from("brands")
    .insert(insert)
    .select("id, business_name")
    .single();

  if (error) {
    console.error(`✗ Failed: ${name} — ${error.message}`);
    errors.push({ name, error: error.message });
    continue;
  }

  // Activity log entry
  await supabase.from("brand_activity_log").insert({
    brand_id: brand.id,
    event_type: "imported",
    metadata: { source: "monday_import", monday_item_id: item.id, monday_url: item.url },
  });

  console.log(`✓ Imported: ${name}`);
  inserted += 1;
}

console.log(`\n— Done — `);
console.log(`Inserted: ${inserted}`);
console.log(`Skipped (already existed or no name): ${skipped}`);
console.log(`Errors: ${errors.length}`);
if (errors.length > 0) console.log(errors);
