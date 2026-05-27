#!/usr/bin/env node
// Generates a magic link via the Supabase admin API (no email send).
// Bypasses the email rate limit when you're locked out.
//
// Run:
//   node scripts/admin-magic-link.mjs billy@surroundingsgroup.com
//
// Paste the printed URL into your browser to log in.

import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "./_load-env.mjs";

loadEnv();

const email = process.argv[2];
if (!email) {
  console.error("Usage: node scripts/admin-magic-link.mjs <email>");
  process.exit(1);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const { data, error } = await supabase.auth.admin.generateLink({
  type: "magiclink",
  email,
  options: {
    redirectTo: "https://sg-brand-hub.vercel.app/auth/callback",
  },
});

if (error) {
  console.error("Failed:", error.message);
  process.exit(1);
}

console.log("\nClick this link to log in (or paste into your browser):\n");
console.log(data.properties.action_link);
console.log();
