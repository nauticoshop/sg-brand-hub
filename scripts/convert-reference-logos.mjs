#!/usr/bin/env node
// Tries to recover image-format logos for brands whose only attached file is
// a ZIP archive or a single-page PDF logo. Skips multi-page brand guideline
// PDFs and brands with no logos at all — those need manual sourcing.
//
// For ZIPs:  unzip → find PNG/JPG/GIF/WEBP files → upload to Supabase.
// For PDFs:  use macOS `sips` to render page 1 to PNG → upload.
//
// Marks new logos as `logo_type=null` (real logo, not reference).
// Leaves the original reference file in place — doesn't delete anything.
//
// Run: node scripts/convert-reference-logos.mjs

import { createClient } from "@supabase/supabase-js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync, existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, extname, basename } from "node:path";
import { loadEnv } from "./_load-env.mjs";

const exec = promisify(execFile);

loadEnv();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);
const CONTENT_TYPE = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

async function uploadFile(brandId, fileName, buffer, order) {
  const ext = extname(fileName).toLowerCase();
  const safe = fileName.replace(/\s+/g, "-").replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `${brandId}/logo/${Date.now()}-${order}-${safe}`;
  const { error: upErr } = await supabase.storage.from("brand-logos").upload(storagePath, buffer, {
    contentType: CONTENT_TYPE[ext] ?? "application/octet-stream",
    upsert: false,
  });
  if (upErr) throw new Error(`upload: ${upErr.message}`);
  const { data: pub } = supabase.storage.from("brand-logos").getPublicUrl(storagePath);
  const { error: insErr } = await supabase.from("brand_logos").insert({
    brand_id: brandId,
    file_name: fileName,
    file_path: storagePath,
    public_url: pub.publicUrl,
    display_order: order,
    logo_type: null,
  });
  if (insErr) throw new Error(`db insert: ${insErr.message}`);
}

function walkImages(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    // Skip macOS metadata noise.
    if (entry.startsWith("__MACOSX") || entry === ".DS_Store") continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walkImages(full));
    else if (IMAGE_EXT.has(extname(entry).toLowerCase())) out.push(full);
  }
  return out;
}

async function processZip(brand, refLogo) {
  console.log(`▸ ${brand.business_name}: ZIP "${refLogo.file_name}"`);
  const resp = await fetch(refLogo.public_url);
  if (!resp.ok) throw new Error(`download ZIP: HTTP ${resp.status}`);
  const zipBuf = Buffer.from(await resp.arrayBuffer());
  const work = join(tmpdir(), `sg-brand-zip-${brand.id}-${Date.now()}`);
  mkdirSync(work, { recursive: true });
  const zipPath = join(work, "input.zip");
  writeFileSync(zipPath, zipBuf);
  try {
    await exec("unzip", ["-q", "-o", zipPath, "-d", work]);
    const images = walkImages(work);
    if (images.length === 0) {
      console.log(`  (no image files in ZIP — skipping)`);
      return;
    }
    // Limit to a reasonable number; brand guideline ZIPs sometimes have dozens.
    const picks = images.slice(0, 12);
    console.log(`  Extracting ${picks.length} image(s)`);
    let order = 100; // start order high so they sort after any existing files
    for (const path of picks) {
      const name = basename(path);
      const buf = readFileSync(path);
      try {
        await uploadFile(brand.id, name, buf, order);
        console.log(`    ✓ ${name}`);
        order += 1;
      } catch (e) {
        console.log(`    ✗ ${name}: ${e.message}`);
      }
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

async function processPdf(brand, refLogo) {
  console.log(`▸ ${brand.business_name}: PDF "${refLogo.file_name}"`);
  const resp = await fetch(refLogo.public_url);
  if (!resp.ok) throw new Error(`download PDF: HTTP ${resp.status}`);
  const pdfBuf = Buffer.from(await resp.arrayBuffer());
  const work = join(tmpdir(), `sg-brand-pdf-${brand.id}-${Date.now()}`);
  mkdirSync(work, { recursive: true });
  const pdfPath = join(work, "input.pdf");
  const pngPath = join(work, "output.png");
  writeFileSync(pdfPath, pdfBuf);
  try {
    // sips ships with macOS — converts PDF page 1 to PNG.
    await exec("sips", ["-s", "format", "png", pdfPath, "--out", pngPath]);
    if (!existsSync(pngPath)) throw new Error("sips produced no output");
    const buf = readFileSync(pngPath);
    const niceName = refLogo.file_name.replace(/\.pdf$/i, ".png");
    await uploadFile(brand.id, niceName, buf, 100);
    console.log(`  ✓ ${niceName}`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

// ---------- Main ----------

const targets = [
  // ZIP archives — extract images inside
  { name: "Bertram",         kind: "zip" },
  { name: "MAN Engines",     kind: "zip" },
  { name: "Modern Grounds",  kind: "zip" },
  // Logo PDFs — convert page 1 to PNG
  { name: "Vice Marine",     kind: "pdf" },
  // Multi-page brand guideline PDFs — SKIP (too complex to auto-extract specific logos)
  // { name: "Exclusive Vacations",  kind: "pdf-guideline" },
  // { name: "Global Jet Sales",     kind: "pdf-guideline" },
];

for (const t of targets) {
  const { data: brand } = await supabase
    .from("brands")
    .select("id, business_name")
    .eq("business_name", t.name)
    .single();
  if (!brand) { console.log(`✗ ${t.name}: not found`); continue; }

  // Idempotency: skip if this brand already has a real (non-reference) logo.
  const { data: existing } = await supabase
    .from("brand_logos")
    .select("logo_type")
    .eq("brand_id", brand.id);
  const hasReal = (existing ?? []).some((l) => l.logo_type !== "reference");
  if (hasReal) {
    console.log(`↷ ${t.name}: already has a real image logo — skipping`);
    continue;
  }

  const refLogo = (existing ?? []).find((l) => l.logo_type === "reference");
  if (!refLogo) { console.log(`✗ ${t.name}: no reference file found`); continue; }
  // Re-fetch with full fields.
  const { data: full } = await supabase
    .from("brand_logos")
    .select("file_name, public_url")
    .eq("brand_id", brand.id)
    .eq("logo_type", "reference")
    .order("display_order")
    .limit(1)
    .single();

  try {
    if (t.kind === "zip") await processZip(brand, full);
    else if (t.kind === "pdf") await processPdf(brand, full);
  } catch (e) {
    console.log(`  ✗ ${e.message}`);
  }
}

console.log(`\n— Done —`);
