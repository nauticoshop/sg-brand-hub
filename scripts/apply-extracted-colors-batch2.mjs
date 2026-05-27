#!/usr/bin/env node
// Applies curated color picks for the 27-brand batch, based on CSS scrape +
// vision output reviewed manually. Skips brands where scrape returned only
// framework defaults (Bootstrap, Tailwind) — those need human eyedrop.
//
// Idempotent — skips brands that already have non-empty colors.

import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "./_load-env.mjs";

loadEnv();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const PICKS = [
  {
    business_name: "Barker Boatworks",
    colors: [
      { name: "Navy",       hex: "#1D3C50", role: "primary"   },
      { name: "Sky Blue",   hex: "#2EA3F2", role: "secondary" },
      { name: "Rust Red",   hex: "#B94A48", role: "secondary" },
    ],
    fonts: [
      { name: "Arimo",     role: "primary",   use_case: "Headlines" },
      { name: "Open Sans", role: "secondary", use_case: "Body copy" },
    ],
  },
  {
    business_name: "Delmarva Marine Group",
    colors: [
      { name: "Deep Navy",  hex: "#002B48", role: "primary"   },
      { name: "Sky Blue",   hex: "#2EA3F2", role: "secondary" },
      { name: "Light Blue", hex: "#5DAAD5", role: "secondary" },
    ],
  },
  {
    business_name: "Gulf Craft / Majesty yachts",
    colors: [
      { name: "Charcoal",   hex: "#2A2A2A", role: "primary"   },
      { name: "Plum",       hex: "#50485B", role: "primary"   },
      { name: "Gold",       hex: "#CEC2AB", role: "secondary" },
    ],
  },
  {
    business_name: "Kenn Ricci",
    colors: [
      { name: "Brick",      hex: "#9D5248", role: "primary"   },
      { name: "Dark Brown", hex: "#683119", role: "secondary" },
      { name: "Cream",      hex: "#F5EEE2", role: "secondary" },
    ],
  },
  {
    business_name: "Parker Luxury Homes",
    colors: [
      { name: "Brass",      hex: "#B99056", role: "primary"   },
      { name: "Dark Brown", hex: "#30271F", role: "secondary" },
      { name: "Tan",        hex: "#DBBF99", role: "secondary" },
    ],
  },
  {
    business_name: "Riviera Australia",
    colors: [
      { name: "Riviera Red", hex: "#C02B0A", role: "primary"   },
      { name: "Yellow",      hex: "#E6DB55", role: "secondary" },
      { name: "Slate Blue",  hex: "#607382", role: "secondary" },
    ],
  },
  {
    business_name: "SŌLACE Boats",
    colors: [
      { name: "Black",        hex: "#1E1E1E", role: "primary"   },
      { name: "Electric Blue",hex: "#3858E9", role: "primary"   },
      { name: "Slate Blue",   hex: "#516F7A", role: "secondary" },
      { name: "Red Accent",   hex: "#CC1818", role: "secondary" },
    ],
  },
  {
    business_name: "Wynwood Plaza Residences",
    colors: [
      { name: "Charcoal",     hex: "#2D2A26", role: "primary"   },
      { name: "Purple",       hex: "#9747FF", role: "primary"   },
      { name: "Lavender",     hex: "#D2ADE4", role: "secondary" },
      { name: "Coral",        hex: "#E88D77", role: "secondary" },
      { name: "Mint",         hex: "#8EF49E", role: "secondary" },
      { name: "Teal",         hex: "#80DDD6", role: "secondary" },
    ],
  },
  {
    business_name: "Zipwake",
    colors: [
      { name: "Sky Blue",     hex: "#1E9FDF", role: "primary"   },
      { name: "Near Black",   hex: "#181716", role: "primary"   },
      { name: "Yellow",       hex: "#F8DE32", role: "secondary" },
      { name: "Deep Blue",    hex: "#0068A0", role: "secondary" },
      { name: "Navy",         hex: "#141B38", role: "secondary" },
    ],
  },
  // Vice Marine — fonts only (already has color: Charcoal)
  {
    business_name: "Vice Marine",
    fonts: [
      { name: "Poppins", role: "primary",   use_case: "Headlines" },
      { name: "Manrope", role: "secondary", use_case: "Body copy" },
    ],
  },
];

let applied = 0;
let skipped = 0;
const errors = [];

for (const pick of PICKS) {
  const { data: rows } = await supabase
    .from("brands")
    .select("id, business_name, colors, fonts")
    .eq("business_name", pick.business_name)
    .limit(1);
  const b = rows?.[0];
  if (!b) { console.log(`✗ ${pick.business_name}: not found`); continue; }

  const patch = {};
  if (pick.colors && (!Array.isArray(b.colors) || b.colors.length === 0)) {
    patch.colors = pick.colors;
  }
  if (pick.fonts && (!Array.isArray(b.fonts) || b.fonts.length === 0)) {
    patch.fonts = pick.fonts;
  }

  if (Object.keys(patch).length === 0) {
    console.log(`↷ ${pick.business_name}: already populated — skipping`);
    skipped += 1;
    continue;
  }

  const { error } = await supabase.from("brands").update(patch).eq("id", b.id);
  if (error) {
    console.log(`✗ ${pick.business_name}: ${error.message}`);
    errors.push({ brand: pick.business_name, error: error.message });
    continue;
  }
  await supabase.from("brand_activity_log").insert({
    brand_id: b.id,
    event_type: "visual_identity_extracted",
    metadata: { source: "extract-brand-info batch2 script", patched: Object.keys(patch) },
  });
  console.log(`✓ ${pick.business_name}: ${Object.keys(patch).join(" + ")}`);
  applied += 1;
}

console.log(`\nApplied: ${applied}  Skipped: ${skipped}  Errors: ${errors.length}`);
if (errors.length > 0) console.log(JSON.stringify(errors, null, 2));
