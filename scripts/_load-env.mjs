// Tolerant .env.local loader. Use in scripts:
//   import { loadEnv } from "./_load-env.mjs";
//   const env = loadEnv();
//
// Why this exists: `vercel env pull .env.local` writes long JWT-style values
// (Supabase keys, Monday token, Anthropic key) wrapped across multiple physical
// lines. Bash `source` choke on those, and `node --env-file=` is similarly
// strict. This parser tolerates wrap by gluing continuation lines (lines with
// no `KEY=` prefix) onto the most recent value.
//
// Side effect: populates process.env with every loaded var, so existing code
// that reads `process.env.X` continues to work.

import { readFileSync, existsSync } from "node:fs";

export function loadEnv(path = ".env.local") {
  if (!existsSync(path)) {
    console.error(`Missing ${path}. Run: npx vercel env pull --environment=production .env.local --yes`);
    process.exit(1);
  }
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
      process.env[currentKey] = v;
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
