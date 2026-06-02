// End-to-end smoke test for the S6 Closed Won webhook.
//
// 1. Creates a test deal item in Monday's Deals - new board (in the Closed
//    Won group) so the deal-fetcher has something real to fetch.
// 2. POSTs a synthetic Monday webhook payload to our endpoint pointing at
//    that pulseId.
// 3. Polls the Brand Hub DB to confirm the brand draft was created.
// 4. Reports what happened so we can verify Google Chat cards visually.
// 5. Cleans up: deletes the Monday test deal AND the Brand Hub test brand.

import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "./_load-env.mjs";
loadEnv();

const MONDAY_TOKEN = process.env.MONDAY_API_TOKEN;
const DEALS_BOARD_ID = process.env.MONDAY_BOARD_ID_DEALS;
const CLOSED_WON_GROUP_ID = "group_mkv5cdzh";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

async function mondayFetch(query, variables) {
  const res = await fetch("https://api.monday.com/v2", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: MONDAY_TOKEN, "API-Version": "2024-10" },
    body: JSON.stringify({ query, variables }),
  });
  const body = await res.json();
  if (body.errors) throw new Error(JSON.stringify(body.errors));
  return body.data;
}

async function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

const testItemName = `Webhook Test - ${new Date().toISOString().slice(0, 19)} - SAFE TO DELETE`;

console.log("\n=== S6 Closed Won webhook smoke test ===\n");

console.log("[1/5] Creating Monday test deal in Closed Won group…");
// Set Deal Type to "Recurring" so we test the retainer routing
const columnValues = JSON.stringify({
  color_mkv5rf69: { label: "Recurring" },
  numeric_mkv5d5ew: 1234,
});
const create = await mondayFetch(
  `mutation($board: ID!, $group: String!, $name: String!, $cv: JSON) {
    create_item(board_id: $board, group_id: $group, item_name: $name, column_values: $cv) {
      id
      name
    }
  }`,
  { board: DEALS_BOARD_ID, group: CLOSED_WON_GROUP_ID, name: testItemName, cv: columnValues }
);
const pulseId = create.create_item.id;
console.log(`    Monday item id: ${pulseId}`);
console.log(`    Monday URL:     https://nauticalnetwork.monday.com/boards/${DEALS_BOARD_ID}/pulses/${pulseId}`);

console.log("\n[2/5] Firing synthetic webhook payload…");
const payload = {
  event: {
    type: "move_pulse_into_group",
    pulseId: Number(pulseId),
    boardId: Number(DEALS_BOARD_ID),
    groupId: CLOSED_WON_GROUP_ID,
    previousGroupId: "topics",
  },
};
const res = await fetch("https://sg-brand-hub.vercel.app/api/webhooks/monday/deal-closed", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),
});
const json = await res.json().catch(() => ({}));
console.log(`    Status:   ${res.status}`);
console.log(`    Response: ${JSON.stringify(json)}`);

console.log("\n[3/5] Polling Supabase for the new brand draft…");
let brandRow = null;
for (let i = 0; i < 8; i++) {
  await sleep(500);
  const { data } = await supabase
    .from("brands")
    .select("id, business_name, status, engagement_type, submitter_name, submitter_email, source_deal_id, source_deal_url, internal_notes, created_at")
    .eq("source_deal_id", pulseId)
    .maybeSingle();
  if (data) { brandRow = data; break; }
}

if (!brandRow) {
  console.log("    ✗ No brand row found after 4s — check Vercel logs.");
} else {
  console.log("    ✓ Brand draft created:");
  console.log(`        id              ${brandRow.id}`);
  console.log(`        business_name   ${brandRow.business_name}`);
  console.log(`        status          ${brandRow.status}`);
  console.log(`        engagement_type ${brandRow.engagement_type}`);
  console.log(`        submitter_name  ${brandRow.submitter_name ?? "(null)"}`);
  console.log(`        submitter_email ${brandRow.submitter_email ?? "(null)"}`);
  console.log(`        source_deal_id  ${brandRow.source_deal_id}`);
  console.log(`        source_deal_url ${brandRow.source_deal_url}`);
  console.log(`\n        internal_notes:\n${brandRow.internal_notes?.split("\n").map(l => "          " + l).join("\n")}`);
}

console.log("\n[4/5] Quick Google Chat sanity — webhook should have sent 3 cards.");
console.log("    Check the Brand Hub Intakes space for:");
console.log("      🎯 'Closed Won — assign an AM' (test item, Recurring → Retainer AM)");
console.log("      💰 'Closed Won — invoice ready' ($1,234)");
console.log("      🌟 'New brand draft (from sales)'");

console.log("\n[5/5] Cleaning up…");
if (brandRow) {
  const { error: delBrand } = await supabase.from("brands").delete().eq("id", brandRow.id);
  console.log(`    Brand draft deleted: ${delBrand ? "✗ " + delBrand.message : "✓"}`);
}
try {
  await mondayFetch(`mutation($id: ID!) { delete_item(item_id: $id) { id } }`, { id: pulseId });
  console.log(`    Monday test deal deleted: ✓`);
} catch (e) {
  console.log(`    Monday test deal delete failed: ✗ ${e.message}`);
  console.log(`    Manually delete: https://nauticalnetwork.monday.com/boards/${DEALS_BOARD_ID}/pulses/${pulseId}`);
}

console.log("\n=== Test complete ===\n");
