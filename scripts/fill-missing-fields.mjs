#!/usr/bin/env node
// Fills derivable text fields (tagline, brand_voice, look_and_feel, audience_type)
// for brands missing those fields. Uses Claude to infer each from the
// polished overview + any other available context.
//
// Idempotent: skips brands that already have the field filled.
// Only writes the gaps — never overwrites manual values.
//
// Run: node scripts/fill-missing-fields.mjs

import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { loadEnv } from "./_load-env.mjs";

loadEnv();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = "claude-sonnet-4-5-20250929";

const isBlank = (v) => v === null || v === undefined || (typeof v === "string" && !v.trim());

const { data: brands, error } = await supabase
  .from("brands")
  .select(
    "id, business_name, website, vertical, tagline, " +
      "overview_polished, overview_client_raw, brand_voice, look_and_feel, " +
      "audience_type, look_and_feel"
  )
  .order("business_name");
if (error) { console.error(error); process.exit(1); }

let updated = 0;
let skipped = 0;
const errors = [];

for (const b of brands) {
  const gaps = [];
  if (isBlank(b.tagline))       gaps.push("tagline");
  if (isBlank(b.brand_voice))   gaps.push("voice");
  if (isBlank(b.look_and_feel)) gaps.push("look_and_feel");
  if (isBlank(b.audience_type)) gaps.push("audience");

  if (gaps.length === 0) { skipped += 1; continue; }

  const overview = b.overview_polished || b.overview_client_raw;
  if (isBlank(overview)) {
    console.log(`↷ ${b.business_name}: no overview to infer from — skipping`);
    skipped += 1;
    continue;
  }

  console.log(`→ ${b.business_name} (filling: ${gaps.join(", ")})`);

  const fieldSpec = {
    tagline: "A 3-7 word punchy tagline that captures the brand's core promise. NO quotes around the tagline itself. Examples: 'Crafted for the open water.', 'Where home meets the harbor.'",
    voice: "A 2-3 sentence description of the brand's voice and tone of voice, written FOR our editors (who will create video content). Talk about formality, energy, audience tone, what to lean into.",
    look_and_feel: "A 2-3 sentence description of the brand's visual aesthetic for video content — color mood, pacing, framing, kind of imagery. Concrete and actionable for an editor.",
    audience: "A 1-2 sentence description of the target audience — who buys this, demographic + psychographic. Not a list, prose.",
  };

  const fieldsToFill = gaps.map((g) => `- ${g}: ${fieldSpec[g]}`).join("\n");

  const prompt = `You're filling in missing brand fields for ${b.business_name}, an SG Brand Hub record. Here's what we know:

Brand: ${b.business_name}
Vertical: ${b.vertical || "(unspecified)"}
Website: ${b.website || "(none)"}
Overview: ${overview}
${b.brand_voice ? `Existing voice: ${b.brand_voice}` : ""}
${b.look_and_feel ? `Existing look & feel: ${b.look_and_feel}` : ""}

Generate the following missing fields based on the overview. Be specific to this brand — don't write generic boilerplate.

${fieldsToFill}

Return ONLY valid JSON, exactly this shape (only include keys we asked for):
${JSON.stringify(Object.fromEntries(gaps.map((g) => [g, "string"])), null, 2)}`;

  try {
    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 800,
      messages: [{ role: "user", content: prompt }],
    });
    const text = msg.content.find((c) => c.type === "text")?.text ?? "";
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("no JSON in response");
    const parsed = JSON.parse(m[0]);

    const patch = {};
    if (parsed.tagline && isBlank(b.tagline))             patch.tagline = parsed.tagline.trim();
    if (parsed.voice && isBlank(b.brand_voice))           patch.brand_voice = parsed.voice.trim();
    if (parsed.look_and_feel && isBlank(b.look_and_feel)) patch.look_and_feel = parsed.look_and_feel.trim();
    if (parsed.audience && isBlank(b.audience_type))      patch.audience_type = parsed.audience.trim();

    if (Object.keys(patch).length === 0) {
      console.log(`   (Claude returned no usable values)`);
      continue;
    }

    const { error: updErr } = await supabase.from("brands").update(patch).eq("id", b.id);
    if (updErr) throw new Error(updErr.message);

    await supabase.from("brand_activity_log").insert({
      brand_id: b.id,
      event_type: "fields_inferred",
      metadata: { source: "fill-missing-fields script", filled: Object.keys(patch) },
    });

    console.log(`   ✓ filled: ${Object.keys(patch).join(", ")}`);
    updated += 1;
  } catch (e) {
    console.log(`   ✗ ${e.message}`);
    errors.push({ brand: b.business_name, error: e.message });
  }
}

console.log(`\n— Done —`);
console.log(`Updated: ${updated}`);
console.log(`Skipped: ${skipped}`);
console.log(`Errors:  ${errors.length}`);
if (errors.length > 0) console.log(JSON.stringify(errors, null, 2));
