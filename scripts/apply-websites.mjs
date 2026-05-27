#!/usr/bin/env node
// One-shot: applies confirmed websites for brands missing them.
// Researched via web search on 2026-05-25.

import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "./_load-env.mjs";

loadEnv();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const WEBSITES = [
  { business_name: "Bayliner Boats",               website: "https://www.bayliner.com/" },
  { business_name: "American Tile and Stonework",  website: "https://www.americantileandstonework.com/" },
  { business_name: "Marine Connection",            website: "https://www.marineconnection.com/" },
  { business_name: "Modern Grounds",               website: "https://moderngroundsfl.com/" },
];

let updated = 0;
for (const pick of WEBSITES) {
  const { data: rows } = await supabase
    .from("brands")
    .select("id, business_name, website")
    .eq("business_name", pick.business_name)
    .limit(1);
  const b = rows?.[0];
  if (!b) { console.log(`✗ ${pick.business_name}: not found`); continue; }
  if (b.website?.trim()) {
    console.log(`↷ ${pick.business_name}: already has website (${b.website}) — skipping`);
    continue;
  }
  const { error } = await supabase.from("brands").update({ website: pick.website }).eq("id", b.id);
  if (error) { console.log(`✗ ${pick.business_name}: ${error.message}`); continue; }
  await supabase.from("brand_activity_log").insert({
    brand_id: b.id,
    event_type: "website_inferred",
    metadata: { source: "web-search apply-websites script", url: pick.website },
  });
  console.log(`✓ ${pick.business_name}: ${pick.website}`);
  updated += 1;
}
console.log(`\nUpdated: ${updated}/${WEBSITES.length}`);
