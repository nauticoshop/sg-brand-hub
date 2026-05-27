// One-shot diagnostic: which brands are missing colors / fonts?
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "./_load-env.mjs";

loadEnv();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const { data: brands, error } = await supabase
  .from("brands")
  .select("id, business_name, website, status, colors, fonts")
  .order("business_name");

if (error) {
  console.error(error);
  process.exit(1);
}

const isEmpty = (a) => !Array.isArray(a) || a.length === 0;

const missingBoth = [];
const missingColors = [];
const missingFonts = [];
let withGapsNoWebsite = 0;

for (const b of brands) {
  const noColors = isEmpty(b.colors);
  const noFonts = isEmpty(b.fonts);
  const noWebsite = !b.website?.trim();
  if (noColors && noFonts) missingBoth.push(b);
  else if (noColors) missingColors.push(b);
  else if (noFonts) missingFonts.push(b);
  if ((noColors || noFonts) && noWebsite) withGapsNoWebsite += 1;
}

console.log(`\nTotal brands in Brand Hub: ${brands.length}\n`);

console.log(`Missing BOTH colors and fonts: ${missingBoth.length}`);
missingBoth.forEach((b) =>
  console.log(`  • ${b.business_name.padEnd(38)} ${b.website ? b.website : "(no website)"}  [${b.status}]`)
);

console.log(`\nMissing colors only: ${missingColors.length}`);
missingColors.forEach((b) =>
  console.log(`  • ${b.business_name.padEnd(38)} ${b.website ? b.website : "(no website)"}  [${b.status}]`)
);

console.log(`\nMissing fonts only: ${missingFonts.length}`);
missingFonts.forEach((b) =>
  console.log(`  • ${b.business_name.padEnd(38)} ${b.website ? b.website : "(no website)"}  [${b.status}]`)
);

console.log(
  `\nOf brands with gaps, ${withGapsNoWebsite} have no website filled in (extraction would need a logo instead).`
);
