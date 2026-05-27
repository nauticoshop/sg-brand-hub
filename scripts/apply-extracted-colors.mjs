#!/usr/bin/env node
// One-shot: applies the curated color picks from the extract-brand-info run on
// 2026-05-14 for the 5 brands that had clean extraction results. The 2 brands
// that needed manual handling (Galati Yacht Sales, Render Legacy Trail) are
// intentionally NOT included — they go through the editor by hand.
//
// Idempotent: skips brands that already have non-empty colors. Safe to re-run.
//
// Run:
//   node scripts/apply-extracted-colors.mjs

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
    business_name: "Allied Marine",
    colors: [
      { name: "Brand Teal",  hex: "#0081A6", role: "primary"   },
      { name: "Accent Cyan", hex: "#44C8E8", role: "secondary" },
    ],
  },
  {
    business_name: "American Tile and Stonework",
    colors: [
      { name: "Navy",     hex: "#2C3E50", role: "primary"   },
      { name: "Burgundy", hex: "#A43442", role: "secondary" },
      { name: "Cream",    hex: "#E8E3D6", role: "secondary" },
    ],
  },
  {
    business_name: "Bayliner Boats",
    colors: [
      { name: "Navy", hex: "#003B5C", role: "primary"   },
      { name: "Cyan", hex: "#5BB4D9", role: "secondary" },
    ],
  },
  {
    business_name: "Monterey Boats",
    colors: [
      { name: "Primary Blue", hex: "#336699", role: "primary"   },
      { name: "Dark Navy",    hex: "#052962", role: "primary"   },
      { name: "Red",          hex: "#FF0000", role: "secondary" },
      { name: "Dark Red",     hex: "#990000", role: "secondary" },
    ],
  },
  {
    business_name: "Vice Marine",
    colors: [
      { name: "Charcoal", hex: "#1A1A1A", role: "primary" },
    ],
  },
];

let applied = 0;
let skipped = 0;
const errors = [];

for (const pick of PICKS) {
  const { data: rows, error } = await supabase
    .from("brands")
    .select("id, business_name, colors")
    .eq("business_name", pick.business_name)
    .limit(1);

  if (error) {
    errors.push({ brand: pick.business_name, error: error.message });
    console.log(`✗ ${pick.business_name}: ${error.message}`);
    continue;
  }
  const brand = rows?.[0];
  if (!brand) {
    errors.push({ brand: pick.business_name, error: "Not found in Brand Hub" });
    console.log(`✗ ${pick.business_name}: not found in Brand Hub`);
    continue;
  }

  const existing = Array.isArray(brand.colors) ? brand.colors : [];
  if (existing.length > 0) {
    console.log(`↷ ${pick.business_name}: already has ${existing.length} color(s) — skipping`);
    skipped += 1;
    continue;
  }

  const { error: updErr } = await supabase
    .from("brands")
    .update({ colors: pick.colors })
    .eq("id", brand.id);
  if (updErr) {
    errors.push({ brand: pick.business_name, error: updErr.message });
    console.log(`✗ ${pick.business_name}: ${updErr.message}`);
    continue;
  }

  await supabase.from("brand_activity_log").insert({
    brand_id: brand.id,
    event_type: "colors_extracted",
    metadata: { source: "extract-brand-info script", colors: pick.colors },
  });

  console.log(`✓ ${pick.business_name}: applied ${pick.colors.length} color(s)`);
  applied += 1;
}

console.log(`\n— Done —`);
console.log(`Applied: ${applied}`);
console.log(`Skipped (already had colors): ${skipped}`);
console.log(`Errors: ${errors.length}`);
if (errors.length > 0) console.log(JSON.stringify(errors, null, 2));
