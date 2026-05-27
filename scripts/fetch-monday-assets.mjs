#!/usr/bin/env node
// Fetches signed download URLs for every file attachment on every item in
// scripts/monday-data.json, then writes scripts/monday-assets.json in the
// format that migrate-logos.mjs expects: { [resourceId]: { name, ext, url } }.
//
// Why this exists: Monday stores file uploads behind /protected_static/...
// URLs that need auth. The official asset URLs returned by the assets{url}
// API field are signed and downloadable without further auth, but they
// expire — so this is a fresh-fetch step, run right before migrate-logos.
//
// Usage:
//   node scripts/fetch-monday-data.mjs   # refreshes the brand records
//   node scripts/fetch-monday-assets.mjs # refreshes the signed asset URLs
//   node scripts/migrate-logos.mjs       # downloads + uploads to Supabase

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "./_load-env.mjs";

loadEnv();

const __dirname = dirname(fileURLToPath(import.meta.url));

const TOKEN = process.env.MONDAY_API_TOKEN;
if (!TOKEN) {
  console.error("Missing MONDAY_API_TOKEN.");
  process.exit(1);
}

const data = JSON.parse(readFileSync(join(__dirname, "monday-data.json"), "utf8"));

// Collect every item ID that has a files column value — those are the ones
// with attachments we'd want to migrate.
const itemIdsWithFiles = data.items
  .filter((i) => i.column_values?.files_Mjj2lpXw)
  .map((i) => i.id);

if (itemIdsWithFiles.length === 0) {
  console.log("No items with file attachments found in monday-data.json.");
  process.exit(0);
}

console.log(`Fetching asset URLs for ${itemIdsWithFiles.length} items with attachments...`);

// Monday API: items{assets{...}} returns asset metadata with a signed `url`
// suitable for direct download. Batch in chunks of 25 to stay polite to the
// API.
const assetsOut = {};
const CHUNK = 25;

for (let i = 0; i < itemIdsWithFiles.length; i += CHUNK) {
  const chunk = itemIdsWithFiles.slice(i, i + CHUNK);
  const query = `query($ids: [ID!]!) {
    items(ids: $ids) {
      id
      name
      assets {
        id
        name
        url
        public_url
        file_extension
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
    body: JSON.stringify({ query, variables: { ids: chunk } }),
  });

  const body = await res.json();
  if (body.errors) {
    console.error("Monday API errors:", body.errors);
    process.exit(1);
  }

  for (const item of body.data?.items ?? []) {
    for (const asset of item.assets ?? []) {
      const ext = asset.file_extension
        ? `.${asset.file_extension.replace(/^\./, "")}`
        : extname(asset.name);
      assetsOut[asset.id] = {
        name: asset.name,
        ext,
        url: asset.url,
        public_url: asset.public_url,
      };
    }
  }
  process.stdout.write(`  fetched ${Math.min(i + CHUNK, itemIdsWithFiles.length)}/${itemIdsWithFiles.length}\r`);
}

console.log();
const outPath = join(__dirname, "monday-assets.json");
writeFileSync(outPath, JSON.stringify(assetsOut, null, 2));
console.log(`✓ Wrote ${Object.keys(assetsOut).length} assets to ${outPath}`);
