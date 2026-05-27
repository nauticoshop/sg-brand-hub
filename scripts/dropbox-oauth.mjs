#!/usr/bin/env node
// One-time Dropbox OAuth flow to get a long-lived refresh token.
//
// Usage:
//   node scripts/dropbox-oauth.mjs
//
// What it does:
//   1. Reads DROPBOX_APP_KEY + DROPBOX_APP_SECRET from .env.local
//   2. Prints an auth URL for you to open in Chrome
//   3. You approve, Dropbox shows a 'code' on screen
//   4. You paste the code back into this prompt
//   5. Script exchanges code → refresh_token and prints it
//   6. You paste that into DROPBOX_REFRESH_TOKEN in Vercel env vars

import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { readFileSync } from "node:fs";

// Tolerant .env.local reader — works around vercel env pull wrapping long
// JWT values across multiple physical lines (which breaks `source`).
function loadDotEnv(path) {
  const text = readFileSync(path, "utf8");
  const env = {};
  const lines = text.split(/\r?\n/);
  let currentKey = null;
  let currentVal = "";
  const keyRe = /^([A-Z_][A-Z0-9_]*)=(.*)$/;
  const flush = () => {
    if (currentKey) {
      let v = currentVal;
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
      currentVal += line;
    }
  }
  flush();
  return env;
}

const env = loadDotEnv(".env.local");
const APP_KEY = env.DROPBOX_APP_KEY;
const APP_SECRET = env.DROPBOX_APP_SECRET;

if (!APP_KEY || !APP_SECRET) {
  console.error("Missing DROPBOX_APP_KEY or DROPBOX_APP_SECRET in .env.local.");
  console.error("Run `npx vercel env pull .env.local` to refresh, then try again.");
  process.exit(1);
}

const authUrl =
  `https://www.dropbox.com/oauth2/authorize?` +
  new URLSearchParams({
    client_id: APP_KEY,
    response_type: "code",
    token_access_type: "offline", // critical — requests a refresh_token
  }).toString();

console.log("\n========================================");
console.log("STEP 1: Open this URL in Chrome:");
console.log("========================================\n");
console.log(authUrl);
console.log("\nClick 'Allow' to authorize the SG Brand Hub app.");
console.log("After approval, Dropbox will show you an 'Access Code'.\n");

const rl = readline.createInterface({ input: stdin, output: stdout });
const code = (await rl.question("STEP 2: Paste the Access Code here and press Enter:\n> ")).trim();
rl.close();

if (!code) {
  console.error("\nNo code provided. Exiting.");
  process.exit(1);
}

console.log("\nExchanging code for refresh token…\n");

const tokenRes = await fetch("https://api.dropboxapi.com/oauth2/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    code,
    grant_type: "authorization_code",
    client_id: APP_KEY,
    client_secret: APP_SECRET,
  }).toString(),
});

const data = await tokenRes.json();

if (!tokenRes.ok || !data.refresh_token) {
  console.error("✗ Token exchange failed:");
  console.error(JSON.stringify(data, null, 2));
  process.exit(1);
}

console.log("✓ Success!\n");
console.log("========================================");
console.log("Your DROPBOX_REFRESH_TOKEN:");
console.log("========================================\n");
console.log(data.refresh_token);
console.log("\n========================================");
console.log("Next steps:");
console.log("========================================");
console.log("1. Copy the refresh token above");
console.log("2. Paste into .env.local after DROPBOX_REFRESH_TOKEN=");
console.log("3. Also add it to Vercel env vars (production + preview)");
console.log("4. Save and restart `npm run dev`");
console.log();
