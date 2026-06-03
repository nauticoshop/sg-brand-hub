// Trigger the AM-assigned "👋 You're up" card by running the full chain:
//
//   1. Create a Monday deal in Closed Won
//   2. POST /api/intake with source_deal_id (simulates client submitting the
//      BD's pre-stamped link) — this fires the AM Head card
//   3. POST /api/dev/fire-am-assigned with am_name="Billy Pavlock" — this
//      simulates Justin assigning Billy as the AM, fires the AM-assigned card
//   4. Cleanup
//
// Run: MONDAY_BOARD_ID_DEALS=9889817939 node scripts/_test-am-assigned-card.mjs

import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "./_load-env.mjs";
loadEnv();

const MONDAY_TOKEN = process.env.MONDAY_API_TOKEN;
const DEALS_BOARD_ID = process.env.MONDAY_BOARD_ID_DEALS;
const CLOSED_WON_GROUP_ID = "group_mkv5cdzh";
const APP_BASE = "https://sg-brand-hub.vercel.app";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  SERVICE_KEY,
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
const brandName = `AmAssignedTest-${ts}`;
const dealName = `${brandName} | Sample Project (SAFE TO DELETE)`;
const AM = "Billy Pavlock";

let dealId, brandId;

try {
  console.log("\n╔══════════════════════════════════════════════════════╗");
  console.log("║  Trigger AM-assigned 'You're up' card test           ║");
  console.log("╚══════════════════════════════════════════════════════╝");

  // ── 1. Create Monday deal ────────────────────────────────────────────
  console.log(`\n[1/4] Creating Monday deal: ${dealName}`);
  const cv = {
    color_mkv5rf69: { label: "Recurring" },
    numeric_mkv5d5ew: 6200,
  };
  const created = await mondayFetch(
    `mutation($board: ID!, $group: String!, $name: String!, $cv: JSON) {
      create_item(board_id: $board, group_id: $group, item_name: $name, column_values: $cv) { id }
    }`,
    { board: DEALS_BOARD_ID, group: CLOSED_WON_GROUP_ID, name: dealName, cv: JSON.stringify(cv) }
  );
  dealId = created.create_item.id;
  console.log(`      ✓ deal ${dealId}`);

  // ── 2. POST to /api/intake (simulates client submitting BD's link) ───
  console.log(`\n[2/4] POSTing intake (fires AM Head 'Assign AM' card)…`);
  const intakeRes = await fetch(`${APP_BASE}/api/intake`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      submitter_name: "Test Client",
      submitter_email: "test-client@example.com",
      submitter_phone: "555-0100",
      business_name: brandName,
      website: "https://example.com",
      overview_client_raw: "End-to-end test for the AM-assigned card flow.",
      colors: [],
      fonts: [],
      source_deal_id: dealId,
    }),
  });
  const intakeBody = await intakeRes.json().catch(() => ({}));
  if (!intakeRes.ok) throw new Error(`Intake POST ${intakeRes.status}: ${JSON.stringify(intakeBody).slice(0, 400)}`);
  brandId = intakeBody.id;
  console.log(`      ✓ brand ${brandId}`);
  console.log(`      ✓ AM Head card should have landed in 'Assign AM' space`);

  // ── 3. POST to /api/dev/fire-am-assigned (simulates Justin assigning AM)
  console.log(`\n[3/4] Firing AM-assigned card for AM = "${AM}"…`);
  const fireRes = await fetch(`${APP_BASE}/api/dev/fire-am-assigned`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({ brand_id: brandId, am_name: AM }),
  });
  const fireBody = await fireRes.json().catch(() => ({}));
  if (!fireRes.ok) throw new Error(`fire-am-assigned ${fireRes.status}: ${JSON.stringify(fireBody).slice(0, 400)}`);
  console.log(`      ✓ AM-assigned card should have landed in the Account Managers space`);

  // ── 4. Show what to look for ─────────────────────────────────────────
  console.log(`\n[4/4] Check Google Chat:`);
  console.log(`\n  → 'Assign AM' space (from step 2):`);
  console.log(`      🎯 Assign AM — new retainer client`);
  console.log(`      ${brandName} · $6,200/mo`);
  console.log(`\n  → Account Managers space (from step 3):`);
  console.log(`      👋 You're up — ${brandName}`);
  console.log(`      AM: ${AM}`);
  console.log(`      Body: "Billy Pavlock — open the project request to put this on the schedule."`);
  console.log(`      Deal: $6,200/mo · Recurring`);
  console.log(`      Buttons: [Open project request →] [Open brand] [Open Monday deal]`);

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
