// One-shot audit: for every brand in Brand Hub, list what's missing.
// Covers core fields + colors + fonts + logos.
//
// Run: node scripts/_audit-brands.mjs

import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "./_load-env.mjs";

loadEnv();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const isBlank = (v) => v === null || v === undefined || (typeof v === "string" && !v.trim());
const isEmpty = (a) => !Array.isArray(a) || a.length === 0;

const { data: brands, error } = await supabase
  .from("brands")
  .select(
    "id, business_name, status, website, tagline, vertical, account_manager, " +
      "overview_polished, overview_client_raw, brand_voice, look_and_feel, " +
      "audience_type, audience_age, audience_gender, music_notes, " +
      "colors, fonts"
  )
  .order("business_name");
if (error) { console.error(error); process.exit(1); }

// One round-trip for logo counts per brand.
const { data: logoRows } = await supabase
  .from("brand_logos")
  .select("brand_id, logo_type");
const logoCount = new Map();
const refOnlyCount = new Map();
for (const l of logoRows ?? []) {
  logoCount.set(l.brand_id, (logoCount.get(l.brand_id) ?? 0) + 1);
  if (l.logo_type === "reference") {
    refOnlyCount.set(l.brand_id, (refOnlyCount.get(l.brand_id) ?? 0) + 1);
  }
}

function gapsFor(b) {
  const gaps = [];
  if (isBlank(b.website))         gaps.push("website");
  if (isBlank(b.account_manager)) gaps.push("AM");
  if (isBlank(b.vertical))        gaps.push("vertical");
  if (isBlank(b.tagline))         gaps.push("tagline");
  if (isEmpty(b.colors))          gaps.push("colors");
  if (isEmpty(b.fonts))           gaps.push("fonts");
  // Need either polished overview or raw fallback
  if (isBlank(b.overview_polished) && isBlank(b.overview_client_raw)) gaps.push("overview");
  if (isBlank(b.brand_voice))     gaps.push("voice");
  if (isBlank(b.look_and_feel))   gaps.push("look & feel");
  if (isBlank(b.audience_type))   gaps.push("audience");
  if (isBlank(b.music_notes))     gaps.push("music");
  // Logos — count only non-reference (real logo image files).
  const total = logoCount.get(b.id) ?? 0;
  const refOnly = refOnlyCount.get(b.id) ?? 0;
  const realLogos = total - refOnly;
  if (total === 0) gaps.push("logos");
  else if (realLogos === 0 && refOnly > 0) gaps.push(`logos (only ${refOnly} ref file — no image)`);
  return gaps;
}

// Per-brand report
const complete = [];
const partial = [];
for (const b of brands) {
  const gaps = gapsFor(b);
  if (gaps.length === 0) complete.push(b);
  else partial.push({ b, gaps });
}

console.log(`\n${brands.length} brands total — ${complete.length} complete, ${partial.length} have gaps\n`);
console.log("=".repeat(80));

for (const { b, gaps } of partial) {
  console.log(`\n▸ ${b.business_name.padEnd(36)} [${b.status}]`);
  console.log(`  Missing: ${gaps.join(", ")}`);
}

if (complete.length > 0) {
  console.log("\n" + "=".repeat(80));
  console.log("\nFully populated brands:");
  for (const b of complete) console.log(`  ✓ ${b.business_name}`);
}

// Aggregate counts so you can see the biggest gaps at a glance.
const counts = {};
for (const { gaps } of partial) for (const g of gaps) counts[g] = (counts[g] ?? 0) + 1;
console.log("\n" + "=".repeat(80));
console.log("\nGap frequency (highest first):");
Object.entries(counts)
  .sort((a, b) => b[1] - a[1])
  .forEach(([gap, n]) => console.log(`  ${String(n).padStart(3)}  ${gap}`));
