#!/usr/bin/env node
// De-duplicates brand records that were created by /api/import/pdf re-imports
// of brands that already existed (from the original Monday import). For each
// pair with the same normalized name:
//   - Keep the OLDER record (it has logos + AI-polished overview)
//   - Fill empty fields on the older record from the newer one (website,
//     socials, tagline, etc.)
//   - Back up the duplicate record to scripts/dedupe-backup.json
//   - Delete the duplicate (CASCADE drops its activity log)
//
// Run:
//   set -a && source .env.local && set +a && node scripts/dedupe-brands.mjs
//   (use --dry-run to preview without writing)

import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DRY_RUN = process.argv.includes("--dry-run");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

// "MariTeak, LLC" / "Mariteak LLC" → "mariteakllc"
// "VIV St. Pete" / "VIV St Pete" → "vivstpete"
// "Aster & Links" / "Aster and Links" → "asterandlinks"
function normalize(name) {
  if (!name) return "";
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\bthe\b/g, "")
    .replace(/\bllc\b/g, "")
    .replace(/\binc\b/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

const FILL_IF_EMPTY = [
  "website",
  "instagram",
  "facebook",
  "youtube",
  "tiktok",
  "linkedin",
  "tagline",
  "vertical",
  "vertical_other",
  "audience_gender",
  "audience_age",
  "audience_type",
  "brand_voice",
  "look_and_feel",
  "what_to_avoid",
  "inspiration_references",
  "coloring_tone",
  "music_notes",
  "canva_brand_kit_url",
  "dropbox_folder_url",
  "client_asset_folder_url",
];

// Fetch all brands sorted oldest first so the first one we encounter per group
// is the original.
const { data: brands, error } = await supabase
  .from("brands")
  .select("*")
  .order("created_at", { ascending: true });

if (error) {
  console.error("Failed to fetch brands:", error.message);
  process.exit(1);
}

// Group by normalized name
const groups = new Map();
for (const b of brands) {
  const key = normalize(b.business_name);
  if (!key) continue;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(b);
}

const duplicatedGroups = [...groups.entries()].filter(([_, list]) => list.length > 1);

if (duplicatedGroups.length === 0) {
  console.log("✓ No duplicates found. Nothing to do.");
  process.exit(0);
}

console.log(`Found ${duplicatedGroups.length} duplicate groups${DRY_RUN ? " (DRY RUN — no writes)" : ""}:\n`);

const backup = []; // we'll write deleted records here before nuking them
let merged = 0;
let updatedFields = 0;
let deletions = 0;

for (const [key, list] of duplicatedGroups) {
  const original = list[0]; // oldest (has logos, AI-polished data)
  const dupes = list.slice(1);

  console.log(`▸ ${original.business_name} [orig id ${original.id.slice(0, 8)}]`);

  for (const dup of dupes) {
    console.log(`    ↳ dupe: "${dup.business_name}" id ${dup.id.slice(0, 8)} (created ${dup.created_at})`);
    const update = {};
    for (const field of FILL_IF_EMPTY) {
      const origVal = original[field];
      const dupVal = dup[field];
      const origEmpty =
        origVal === null ||
        origVal === undefined ||
        (typeof origVal === "string" && origVal.trim() === "");
      const dupHasValue =
        dupVal !== null &&
        dupVal !== undefined &&
        !(typeof dupVal === "string" && dupVal.trim() === "");
      if (origEmpty && dupHasValue) {
        update[field] = dupVal;
      }
    }

    if (Object.keys(update).length > 0) {
      console.log(`        +fields: ${Object.keys(update).join(", ")}`);
      if (!DRY_RUN) {
        const { error: updErr } = await supabase
          .from("brands")
          .update(update)
          .eq("id", original.id);
        if (updErr) {
          console.log(`        ✗ update failed: ${updErr.message}`);
          continue;
        }
      }
      updatedFields += Object.keys(update).length;
    } else {
      console.log(`        (no new fields to fill)`);
    }

    backup.push(dup);

    if (!DRY_RUN) {
      const { error: delErr } = await supabase.from("brands").delete().eq("id", dup.id);
      if (delErr) {
        console.log(`        ✗ delete failed: ${delErr.message}`);
        continue;
      }
    }

    deletions += 1;
    merged += 1;
  }
}

// Write backup file
if (!DRY_RUN && backup.length > 0) {
  const path = join(__dirname, `dedupe-backup-${Date.now()}.json`);
  writeFileSync(path, JSON.stringify(backup, null, 2));
  console.log(`\n📦 Backup of deleted records → ${path}`);
}

console.log(`\n— Done${DRY_RUN ? " (DRY RUN)" : ""} —`);
console.log(`Pairs merged:       ${merged}`);
console.log(`Field fills:        ${updatedFields}`);
console.log(`Duplicates removed: ${deletions}`);
