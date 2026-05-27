// Check what file extensions the "reference only" brands have.
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "./_load-env.mjs";

loadEnv();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const needers = ["Bertram", "Exclusive Vacations", "Global Jet Sales", "MAN Engines", "Modern Grounds", "Vice Marine", "Zen Motorsports"];

for (const name of needers) {
  const { data: brand } = await supabase
    .from("brands")
    .select("id")
    .eq("business_name", name)
    .single();
  if (!brand) { console.log(`${name}: not found`); continue; }
  const { data: logos } = await supabase
    .from("brand_logos")
    .select("file_name, logo_type, public_url")
    .eq("brand_id", brand.id);
  console.log(`\n▸ ${name}`);
  if (!logos || logos.length === 0) {
    console.log("  (no logos)");
    continue;
  }
  for (const l of logos) console.log(`  ${l.logo_type || "image"}  ${l.file_name}`);
}
