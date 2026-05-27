#!/usr/bin/env node
// Updates the Brand Guideline column (link_mkv84m88) on the Monday Intake board
// for every Brand Hub brand that has a monday_intake_item_id set. The link
// points at the brand's editorial share page in Brand Hub.
//
// Idempotent — Monday accepts the same value as a no-op write.
//
// Run: node scripts/sync-brand-guideline-links.mjs

import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "./_load-env.mjs";

loadEnv();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const MONDAY_TOKEN = process.env.MONDAY_API_TOKEN;
const INTAKE_BOARD = process.env.MONDAY_BOARD_ID_INTAKE;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://sg-brand-hub.vercel.app";

if (!MONDAY_TOKEN || !INTAKE_BOARD) {
  console.error("Missing MONDAY_API_TOKEN or MONDAY_BOARD_ID_INTAKE.");
  process.exit(1);
}

// Column ID for "Brand Guideline" on the Intake board.
const COL_BRAND_GUIDELINE = "link_mkv84m88";

async function mondayFetch(query, variables) {
  const res = await fetch("https://api.monday.com/v2", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: MONDAY_TOKEN,
      "API-Version": "2024-10",
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const body = await res.json();
  if (body.errors) throw new Error(`Monday errors: ${body.errors.map((e) => e.message).join("; ")}`);
  return body.data;
}

const { data: brands, error } = await supabase
  .from("brands")
  .select("id, business_name, share_token, monday_intake_item_id")
  .not("monday_intake_item_id", "is", null)
  .not("share_token", "is", null)
  .order("business_name");
if (error) { console.error(error); process.exit(1); }

console.log(`Updating Brand Guideline link on ${brands.length} Monday items...\n`);

let updated = 0;
const errors = [];

for (const b of brands) {
  const shareUrl = `${APP_URL}/share/${b.share_token}`;
  const text = `${b.business_name} brand guidelines`;
  const columnValues = JSON.stringify({
    [COL_BRAND_GUIDELINE]: { url: shareUrl, text },
  });

  try {
    await mondayFetch(
      `mutation Update($boardId: ID!, $itemId: ID!, $columnValues: JSON!) {
        change_multiple_column_values(board_id: $boardId, item_id: $itemId, column_values: $columnValues) {
          id
        }
      }`,
      {
        boardId: INTAKE_BOARD,
        itemId: b.monday_intake_item_id,
        columnValues,
      }
    );
    console.log(`✓ ${b.business_name}: ${shareUrl}`);
    updated += 1;
  } catch (e) {
    console.log(`✗ ${b.business_name}: ${e.message}`);
    errors.push({ brand: b.business_name, error: e.message });
  }
}

console.log(`\n— Done —`);
console.log(`Updated: ${updated}/${brands.length}`);
if (errors.length > 0) console.log(`Errors:  ${errors.length}\n${JSON.stringify(errors, null, 2)}`);
