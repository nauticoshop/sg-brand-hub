// Trigger the AM Head "Assign AM" card by simulating the chain end-to-end:
//
//   1. Create a Monday deal in the Closed Won group
//   2. POST to /api/intake with source_deal_id set (as if a BD's pre-stamped
//      link was used by the client)
//   3. Server creates the brand, detects source_deal_id, fires DM to
//      Justin's Assign AM webhook
//   4. Clean up: delete brand + Monday item
//
// Run: MONDAY_BOARD_ID_DEALS=9889817939 node scripts/_test-am-head-card.mjs

import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "./_load-env.mjs";
loadEnv();

const MONDAY_TOKEN = process.env.MONDAY_API_TOKEN;
const DEALS_BOARD_ID = process.env.MONDAY_BOARD_ID_DEALS;
const CLOSED_WON_GROUP_ID = "group_mkv5cdzh";
const INTAKE_URL = "https://sg-brand-hub.vercel.app/api/intake";

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

const ts = new Date().toISOString().slice(0, 19);
const brandName = `AmHeadTest-${ts}`;
const dealName = `${brandName} | Sample Project (SAFE TO DELETE)`;

let dealId, brandId;

try {
  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log("║  Trigger AM Head 'Assign AM' card test               ║");
  console.log("╚══════════════════════════════════════════════════════╝");

  // ── 1. Create Monday deal ────────────────────────────────────────────
  console.log(`\n[1/4] Creating Monday deal: ${dealName}`);
  const cv = {
    color_mkv5rf69: { label: "Recurring" }, // Recurring → Justin's card will say "retainer"
    numeric_mkv5d5ew: 5500,                  // $5,500/mo
  };
  const created = await mondayFetch(
    `mutation($board: ID!, $group: String!, $name: String!, $cv: JSON) {
      create_item(board_id: $board, group_id: $group, item_name: $name, column_values: $cv) { id }
    }`,
    { board: DEALS_BOARD_ID, group: CLOSED_WON_GROUP_ID, name: dealName, cv: JSON.stringify(cv) }
  );
  dealId = created.create_item.id;
  console.log(`      ✓ deal ${dealId}`);

  // ── 2. POST to /api/intake with source_deal_id ───────────────────────
  console.log(`\n[2/4] POSTing intake form with source_deal_id=${dealId}`);
  const payload = {
    submitter_name: "Test Client",
    submitter_email: "test-client@example.com",
    submitter_phone: "555-0100",
    business_name: brandName,
    website: "https://example.com",
    overview_client_raw: "End-to-end test for the Assign AM card flow.",
    colors: [],
    fonts: [],
    source_deal_id: dealId,
  };
  const res = await fetch(INTAKE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Intake POST ${res.status}: ${JSON.stringify(body).slice(0, 400)}`);
  }
  brandId = body.id;
  console.log(`      ✓ brand ${brandId}`);

  // ── 3. Verify the brand row was created with deal stamp ──────────────
  console.log(`\n[3/4] Verifying brand row in DB`);
  const { data: brand } = await supabase
    .from("brands")
    .select("id, business_name, source_deal_id, source_deal_url, account_manager")
    .eq("id", brandId)
    .single();
  console.log(`      business_name:     ${brand?.business_name}`);
  console.log(`      source_deal_id:    ${brand?.source_deal_id}`);
  console.log(`      source_deal_url:   ${brand?.source_deal_url}`);
  console.log(`      account_manager:   ${brand?.account_manager ?? "(null — Justin will assign)"}`);

  console.log(`\n[4/4] Check Google Chat → 'Assign AM' space`);
  console.log(`      Expected card:`);
  console.log(`        🎯 Assign AM — new retainer client`);
  console.log(`        ${brandName} · $5,500/mo`);
  console.log(`        Body: "Client just submitted intake. Justin Tarr, assign an AM..."`);
  console.log(`        Buttons: [Open brand → assign AM] [Open Monday deal]`);
  console.log(`\n      The 'Open brand → assign AM' button will deep-link to the brand`);
  console.log(`      editor at /brand/${brandId}.`);

} catch (e) {
  console.error("\n✗ Test failed:", e.message);
} finally {
  console.log("\n[cleanup] Removing test artifacts…");
  if (brandId) {
    const { error } = await supabase.from("brands").delete().eq("id", brandId);
    console.log(`  brand ${brandId.slice(0, 8)}: ${error ? "✗ " + error.message : "✓"}`);
  }
  if (dealId) {
    try {
      await mondayFetch(`mutation($id: ID!) { delete_item(item_id: $id) { id } }`, { id: dealId });
      console.log(`  Monday item ${dealId}: ✓`);
    } catch (e) {
      console.log(`  Monday item ${dealId}: ✗ ${e.message}`);
    }
  }
  console.log("\n=== Done ===\n");
}
