// End-to-end test for the simplified Closed Won webhook.
//
// New flow (no auto brand creation, no auto brief seeding):
//   - new_client       → DM BD with intake link + CFO + credit
//   - returning_client → DM AM with project request link + CFO + credit
//   - same_deal        → idempotent no-op
//
// Scenarios:
//   1. NEW client, single Content service  → kind=new_client, NO brand row created
//   2. RETURNING client (manually pre-seeded brand) → kind=returning_client, brand matched
//   3. NEW client, multi-service (Content + Social Media) → kind=new_client (skipped if column missing)
//   4. Webhook idempotency → kind=same_deal on re-fire
//
// Run: MONDAY_BOARD_ID_DEALS=9889817939 node scripts/_test-closed-won-scenarios.mjs

import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "./_load-env.mjs";
loadEnv();

const MONDAY_TOKEN = process.env.MONDAY_API_TOKEN;
const DEALS_BOARD_ID = process.env.MONDAY_BOARD_ID_DEALS;
const CLOSED_WON_GROUP_ID = "group_mkv5cdzh";
const WEBHOOK_URL = "https://sg-brand-hub.vercel.app/api/webhooks/monday/deal-closed";

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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const createdMondayItems = [];
const createdBrandIds = new Set();
const dispatchedDealIds = new Set();

async function fireWebhook(pulseId) {
  const payload = {
    event: {
      type: "move_pulse_into_group",
      pulseId: Number(pulseId),
      boardId: Number(DEALS_BOARD_ID),
      groupId: CLOSED_WON_GROUP_ID,
      previousGroupId: "topics",
    },
  };
  const res = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json };
}

async function createDeal({ name, dealType = "Recurring", value = 5000, serviceTypeColumnId = null, services = null }) {
  const cv = { color_mkv5rf69: { label: dealType }, numeric_mkv5d5ew: value };
  if (serviceTypeColumnId && services) {
    cv[serviceTypeColumnId] = { labels: services };
  }
  const data = await mondayFetch(
    `mutation($board: ID!, $group: String!, $name: String!, $cv: JSON) {
      create_item(board_id: $board, group_id: $group, item_name: $name, column_values: $cv) { id }
    }`,
    { board: DEALS_BOARD_ID, group: CLOSED_WON_GROUP_ID, name, cv: JSON.stringify(cv) }
  );
  const id = data.create_item.id;
  createdMondayItems.push(id);
  return id;
}

async function findServiceTypeColumn() {
  const data = await mondayFetch(
    `query($id: [ID!]) { boards(ids: $id) { columns { id title type } } }`,
    { id: DEALS_BOARD_ID }
  );
  return data.boards[0].columns.find(
    (c) => c.title.trim().toLowerCase() === "service type"
  );
}

async function preSeedBrand({ businessName, accountManager = null }) {
  const { data, error } = await supabase
    .from("brands")
    .insert({
      business_name: businessName,
      submitter_name: "Test BD",
      submitter_email: "bd-test@surroundingsgroup.com",
      account_manager: accountManager,
      status: "approved",
      engagement_type: "retainer",
    })
    .select("id, business_name, account_manager")
    .single();
  if (error) throw new Error(`pre-seed brand failed: ${error.message}`);
  createdBrandIds.add(data.id);
  return data;
}

async function countBrandsByName(businessName) {
  const { data, error } = await supabase
    .from("brands")
    .select("id, business_name")
    .eq("business_name", businessName);
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function getDispatch(dealId) {
  const { data } = await supabase
    .from("closed_won_dispatches")
    .select("monday_deal_id, brand_id, kind, dispatched_at")
    .eq("monday_deal_id", dealId)
    .maybeSingle();
  return data;
}

function report(label, ok, detail) {
  const icon = ok ? "✓" : "✗";
  console.log(`    ${icon} ${label}${detail ? ` — ${detail}` : ""}`);
}

async function teardown() {
  console.log("\n[cleanup] Removing test artifacts…");
  for (const dealId of dispatchedDealIds) {
    const { error } = await supabase.from("closed_won_dispatches").delete().eq("monday_deal_id", dealId);
    console.log(`  dispatch ${dealId}: ${error ? "✗ " + error.message : "✓"}`);
  }
  for (const brandId of createdBrandIds) {
    const { error } = await supabase.from("brands").delete().eq("id", brandId);
    console.log(`  brand ${brandId.slice(0, 8)}: ${error ? "✗ " + error.message : "✓"}`);
  }
  for (const itemId of createdMondayItems) {
    try {
      await mondayFetch(`mutation($id: ID!) { delete_item(item_id: $id) { id } }`, { id: itemId });
      console.log(`  Monday item ${itemId}: ✓`);
    } catch (e) {
      console.log(`  Monday item ${itemId}: ✗ ${e.message}`);
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────

console.log("\n╔══════════════════════════════════════════════════════════════════════╗");
console.log("║  Closed Won webhook · simplified flow scenario tests                 ║");
console.log("╚══════════════════════════════════════════════════════════════════════╝");

try {
  const serviceCol = await findServiceTypeColumn();
  console.log(
    serviceCol
      ? `\n[setup] Service Type column found: ${serviceCol.id} (type: ${serviceCol.type})`
      : `\n[setup] Service Type column NOT found — multi-service test will be skipped.`
  );

  const ts = new Date().toISOString().slice(0, 19);

  // ──────────────────────────────────────────────────────────────────
  // SCENARIO 1: NEW client — no brand should be created, just notifications
  // ──────────────────────────────────────────────────────────────────
  console.log("\n┌─────────────────────────────────────────────────────────────────────┐");
  console.log("│ TEST 1 — NEW client (BD intake DM, no brand auto-create)            │");
  console.log("└─────────────────────────────────────────────────────────────────────┘");

  const brandName1 = `TestBrand-${ts}-Alpha`;
  const dealName1 = `${brandName1} | Webhook Test Project (SAFE TO DELETE)`;
  console.log(`\n  Creating deal: ${dealName1}`);
  const deal1 = await createDeal({ name: dealName1, dealType: "Recurring", value: 4500 });
  console.log(`  Monday deal: ${deal1}`);

  console.log("\n  Firing webhook…");
  const r1 = await fireWebhook(deal1);
  dispatchedDealIds.add(deal1);
  console.log(`    Status: ${r1.status}  kind: ${r1.body.kind}  deal: ${r1.body.deal_name}`);

  const brandsByName1 = await countBrandsByName(brandName1);
  const dispatch1 = await getDispatch(deal1);

  console.log("\n  Assertions:");
  report("Returned kind === 'new_client'", r1.body.kind === "new_client", `got: ${r1.body.kind}`);
  report("brand_id is null in response", r1.body.brand_id === null, `got: ${r1.body.brand_id}`);
  report("NO brand row was created in DB", brandsByName1.length === 0, `count: ${brandsByName1.length}`);
  report("closed_won_dispatches row written", !!dispatch1, dispatch1?.kind);
  report("Dispatch row kind = 'new_client'", dispatch1?.kind === "new_client", dispatch1?.kind);
  report("Dispatch row brand_id is null", dispatch1?.brand_id === null, dispatch1?.brand_id);

  // ──────────────────────────────────────────────────────────────────
  // SCENARIO 2: RETURNING client — pre-seed a brand, then fire deal
  // ──────────────────────────────────────────────────────────────────
  console.log("\n┌─────────────────────────────────────────────────────────────────────┐");
  console.log("│ TEST 2 — RETURNING client (matches pre-seeded brand)                │");
  console.log("└─────────────────────────────────────────────────────────────────────┘");

  const brandName2 = `TestBrand-${ts}-Bravo`;
  console.log(`\n  Pre-seeding brand: ${brandName2} (AM: Justin Tarr)`);
  const seededBrand = await preSeedBrand({ businessName: brandName2, accountManager: "Justin Tarr" });
  console.log(`  Brand id: ${seededBrand.id}`);

  const dealName2 = `${brandName2} | Add-on Project (SAFE TO DELETE)`;
  console.log(`\n  Creating deal: ${dealName2}`);
  const deal2 = await createDeal({ name: dealName2, dealType: "One Time", value: 7500 });

  console.log("\n  Firing webhook…");
  const r2 = await fireWebhook(deal2);
  dispatchedDealIds.add(deal2);
  console.log(`    Status: ${r2.status}  kind: ${r2.body.kind}  brand_id: ${r2.body.brand_id}`);

  const brandsByName2 = await countBrandsByName(brandName2);
  const dispatch2 = await getDispatch(deal2);

  console.log("\n  Assertions:");
  report("Returned kind === 'returning_client'", r2.body.kind === "returning_client", `got: ${r2.body.kind}`);
  report("Matched the pre-seeded brand", r2.body.brand_id === seededBrand.id, r2.body.brand_id);
  report("Still only 1 brand by that name (no dupe)", brandsByName2.length === 1, `count: ${brandsByName2.length}`);
  report("Dispatch row kind = 'returning_client'", dispatch2?.kind === "returning_client", dispatch2?.kind);
  report("Dispatch row brand_id matches", dispatch2?.brand_id === seededBrand.id, dispatch2?.brand_id);

  // ──────────────────────────────────────────────────────────────────
  // SCENARIO 3: NEW client, multi-service (only if column exists)
  // ──────────────────────────────────────────────────────────────────
  if (serviceCol) {
    console.log("\n┌─────────────────────────────────────────────────────────────────────┐");
    console.log("│ TEST 3 — NEW client, MULTI-service (Content + Social Media)        │");
    console.log("└─────────────────────────────────────────────────────────────────────┘");

    const brandName3 = `TestBrand-${ts}-Charlie`;
    const dealName3 = `${brandName3} | Combo Deal Content+Social (SAFE TO DELETE)`;
    console.log(`\n  Creating deal: ${dealName3}`);
    const deal3 = await createDeal({
      name: dealName3,
      dealType: "One Time",
      value: 9000,
      serviceTypeColumnId: serviceCol.id,
      services: ["Content", "Social Media"],
    });
    console.log(`  Monday deal: ${deal3}`);

    console.log("\n  Firing webhook…");
    const r3 = await fireWebhook(deal3);
    dispatchedDealIds.add(deal3);
    console.log(`    Status: ${r3.status}  kind: ${r3.body.kind}  services: ${(r3.body.services ?? []).join(", ")}`);

    const brandsByName3 = await countBrandsByName(brandName3);

    console.log("\n  Assertions:");
    report("Returned kind === 'new_client'", r3.body.kind === "new_client", `got: ${r3.body.kind}`);
    report("Both services reflected in response", (r3.body.services ?? []).length === 2, `services: ${(r3.body.services ?? []).join(", ")}`);
    report("Services include 'Content'", (r3.body.services ?? []).includes("Content"));
    report("Services include 'Social Media'", (r3.body.services ?? []).includes("Social Media"));
    report("NO brand row was auto-created", brandsByName3.length === 0, `count: ${brandsByName3.length}`);
  } else {
    console.log("\n[Test 3 SKIPPED — add Service Type Dropdown column to Deals board]");
  }

  // ──────────────────────────────────────────────────────────────────
  // SCENARIO 4: webhook re-fire — verify same_deal idempotency
  // ──────────────────────────────────────────────────────────────────
  console.log("\n┌─────────────────────────────────────────────────────────────────────┐");
  console.log("│ TEST 4 — Webhook idempotency (re-fire Test 1's deal)                │");
  console.log("└─────────────────────────────────────────────────────────────────────┘");

  console.log("\n  Re-firing Test 1's webhook…");
  const r4 = await fireWebhook(deal1);
  console.log(`    Status: ${r4.status}  kind: ${r4.body.kind}  note: ${r4.body.note ?? ""}`);

  console.log("\n  Assertions:");
  report("Returned kind === 'same_deal'", r4.body.kind === "same_deal", `got: ${r4.body.kind}`);

  console.log("\n[Google Chat side — manually verify]");
  console.log("  BD webhook (or AMs fallback):");
  console.log("    🎉 'Closed Won — new client' cards from Tests 1 + 3 with intake link buttons");
  console.log("  AMs webhook:");
  console.log("    📦 'Closed Won — returning client' card from Test 2 (mentions Justin Tarr as AM)");
  console.log("    🎉 Credit cards from any deals where Deal Identifier column was populated");
  console.log("  CFO webhook:");
  console.log("    💰 Cards from Tests 1, 2, 3 (different copy for new vs returning)");

} catch (e) {
  console.error("\nTest run threw:", e);
} finally {
  await teardown();
  console.log("\n=== All tests done ===\n");
}
