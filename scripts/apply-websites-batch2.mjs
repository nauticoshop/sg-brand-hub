#!/usr/bin/env node
// Applies confirmed websites for the 26 brands identified via web search on
// 2026-05-25. Idempotent — skips brands that already have a website.

import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "./_load-env.mjs";

loadEnv();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const WEBSITES = [
  { business_name: "Pardo Yachts",                              website: "https://pardoyachts.com/" },
  { business_name: "Galeon Yachts",                             website: "https://www.galeon.yachts/" },
  { business_name: "Bahama Boat Works",                         website: "https://bahamaboatworks.com/" },
  { business_name: "SŌLACE Boats",                              website: "https://solaceboats.com/" },
  { business_name: "Gulf Craft / Majesty yachts",               website: "https://majesty-yachts.com/" },
  { business_name: "Riviera Australia",                         website: "https://www.rivieraaustralia.com/" },
  { business_name: "Zipwake",                                   website: "https://zipwake.com/" },
  { business_name: "PRIMO YACHTS",                              website: "https://primoyachts.com/" },
  { business_name: "Burnewiin",                                 website: "https://burnewiin.com/" },
  { business_name: "Barker Boatworks",                          website: "https://barkerboatworks.com/" },
  { business_name: "Antudo",                                    website: "https://www.antudomarine.com/" },
  { business_name: "Blue heron yachts",                         website: "https://blueheronyachts.com/" },
  { business_name: "South Jersey Yacht Sales",                  website: "https://southjerseyyachtsales.com/" },
  { business_name: "Moore Yacht Sales",                         website: "https://mooreyachtsales.com/" },
  { business_name: "Delmarva Marine Group",                     website: "https://delmarvamarinegroup.com/" },
  { business_name: "Elettromedia Corporation",                  website: "https://elettromedia.com/en/" },
  { business_name: "Darth Craft d.o.o.",                        website: "https://www.darth-craft.si/" },
  { business_name: "Global Superyacht Forum",                   website: "https://www.metstrade.com/the-superyacht-forum" },
  { business_name: "Great Lakes Boating Festival",              website: "https://www.greatlakesboatingfestival.com/" },
  { business_name: "Wynwood Plaza Residences",                  website: "https://www.wynwoodplazaresidences.com/" },
  { business_name: "Aqualux Yacht Management",                  website: "https://www.aqualuxyacht.com/" },
  { business_name: "Kenn Ricci",                                website: "https://kennricci.com/" },
  { business_name: "Parker Luxury Homes",                       website: "https://www.parkerluxhomes.com/" },
  { business_name: "Absolute of Americas",                      website: "https://www.absoluteyachts.com/" },
  { business_name: "Paulina Chandler/ Rick Obey Yacht Sales",   website: "https://www.rickobeyyachtsales.com/" },
  { business_name: "The High Net Worth Advisory Group",         website: "https://highnetworthadvisorygroup.com/" },
];

let updated = 0;
let skipped = 0;
let notFound = 0;
for (const pick of WEBSITES) {
  const { data: rows } = await supabase
    .from("brands")
    .select("id, business_name, website")
    .eq("business_name", pick.business_name)
    .limit(1);
  const b = rows?.[0];
  if (!b) { console.log(`✗ ${pick.business_name}: not found`); notFound += 1; continue; }
  if (b.website?.trim()) {
    console.log(`↷ ${pick.business_name}: already has website — skipping`);
    skipped += 1;
    continue;
  }
  const { error } = await supabase.from("brands").update({ website: pick.website }).eq("id", b.id);
  if (error) { console.log(`✗ ${pick.business_name}: ${error.message}`); continue; }
  await supabase.from("brand_activity_log").insert({
    brand_id: b.id,
    event_type: "website_inferred",
    metadata: { source: "web-search apply-websites-batch2", url: pick.website },
  });
  console.log(`✓ ${pick.business_name}: ${pick.website}`);
  updated += 1;
}
console.log(`\nUpdated: ${updated}  Skipped: ${skipped}  Not found: ${notFound}`);
