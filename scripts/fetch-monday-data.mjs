#!/usr/bin/env node
// Fetches the Client Onboarding Asset Intake board fresh from Monday and writes
// scripts/monday-data.json in the shape that import-from-monday.mjs expects.
//
// Run before re-running the importer when new items have been added to the
// Intake group via the legacy Monday form.
//
// Usage:
//   node scripts/fetch-monday-data.mjs

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "./_load-env.mjs";

loadEnv();

const __dirname = dirname(fileURLToPath(import.meta.url));

const TOKEN = process.env.MONDAY_API_TOKEN;
const BOARD_ID = process.env.MONDAY_BOARD_ID_INTAKE;

if (!TOKEN || !BOARD_ID) {
  console.error("Missing MONDAY_API_TOKEN or MONDAY_BOARD_ID_INTAKE.");
  process.exit(1);
}

const query = `query($boardId: [ID!], $limit: Int) {
  boards(ids: $boardId) {
    id
    name
    items_page(limit: $limit) {
      cursor
      items {
        id
        name
        url
        created_at
        updated_at
        group { id title }
        column_values {
          id
          text
          value
          type
        }
      }
    }
  }
}`;

const res = await fetch("https://api.monday.com/v2", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: TOKEN,
    "API-Version": "2024-10",
  },
  body: JSON.stringify({ query, variables: { boardId: BOARD_ID, limit: 500 } }),
});

if (!res.ok) {
  console.error(`Monday API HTTP ${res.status}:`, await res.text());
  process.exit(1);
}

const body = await res.json();
if (body.errors) {
  console.error("Monday API errors:", body.errors);
  process.exit(1);
}

const board = body.data?.boards?.[0];
if (!board) {
  console.error("Board not found.");
  process.exit(1);
}

// Flatten column_values from array → dict { id: text } to match the format
// the importer + logo migration scripts expect.
const items = board.items_page.items.map((item) => ({
  id: item.id,
  name: item.name,
  url: item.url,
  created_at: item.created_at,
  updated_at: item.updated_at,
  group: item.group,
  column_values: Object.fromEntries(
    item.column_values.map((c) => [c.id, c.text])
  ),
}));

const output = {
  board: { id: board.id, name: board.name },
  items,
  fetched_at: new Date().toISOString(),
};

const outPath = join(__dirname, "monday-data.json");
writeFileSync(outPath, JSON.stringify(output, null, 2));

console.log(`✓ Wrote ${items.length} items to ${outPath}`);

// Quick summary by group to help spot new items.
const byGroup = {};
for (const i of items) {
  const g = i.group?.title ?? "(no group)";
  byGroup[g] = (byGroup[g] ?? 0) + 1;
}
console.log("\nItems by group:");
for (const [g, n] of Object.entries(byGroup)) {
  console.log(`  ${g.padEnd(40)} ${n}`);
}
