#!/usr/bin/env node
// Pulls each brand's logo files from Monday (via pre-fetched signed S3 URLs in
// scripts/monday-assets.json) and uploads them to Supabase Storage. Creates
// brand_logos rows.
//
// Run:
//   node --env-file=.env.local scripts/migrate-logos.mjs

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const mondayData = JSON.parse(readFileSync(join(__dirname, "monday-data.json"), "utf8"));
const assets = JSON.parse(readFileSync(join(__dirname, "monday-assets.json"), "utf8"));

// Classify each asset:
//   "logo"      → image formats we can display in the dashboard / share page
//   "reference" → PDFs / archives / source files — keep but flag separately
//   "skip"      → videos and other non-asset files
function classify(ext) {
  const e = (ext || "").toLowerCase();
  if ([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"].includes(e)) return "logo";
  if ([".ai", ".eps"].includes(e)) return "logo"; // source files — keep, no preview
  if ([".pdf", ".zip", ".rar", ".7z", ".doc", ".docx", ".ppt", ".pptx"].includes(e))
    return "reference";
  if ([".mp4", ".mov", ".avi"].includes(e)) return "skip";
  return "reference";
}

function contentTypeFor(ext) {
  const map = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".ai": "application/postscript",
    ".eps": "application/postscript",
    ".pdf": "application/pdf",
    ".zip": "application/zip",
  };
  return map[(ext || "").toLowerCase()] || "application/octet-stream";
}

// Match Monday item names to Supabase brand records.
const { data: brands } = await supabase
  .from("brands")
  .select("id, business_name")
  .order("created_at", { ascending: true });

const brandByName = new Map(brands.map((b) => [b.business_name.trim().toLowerCase(), b]));

// Build map: Monday item name → [{assetId, fileName, ext, url, kind}]
const itemAssets = new Map();
for (const item of mondayData.items) {
  const raw = item.column_values?.files_Mjj2lpXw;
  if (!raw || typeof raw !== "string") continue;
  const ids = [...raw.matchAll(/\/resources\/(\d+)\//g)].map((m) => m[1]);
  const list = [];
  for (const id of ids) {
    const asset = assets[id];
    if (!asset) continue;
    const kind = classify(asset.ext);
    if (kind === "skip") continue;
    list.push({
      assetId: id,
      fileName: asset.name,
      ext: asset.ext,
      url: asset.url,
      kind,
    });
  }
  if (list.length > 0) itemAssets.set(item.name, list);
}

console.log(`Brands with logo assets in Monday: ${itemAssets.size}`);
console.log();

let uploaded = 0;
let skipped = 0;
let errors = [];

for (const [mondayName, files] of itemAssets) {
  const brand = brandByName.get(mondayName.trim().toLowerCase());
  if (!brand) {
    console.log(`✗ No matching brand found for "${mondayName}" — skipping`);
    skipped += 1;
    continue;
  }

  // Skip if this brand already has logos (idempotent re-runs).
  const { count } = await supabase
    .from("brand_logos")
    .select("id", { count: "exact", head: true })
    .eq("brand_id", brand.id);
  if ((count ?? 0) > 0) {
    console.log(`↷ ${mondayName} already has ${count} logo(s) — skipping`);
    continue;
  }

  console.log(`→ ${mondayName} (${files.length} files)`);

  let order = 0;
  for (const file of files) {
    try {
      const resp = await fetch(file.url);
      if (!resp.ok) {
        console.log(`   ✗ Download failed (${resp.status}): ${file.fileName}`);
        errors.push({ brand: mondayName, file: file.fileName, error: `HTTP ${resp.status}` });
        continue;
      }
      const buffer = Buffer.from(await resp.arrayBuffer());
      const safeName = file.fileName.replace(/\s+/g, "-").replace(/[^a-zA-Z0-9._-]/g, "_");
      const subPath = file.kind === "reference" ? "reference" : "logo";
      const storagePath = `${brand.id}/${subPath}/${Date.now()}-${order}-${safeName}`;

      const { error: upErr } = await supabase.storage
        .from("brand-logos")
        .upload(storagePath, buffer, {
          contentType: contentTypeFor(file.ext),
          upsert: false,
        });
      if (upErr) {
        console.log(`   ✗ Upload failed: ${file.fileName} — ${upErr.message}`);
        errors.push({ brand: mondayName, file: file.fileName, error: upErr.message });
        continue;
      }

      const { data: pub } = supabase.storage.from("brand-logos").getPublicUrl(storagePath);
      const { error: insErr } = await supabase.from("brand_logos").insert({
        brand_id: brand.id,
        file_name: file.fileName,
        file_path: storagePath,
        public_url: pub.publicUrl,
        display_order: order,
        logo_type: file.kind === "reference" ? "reference" : null,
      });
      if (insErr) {
        console.log(`   ✗ DB insert failed: ${file.fileName} — ${insErr.message}`);
        errors.push({ brand: mondayName, file: file.fileName, error: insErr.message });
        continue;
      }

      console.log(`   ✓ ${file.fileName} [${file.kind}]`);
      uploaded += 1;
      order += 1;
    } catch (e) {
      console.log(`   ✗ Error: ${file.fileName} — ${e.message}`);
      errors.push({ brand: mondayName, file: file.fileName, error: e.message });
    }
  }
}

console.log(`\n— Done —`);
console.log(`Uploaded: ${uploaded}`);
console.log(`Brands skipped (no matching record): ${skipped}`);
console.log(`Errors: ${errors.length}`);
if (errors.length > 0) console.log(JSON.stringify(errors, null, 2));
