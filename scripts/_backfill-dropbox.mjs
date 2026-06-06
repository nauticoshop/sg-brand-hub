// One-off: backfill a brand's Dropbox parent folder if it was missed.
// Usage:
//   BRAND_ID=<uuid> node scripts/_backfill-dropbox.mjs
//
// Hits the production /api/dev/ensure-dropbox endpoint (gated on the
// service-role key). Idempotent — safe to re-run.

import { loadEnv } from "./_load-env.mjs";
loadEnv();

const APP_BASE = "https://sg-brand-hub.vercel.app";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const brandId = process.env.BRAND_ID;
if (!brandId) throw new Error("Set BRAND_ID=<uuid>");

const res = await fetch(`${APP_BASE}/api/dev/ensure-dropbox`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${SERVICE_KEY}`,
  },
  body: JSON.stringify({ brand_id: brandId }),
});

const body = await res.json().catch(() => ({}));
console.log(`Status: ${res.status}`);
console.log(JSON.stringify(body, null, 2));
