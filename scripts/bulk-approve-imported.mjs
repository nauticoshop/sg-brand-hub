#!/usr/bin/env node
// Bulk-mark the 29 brands that were imported from Monday as `approved`.
// Also sets monday_all_projects_item_id='external' so the Approve & Sync
// flow knows the All Projects work was already done outside this tool
// and skips creating duplicate Rendi tasks.
//
// Filter: brands that have a monday_intake_item_id set (i.e. came from
// the Monday import) and are not already approved.
//
// Run:
//   set -a && source .env.local && set +a && node scripts/bulk-approve-imported.mjs

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const { data: brands, error } = await supabase
  .from("brands")
  .select("id, business_name, status, monday_all_projects_item_id")
  .not("monday_intake_item_id", "is", null);

if (error) {
  console.error("Failed to fetch brands:", error.message);
  process.exit(1);
}

console.log(`Found ${brands.length} brands imported from Monday.\n`);

const now = new Date().toISOString();
let updated = 0;

for (const b of brands) {
  const patch = {};
  if (b.status !== "approved") {
    patch.status = "approved";
    patch.approved_at = now;
  }
  if (!b.monday_all_projects_item_id) {
    patch.monday_all_projects_item_id = "external";
  }
  if (Object.keys(patch).length === 0) {
    console.log(`↷ ${b.business_name} already set`);
    continue;
  }
  const { error: updErr } = await supabase.from("brands").update(patch).eq("id", b.id);
  if (updErr) {
    console.log(`✗ ${b.business_name}: ${updErr.message}`);
    continue;
  }
  await supabase.from("brand_activity_log").insert({
    brand_id: b.id,
    event_type: "bulk_approved",
    metadata: { source: "monday_import", note: "marked approved + all-projects sentinel" },
  });
  console.log(`✓ ${b.business_name} → approved${patch.monday_all_projects_item_id ? " (external)" : ""}`);
  updated += 1;
}

console.log(`\n— Done — Updated ${updated} / ${brands.length}`);
