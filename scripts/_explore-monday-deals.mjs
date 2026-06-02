// Find any board whose name matches a query string.
// Usage: node scripts/_explore-monday-deals.mjs <query>
//        node scripts/_explore-monday-deals.mjs <boardId> --dump

import { loadEnv } from "./_load-env.mjs";
loadEnv();

const TOKEN = process.env.MONDAY_API_TOKEN;
if (!TOKEN) { console.error("Missing MONDAY_API_TOKEN."); process.exit(1); }

const args = process.argv.slice(2);
const mode = args.includes("--dump") ? "dump" : "search";
const target = args[0];

async function mondayFetch(query, variables) {
  const res = await fetch("https://api.monday.com/v2", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: TOKEN,
      "API-Version": "2024-10",
    },
    body: JSON.stringify({ query, variables }),
  });
  const body = await res.json();
  if (body.errors) throw new Error(JSON.stringify(body.errors));
  return body.data;
}

if (mode === "search") {
  // Page through ALL boards
  let page = 1;
  const all = [];
  while (true) {
    const data = await mondayFetch(
      `query($page: Int) { boards(limit: 100, page: $page) { id name workspace { name } board_kind } }`,
      { page }
    );
    if (!data.boards || data.boards.length === 0) break;
    all.push(...data.boards);
    if (data.boards.length < 100) break;
    page += 1;
  }
  const matches = target
    ? all.filter((b) => new RegExp(target, "i").test(b.name))
    : all;
  console.log(`Matched ${matches.length} of ${all.length} total boards:\n`);
  matches.forEach((b) => {
    console.log(`  ${b.id.padEnd(12)} ${b.board_kind?.padEnd(9) ?? "?"}  ${b.name.padEnd(50)} ws: ${b.workspace?.name ?? "—"}`);
  });
} else {
  // dump board
  const detail = await mondayFetch(
    `query($id: [ID!]) {
      boards(ids: $id) {
        id name
        groups { id title color }
        columns { id title type }
        items_page(limit: 10) {
          items {
            name
            group { title }
            column_values { id text }
          }
        }
      }
    }`,
    { id: target }
  );
  const b = detail.boards[0];
  if (!b) { console.log(`(board ${target} not found)`); process.exit(0); }
  console.log(`\n=== ${b.name} (${b.id}) ===\n`);
  console.log("GROUPS (pipeline stages):");
  b.groups.forEach((g) => console.log(`  ${g.id.padEnd(36)} ${g.color?.padEnd(10) ?? "—"} ${g.title}`));
  console.log("\nCOLUMNS:");
  b.columns.forEach((c) => console.log(`  ${c.id.padEnd(36)} ${c.type.padEnd(15)} ${c.title}`));
  console.log("\nSAMPLE ITEMS:");
  b.items_page.items.forEach((it) => {
    console.log(`\n  • ${it.name}  [${it.group?.title ?? "?"}]`);
    it.column_values.filter((cv) => cv.text?.trim()).slice(0, 10).forEach((cv) =>
      console.log(`      ${cv.id.padEnd(36)} = ${cv.text.slice(0, 100)}`)
    );
  });
}
