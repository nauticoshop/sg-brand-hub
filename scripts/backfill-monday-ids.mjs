#!/usr/bin/env node
// Backfills `monday_intake_item_id` on brands that were imported from Monday.
// Source of truth: brand_activity_log rows with event_type='imported' and
// metadata.monday_item_id set.
//
// Run:
//   set -a && source .env.local && set +a && node scripts/backfill-monday-ids.mjs

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const { data: logs, error } = await supabase
  .from("brand_activity_log")
  .select("brand_id, metadata")
  .eq("event_type", "imported")
  .order("created_at", { ascending: true });

if (error) {
  console.error("Failed to fetch activity log:", error.message);
  process.exit(1);
}

const updates = new Map(); // brand_id -> monday_item_id
for (const row of logs) {
  const mid = row.metadata?.monday_item_id;
  if (mid && !updates.has(row.brand_id)) {
    updates.set(row.brand_id, String(mid));
  }
}

console.log(`Found ${updates.size} brands with Monday item IDs in activity log.\n`);

let updated = 0;
let skipped = 0;

for (const [brandId, mondayId] of updates) {
  const { data: brand } = await supabase
    .from("brands")
    .select("business_name, monday_intake_item_id")
    .eq("id", brandId)
    .single();
  if (!brand) {
    console.log(`✗ Brand not found: ${brandId.slice(0, 8)}`);
    continue;
  }
  if (brand.monday_intake_item_id) {
    console.log(`↷ ${brand.business_name} already has monday_intake_item_id=${brand.monday_intake_item_id}`);
    skipped += 1;
    continue;
  }
  const { error: updErr } = await supabase
    .from("brands")
    .update({ monday_intake_item_id: mondayId })
    .eq("id", brandId);
  if (updErr) {
    console.log(`✗ ${brand.business_name}: ${updErr.message}`);
    continue;
  }
  console.log(`✓ ${brand.business_name} ← ${mondayId}`);
  updated += 1;
}

console.log(`\n— Done —`);
console.log(`Updated: ${updated}`);
console.log(`Skipped (already set): ${skipped}`);
