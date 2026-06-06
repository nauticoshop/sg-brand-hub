// Quick QC check for a single brand. Usage:
//   BRAND=Vollmer node scripts/_check-brand.mjs
// or:
//   BRAND_ID=<uuid> node scripts/_check-brand.mjs

import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "./_load-env.mjs";
loadEnv();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const search = process.env.BRAND;
const id = process.env.BRAND_ID;

let brands;
if (id) {
  const { data, error } = await supabase
    .from("brands")
    .select("*")
    .eq("id", id);
  if (error) throw new Error(error.message);
  brands = data;
} else if (search) {
  const { data, error } = await supabase
    .from("brands")
    .select("*")
    .ilike("business_name", `%${search}%`)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  brands = data;
} else {
  throw new Error("Set BRAND=<name substring> or BRAND_ID=<uuid>");
}

if (!brands || brands.length === 0) {
  console.log(`No brands matched.`);
  process.exit(0);
}

for (const b of brands) {
  console.log(`\n╔══════════════════════════════════════════════════════════════════╗`);
  console.log(`║ ${b.business_name}`.padEnd(67) + "║");
  console.log(`╚══════════════════════════════════════════════════════════════════╝`);
  console.log(`  id:                 ${b.id}`);
  console.log(`  created_at:         ${b.created_at}`);
  console.log(`  updated_at:         ${b.updated_at}`);
  console.log(`  status:             ${b.status}`);
  console.log(`  engagement_type:    ${b.engagement_type ?? "(null)"}`);
  console.log(`  vertical:           ${b.vertical ?? "(null)"}`);
  console.log(`  account_manager:    ${b.account_manager ?? "(null)"}`);
  console.log(`\n  ── Sales handoff ────────────────────────────────────────`);
  console.log(`  source_deal_id:     ${b.source_deal_id ?? "(null) ← no pre-stamped link used"}`);
  console.log(`  source_deal_url:    ${b.source_deal_url ?? "(null)"}`);
  console.log(`\n  ── Submitter ───────────────────────────────────────────`);
  console.log(`  submitter_name:     ${b.submitter_name ?? "(null)"}`);
  console.log(`  submitter_email:    ${b.submitter_email ?? "(null)"}`);
  console.log(`  submitter_phone:    ${b.submitter_phone ?? "(null)"}`);
  console.log(`\n  ── Brand basics ────────────────────────────────────────`);
  console.log(`  website:            ${b.website ?? "(null)"}`);
  console.log(`  tagline:            ${b.tagline ?? "(null)"}`);
  console.log(`  overview_client:    ${truncate(b.overview_client_raw)}`);
  console.log(`  look_and_feel:      ${truncate(b.look_and_feel)}`);
  console.log(`  what_to_avoid:      ${truncate(b.what_to_avoid)}`);
  console.log(`  inspiration_refs:   ${truncate(b.inspiration_references)}`);
  console.log(`\n  ── Audience ────────────────────────────────────────────`);
  console.log(`  audience_gender:    ${b.audience_gender ?? "(null)"}`);
  console.log(`  audience_age:       ${b.audience_age ?? "(null)"}`);
  console.log(`  audience_type:      ${truncate(b.audience_type)}`);
  console.log(`  music_notes:        ${truncate(b.music_notes)}`);
  console.log(`\n  ── Visual ─────────────────────────────────────────────`);
  console.log(`  colors:             ${Array.isArray(b.colors) ? `${b.colors.length} colors` : "(none)"}`);
  if (Array.isArray(b.colors)) b.colors.forEach((c) => console.log(`                        · ${c.name ?? "(unnamed)"} ${c.hex} [${c.role}]`));
  console.log(`  fonts:              ${Array.isArray(b.fonts) ? `${b.fonts.length} fonts` : "(none)"}`);
  if (Array.isArray(b.fonts)) b.fonts.forEach((f) => console.log(`                        · ${f.name} [${f.role}] — ${f.use_case ?? "—"}`));
  console.log(`\n  ── Social handles ─────────────────────────────────────`);
  console.log(`  instagram:          ${b.instagram ?? "(empty)"}`);
  console.log(`  facebook:           ${b.facebook ?? "(empty)"}`);
  console.log(`  youtube:            ${b.youtube ?? "(empty)"}`);
  console.log(`  tiktok:             ${b.tiktok ?? "(empty)"}`);
  console.log(`  linkedin:           ${b.linkedin ?? "(empty)"}`);
  console.log(`\n  ── Asset folders ──────────────────────────────────────`);
  console.log(`  client_assets:      ${b.client_asset_folder_url ?? "(none provided by client)"}`);
  console.log(`  dropbox_folder:     ${b.dropbox_folder_url ?? "(NOT created)"}`);

  // Logo files
  const { data: logos } = await supabase
    .from("brand_logos")
    .select("id, file_name, logo_type, public_url, display_order, created_at")
    .eq("brand_id", b.id)
    .order("display_order");
  const primaryLogos = (logos ?? []).filter((l) => l.logo_type !== "reference");
  const refLogos = (logos ?? []).filter((l) => l.logo_type === "reference");
  console.log(`\n  ── Uploaded files ─────────────────────────────────────`);
  console.log(`  Logos:              ${primaryLogos.length}`);
  primaryLogos.forEach((l) => console.log(`                        · ${l.file_name}`));
  console.log(`  Reference files:    ${refLogos.length}`);
  refLogos.forEach((l) => console.log(`                        · ${l.file_name}`));

  // Activity log
  const { data: activity } = await supabase
    .from("brand_activity_log")
    .select("event_type, metadata, created_at")
    .eq("brand_id", b.id)
    .order("created_at", { ascending: false })
    .limit(10);
  console.log(`\n  ── Recent activity ────────────────────────────────────`);
  (activity ?? []).forEach((a) => {
    const meta = a.metadata && Object.keys(a.metadata).length > 0
      ? ` — ${JSON.stringify(a.metadata).slice(0, 100)}`
      : "";
    console.log(`  ${a.created_at?.slice(0, 19)}  ${a.event_type}${meta}`);
  });

  // Closed Won dispatch (if any)
  if (b.source_deal_id) {
    const { data: dispatch } = await supabase
      .from("closed_won_dispatches")
      .select("kind, dispatched_at")
      .eq("monday_deal_id", b.source_deal_id)
      .maybeSingle();
    console.log(`\n  ── Closed Won dispatch ────────────────────────────────`);
    if (dispatch) {
      console.log(`  kind:               ${dispatch.kind}`);
      console.log(`  dispatched_at:      ${dispatch.dispatched_at}`);
    } else {
      console.log(`  (no dispatch row — webhook never fired for this deal)`);
    }
  }
}

console.log();

function truncate(s) {
  if (!s) return "(empty)";
  return s.length > 80 ? s.slice(0, 80) + "…" : s;
}
