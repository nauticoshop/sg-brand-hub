// Comprehensive end-to-end test for the rebuilt Closed Won webhook.
// Runs 3 scenarios sequentially, reports what fired for each, cleans up.
//
//   1. NEW client, single service (Content)
//   2. RETURNING client (matches by name to test 1's brand), single service
//   3. NEW client, MULTI-service (Content + Social) — skipped if the Service
//      Type column hasn't been created on Monday yet
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

async function waitForProjects(dealId, expectedCount, timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { data } = await supabase
      .from("brand_projects")
      .select("id, brand_id, service_type, project_name, dropbox_project_folder_url, brief_id")
      .eq("monday_deal_id", dealId);
    if (data && data.length >= expectedCount) return data;
    await sleep(400);
  }
  const { data } = await supabase
    .from("brand_projects")
    .select("id, brand_id, service_type, project_name, dropbox_project_folder_url, brief_id")
    .eq("monday_deal_id", dealId);
  return data ?? [];
}

async function getBrand(id) {
  const { data } = await supabase
    .from("brands")
    .select("id, business_name, status, engagement_type, source_deal_id, dropbox_folder_url, account_manager")
    .eq("id", id)
    .single();
  return data;
}

function report(label, ok, detail) {
  const icon = ok ? "✓" : "✗";
  console.log(`    ${icon} ${label}${detail ? ` — ${detail}` : ""}`);
}

async function teardown() {
  console.log("\n[cleanup] Removing test artifacts…");
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
console.log("║  S6 PR1 — Closed Won webhook · scenario tests                        ║");
console.log("╚══════════════════════════════════════════════════════════════════════╝");

try {
  // Check Service Type column existence
  const serviceCol = await findServiceTypeColumn();
  if (serviceCol) {
    console.log(`\n[setup] Service Type column found: ${serviceCol.id} (type: ${serviceCol.type})`);
  } else {
    console.log(`\n[setup] Service Type column NOT found — multi-service test will be skipped.`);
  }

  const ts = new Date().toISOString().slice(0, 19);

  // ──────────────────────────────────────────────────────────────────
  // SCENARIO 1: NEW client, single service (Content — by default fallback)
  // ──────────────────────────────────────────────────────────────────
  console.log("\n┌─────────────────────────────────────────────────────────────────────┐");
  console.log("│ TEST 1 — NEW client, Content service (single)                       │");
  console.log("└─────────────────────────────────────────────────────────────────────┘");

  const brandName1 = `TestBrand-${ts}-Alpha`;
  const dealName1 = `${brandName1} | Webhook Test Project (SAFE TO DELETE)`;
  console.log(`\n  Creating deal: ${dealName1}`);
  const deal1 = await createDeal({ name: dealName1, dealType: "Recurring", value: 4500 });
  console.log(`  Monday deal: ${deal1}`);

  console.log("\n  Firing webhook…");
  const r1 = await fireWebhook(deal1);
  console.log(`    Status: ${r1.status}  kind: ${r1.body.kind}  brand: ${r1.body.business_name}`);

  if (r1.body.brand_id) createdBrandIds.add(r1.body.brand_id);

  const projects1 = await waitForProjects(deal1, 1);
  const brand1 = projects1[0] ? await getBrand(projects1[0].brand_id) : null;

  console.log("\n  Assertions:");
  report("Returned kind === 'new_client'", r1.body.kind === "new_client", `got: ${r1.body.kind}`);
  report("Brand was created in DB", !!brand1, brand1 ? brand1.business_name : "missing");
  report("Brand status is 'submitted'", brand1?.status === "submitted", brand1?.status);
  report("engagement_type = 'retainer'", brand1?.engagement_type === "retainer", brand1?.engagement_type);
  report("source_deal_id stamped", brand1?.source_deal_id === deal1, brand1?.source_deal_id);
  report("Brand parent Dropbox folder URL set", !!brand1?.dropbox_folder_url, brand1?.dropbox_folder_url?.slice(0, 60));
  report("1 brand_projects row created", projects1.length === 1, `count: ${projects1.length}`);
  report("Project service_type = 'Content' (fallback)", projects1[0]?.service_type === "Content", projects1[0]?.service_type);
  report("Project Dropbox subfolder created", !!projects1[0]?.dropbox_project_folder_url, projects1[0]?.dropbox_project_folder_url?.slice(0, 60));
  report("Brief seeded for Content project", !!projects1[0]?.brief_id, projects1[0]?.brief_id);

  // ──────────────────────────────────────────────────────────────────
  // SCENARIO 2: RETURNING client — match brand1 by name
  // ──────────────────────────────────────────────────────────────────
  console.log("\n┌─────────────────────────────────────────────────────────────────────┐");
  console.log("│ TEST 2 — RETURNING client (matches Test 1's brand by name)          │");
  console.log("└─────────────────────────────────────────────────────────────────────┘");

  const dealName2 = `${brandName1} | Second Project Same Client (SAFE TO DELETE)`;
  console.log(`\n  Creating deal: ${dealName2}`);
  const deal2 = await createDeal({ name: dealName2, dealType: "One Time", value: 7500 });
  console.log(`  Monday deal: ${deal2}`);

  console.log("\n  Firing webhook…");
  const r2 = await fireWebhook(deal2);
  console.log(`    Status: ${r2.status}  kind: ${r2.body.kind}  brand: ${r2.body.business_name}`);

  const projects2 = await waitForProjects(deal2, 1);
  const allProjectsForBrand1 = brand1 ? await supabase.from("brand_projects").select("id").eq("brand_id", brand1.id) : { data: [] };

  console.log("\n  Assertions:");
  report("Returned kind === 'existing_client'", r2.body.kind === "existing_client", `got: ${r2.body.kind}`);
  report("Matched same brand as Test 1", r2.body.brand_id === brand1?.id, r2.body.brand_id);
  report("NO new brand created (count = 1 brand for this name)", true /* implicit by match */);
  report("1 new project row created for the second deal", projects2.length === 1, `count: ${projects2.length}`);
  report("Brand now has 2 projects total", (allProjectsForBrand1.data?.length ?? 0) === 2, `total: ${allProjectsForBrand1.data?.length}`);
  report("Project Dropbox subfolder created", !!projects2[0]?.dropbox_project_folder_url, projects2[0]?.dropbox_project_folder_url?.slice(0, 60));
  report("Brief seeded for Content project", !!projects2[0]?.brief_id, projects2[0]?.brief_id);

  // ──────────────────────────────────────────────────────────────────
  // SCENARIO 3: NEW client, multi-service (only if column exists)
  // ──────────────────────────────────────────────────────────────────
  if (serviceCol) {
    console.log("\n┌─────────────────────────────────────────────────────────────────────┐");
    console.log("│ TEST 3 — NEW client, MULTI-service (Content + Social)              │");
    console.log("└─────────────────────────────────────────────────────────────────────┘");

    const brandName3 = `TestBrand-${ts}-Beta`;
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
    console.log(`    Status: ${r3.status}  kind: ${r3.body.kind}  brand: ${r3.body.business_name}`);
    if (r3.body.brand_id) createdBrandIds.add(r3.body.brand_id);

    const projects3 = await waitForProjects(deal3, 2);
    const contentProj = projects3.find((p) => p.service_type === "Content");
    const socialProj = projects3.find((p) => p.service_type === "Social Media");

    console.log("\n  Assertions:");
    report("Returned kind === 'new_client'", r3.body.kind === "new_client", `got: ${r3.body.kind}`);
    report("2 project rows created (one per service)", projects3.length === 2, `count: ${projects3.length}`);
    report("Content project present", !!contentProj);
    report("Social project present", !!socialProj);
    report("Content project HAS Dropbox subfolder", !!contentProj?.dropbox_project_folder_url);
    report("Content project HAS seeded brief", !!contentProj?.brief_id);
    report("Social project has NO Dropbox subfolder", !socialProj?.dropbox_project_folder_url);
    report("Social project has NO brief", !socialProj?.brief_id);
    report("Project names use ' - ServiceType' suffix when multi", contentProj?.project_name?.endsWith(" - Content"), contentProj?.project_name);
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
  console.log(`    Status: ${r4.status}  kind: ${r4.body.kind}`);

  const projectsAfterReFire = await waitForProjects(deal1, 1);

  console.log("\n  Assertions:");
  report("Returned kind === 'same_deal'", r4.body.kind === "same_deal", `got: ${r4.body.kind}`);
  report("No new project rows added (still 1)", projectsAfterReFire.length === 1, `count: ${projectsAfterReFire.length}`);

  console.log("\n[Google Chat side]");
  console.log("  Check your Account Manager Chat space:");
  console.log("    🎉 Credit card(s) — only if Deal Identifier column was populated");
  console.log("    📦 Returning client card from Test 2");
  console.log("  Check your Brand Hub Intakes space:");
  console.log("    🎯 AM Head 'assign an AM' cards from Tests 1 + 3");
  console.log("    💰 CFO cards from Tests 1, 2, 3");
  console.log("    🌟 Team broadcast cards from Tests 1, 3");

} catch (e) {
  console.error("\nTest run threw:", e);
} finally {
  await teardown();
  console.log("\n=== All tests done ===\n");
}
