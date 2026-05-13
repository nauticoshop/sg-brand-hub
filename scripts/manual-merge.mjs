#!/usr/bin/env node
// Targeted merge for 3 pairs the auto-dedup couldn't catch because the names
// differ too much (one has a descriptor word the other lacks).
//
// Rules per pair:
//   - Keep the brand with the most data (logos + polished overview).
//   - Fill empty fields from the other one.
//   - OVERRIDE overview_polished if the keeper's overview is broken
//     (<50 chars — happens to Solana, which polished badly).
//   - Back up the deleted record.

import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const PAIRS = [
  { keep: "Bertram", drop: "Bertram Yachts" },
  { keep: "Ryan Hughes Design", drop: "Ryan Hughes Design Build" },
  { keep: "Solana", drop: "Solana Outdoor Living" },
];

const FILL_IF_EMPTY = [
  "website", "instagram", "facebook", "youtube", "tiktok", "linkedin",
  "tagline", "vertical_other", "audience_gender", "audience_age", "audience_type",
  "brand_voice", "look_and_feel", "what_to_avoid", "inspiration_references",
  "coloring_tone", "music_notes", "canva_brand_kit_url", "dropbox_folder_url",
  "client_asset_folder_url",
];

const backup = [];

for (const { keep, drop } of PAIRS) {
  const { data: keepRow } = await supabase.from("brands").select("*").eq("business_name", keep).single();
  const { data: dropRow } = await supabase.from("brands").select("*").eq("business_name", drop).single();
  if (!keepRow || !dropRow) {
    console.log(`✗ Could not find both: "${keep}" / "${drop}"`);
    continue;
  }

  console.log(`▸ Merging "${drop}" into "${keep}"`);
  const update = {};

  for (const field of FILL_IF_EMPTY) {
    const k = keepRow[field];
    const d = dropRow[field];
    const kEmpty = k === null || k === undefined || (typeof k === "string" && k.trim() === "");
    const dHasValue = d !== null && d !== undefined && !(typeof d === "string" && d.trim() === "");
    if (kEmpty && dHasValue) update[field] = d;
  }

  // Special case: overview_polished — replace if keeper has a broken/short version.
  const keepOverview = keepRow.overview_polished?.trim() ?? "";
  const dropOverview = dropRow.overview_polished?.trim() ?? "";
  if (keepOverview.length < 50 && dropOverview.length >= 50) {
    update.overview_polished = dropOverview;
    update.overview_client_raw = dropRow.overview_client_raw || keepRow.overview_client_raw;
  }

  if (Object.keys(update).length > 0) {
    console.log(`    +fields: ${Object.keys(update).join(", ")}`);
    const { error } = await supabase.from("brands").update(update).eq("id", keepRow.id);
    if (error) {
      console.log(`    ✗ update failed: ${error.message}`);
      continue;
    }
  } else {
    console.log(`    (no new fields to fill)`);
  }

  backup.push(dropRow);
  const { error: delErr } = await supabase.from("brands").delete().eq("id", dropRow.id);
  if (delErr) {
    console.log(`    ✗ delete failed: ${delErr.message}`);
    continue;
  }
  console.log(`    ✓ deleted "${drop}"`);
}

if (backup.length > 0) {
  const path = join(__dirname, `manual-merge-backup-${Date.now()}.json`);
  writeFileSync(path, JSON.stringify(backup, null, 2));
  console.log(`\n📦 Backup → ${path}`);
}
