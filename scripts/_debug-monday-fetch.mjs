#!/usr/bin/env node
// Diagnostic: try several different request shapes against the first asset URL
// in monday-assets.json, print status codes for each. Helps figure out which
// header combo makes Monday's CDN happy.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "./_load-env.mjs";

loadEnv();

const __dirname = dirname(fileURLToPath(import.meta.url));
const assets = JSON.parse(readFileSync(join(__dirname, "monday-assets.json"), "utf8"));
const first = Object.entries(assets)[0];
if (!first) {
  console.error("No assets in monday-assets.json. Run fetch-monday-assets.mjs first.");
  process.exit(1);
}
const [assetId, asset] = first;

console.log(`Probing asset ${assetId}: ${asset.name}`);
console.log(`  url:        ${asset.url}`);
console.log(`  public_url: ${asset.public_url}`);
console.log();

const TOKEN = process.env.MONDAY_API_TOKEN;

const tests = [
  { label: "url, no headers", url: asset.url, headers: {} },
  { label: "url, Accept */*", url: asset.url, headers: { Accept: "*/*" } },
  { label: "url, curl UA", url: asset.url, headers: { "User-Agent": "curl/8.0.0" } },
  { label: "url, real-browser UA", url: asset.url, headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" } },
  { label: "url + Auth (Monday token)", url: asset.url, headers: { Authorization: TOKEN } },
  { label: "url, Accept-Encoding identity", url: asset.url, headers: { "Accept-Encoding": "identity", Accept: "*/*" } },
  { label: "public_url + Auth (Monday token)", url: asset.public_url, headers: { Authorization: TOKEN } },
  { label: "public_url, no headers", url: asset.public_url, headers: {} },
];

for (const t of tests) {
  try {
    const res = await fetch(t.url, { headers: t.headers, redirect: "manual" });
    const loc = res.headers.get("location");
    const ct = res.headers.get("content-type");
    console.log(
      `  [${String(res.status).padStart(3)}] ${t.label}` +
        (loc ? `  → redirect to ${loc.slice(0, 80)}` : "") +
        (ct ? `  content-type: ${ct}` : "")
    );
  } catch (e) {
    console.log(`  [ERR] ${t.label}: ${e.message}`);
  }
}
