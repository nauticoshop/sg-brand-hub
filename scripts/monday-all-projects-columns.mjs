#!/usr/bin/env node
// Fetch and print the column IDs + titles + types for the All Projects board.
// Used to figure out which column ID to write the Dropbox URL to.
//
// Run:
//   node scripts/monday-all-projects-columns.mjs
//
// Reads .env.local directly (no shell sourcing needed — works around
// vercel env pull wrapping long JWTs across multiple lines).

import { readFileSync } from "node:fs";

function loadDotEnv(path) {
  const text = readFileSync(path, "utf8");
  const env = {};
  // Tolerant parser: splits on lines that match KEY=..., values may span
  // multiple physical lines (we glue everything up to the next KEY= line).
  const lines = text.split(/\r?\n/);
  let currentKey = null;
  let currentVal = "";
  const keyRe = /^([A-Z_][A-Z0-9_]*)=(.*)$/;
  const flush = () => {
    if (currentKey) {
      let v = currentVal;
      // Strip surrounding quotes if present.
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      env[currentKey] = v;
    }
  };
  for (const line of lines) {
    if (line.startsWith("#") || line.trim() === "") {
      flush();
      currentKey = null;
      currentVal = "";
      continue;
    }
    const m = line.match(keyRe);
    if (m) {
      flush();
      currentKey = m[1];
      currentVal = m[2];
    } else if (currentKey) {
      // Continuation of the previous value (vercel wraps JWTs).
      currentVal += line;
    }
  }
  flush();
  return env;
}

const env = loadDotEnv(".env.local");
const token = env.MONDAY_API_TOKEN;
const boardId = env.MONDAY_BOARD_ID_ALL_PROJECTS;

if (!token || !boardId) {
  console.error("Missing MONDAY_API_TOKEN or MONDAY_BOARD_ID_ALL_PROJECTS in env.");
  process.exit(1);
}

const query = `query($boardId: [ID!]) {
  boards(ids: $boardId) {
    id
    name
    columns {
      id
      title
      type
    }
  }
}`;

const res = await fetch("https://api.monday.com/v2", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: token,
    "API-Version": "2024-10",
  },
  body: JSON.stringify({ query, variables: { boardId } }),
});

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

console.log(`\nBoard: ${board.name} (${board.id})\n`);
console.log("ID".padEnd(40), "Type".padEnd(20), "Title");
console.log("-".repeat(100));
for (const c of board.columns) {
  console.log(c.id.padEnd(40), (c.type ?? "").padEnd(20), c.title);
}
