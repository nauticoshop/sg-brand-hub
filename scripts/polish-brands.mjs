#!/usr/bin/env node
// Sends each imported brand record to Claude for cleanup. Keeps the messy
// client_raw fields intact and rewrites the *_polished / brand_voice /
// look_and_feel / audience / music_notes fields as clean, ready-for-share
// content. Strips embedded URLs from overview text (those belong in their
// own fields). Infers a tagline + coloring_tone when derivable.
//
// Run:
//   node --env-file=.env.local scripts/polish-brands.mjs

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5-20250929";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const SYSTEM_PROMPT = `You are cleaning up brand records that were imported from a messy Monday.com board into Surroundings Group's Brand Hub. The data is for an internal creative team (video editors, designers, AMs) who need clean, scannable brand profiles.

You'll receive one brand's data as JSON. Rewrite the listed fields as polished, professional content. Return ONLY a JSON object with the fields in the schema below — no preamble, no markdown code fences.

GOALS:
- The overview should read like 2–4 sentences of confident, professional brand prose. Not bullet points. Not a copy-paste of notes. Strip out emoji, embedded URLs, and section labels like "Client Overview:" / "Key Selling Points" / "Value Proposition" / "Challenges" — fold the substance into flowing sentences.
- brand_voice = tone & personality (warm, bold, confident, etc.). 1–3 sentences. Distinct from look_and_feel.
- look_and_feel = visual personality (clean, cinematic, coastal, editorial, etc.). 1–3 sentences. Distinct from brand_voice.
- what_to_avoid = clean prose of styles/colors/approaches to avoid. Skip if nothing meaningful.
- audience_type = clean prose description of audience. Skip demographic bullets that belong in audience_gender/audience_age separately.
- audience_gender, audience_age = if extractable from the audience input. Otherwise null.
- music_notes = clean prose direction for music selection. Strip URLs. 1–3 sentences.
- coloring_tone = short phrase describing video color grading direction (e.g. "Warm, natural, earthy" or "Cinematic with crushed shadows"). If derivable from look_and_feel.
- tagline = a short one-liner if the brand's positioning is obvious from the data. Otherwise null.
- vertical = best fit from the enum below.

VERTICAL ENUM:
marine | private_aviation | automotive | real_estate | real_estate_development | multifamily_residential | resort_travel | home_services | other

SCHEMA (return EXACTLY this):
{
  "overview_polished": string,
  "tagline": string | null,
  "brand_voice": string | null,
  "look_and_feel": string | null,
  "what_to_avoid": string | null,
  "audience_gender": string | null,
  "audience_age": string | null,
  "audience_type": string | null,
  "music_notes": string | null,
  "coloring_tone": string | null,
  "vertical": string | null
}

RULES:
- Strip ALL URLs from text fields. URLs belong in their own columns, not in prose.
- Strip emojis from text fields.
- Don't invent facts. If a field has nothing to draw from, return null.
- Keep the brand's actual voice — don't make a warm/approachable brand sound corporate.
- Plural sections like "Key Selling Points: Luxury Living: ... Amenities: ... Design: ..." should be condensed into ONE flowing paragraph, not preserved as labels.
- Sentence case for prose. ALL CAPS only for true proper nouns.
- If overview_polished input is empty/null, return null for it.`;

async function polishOne(brand) {
  const input = {
    business_name: brand.business_name,
    raw_overview: brand.overview_client_raw,
    raw_brand_voice: brand.brand_voice,
    raw_look_and_feel: brand.look_and_feel,
    raw_what_to_avoid: brand.what_to_avoid,
    raw_audience_type: brand.audience_type,
    raw_audience_gender: brand.audience_gender,
    raw_audience_age: brand.audience_age,
    raw_music_notes: brand.music_notes,
    raw_music_mood: brand.music_mood,
    raw_music_genre: brand.music_genre,
    raw_inspiration: brand.inspiration_references,
    current_vertical: brand.vertical,
    website: brand.website,
    instagram: brand.instagram,
  };

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: `Clean up this brand record:\n\n${JSON.stringify(input, null, 2)}`,
      },
    ],
  });

  const block = response.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") throw new Error("No text response from Claude");

  let json = block.text.trim();
  json = json.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
  return JSON.parse(json);
}

// ---- main ----

const { data: brands, error } = await supabase
  .from("brands")
  .select("*")
  .eq("status", "in_review")
  .order("business_name", { ascending: true });

if (error) {
  console.error("Failed to fetch brands:", error.message);
  process.exit(1);
}

console.log(`Polishing ${brands.length} brands...\n`);

let polished = 0;
let errors = [];

for (const brand of brands) {
  process.stdout.write(`→ ${brand.business_name}... `);
  try {
    const cleaned = await polishOne(brand);

    const validVerticals = new Set([
      "marine",
      "private_aviation",
      "automotive",
      "real_estate",
      "real_estate_development",
      "multifamily_residential",
      "resort_travel",
      "home_services",
      "other",
    ]);

    const update = {
      overview_polished: cleaned.overview_polished?.trim() || brand.overview_client_raw,
      tagline: cleaned.tagline?.trim() || null,
      brand_voice: cleaned.brand_voice?.trim() || null,
      look_and_feel: cleaned.look_and_feel?.trim() || null,
      what_to_avoid: cleaned.what_to_avoid?.trim() || null,
      audience_gender: cleaned.audience_gender?.trim() || null,
      audience_age: cleaned.audience_age?.trim() || null,
      audience_type: cleaned.audience_type?.trim() || null,
      music_notes: cleaned.music_notes?.trim() || null,
      coloring_tone: cleaned.coloring_tone?.trim() || null,
      vertical:
        cleaned.vertical && validVerticals.has(cleaned.vertical) ? cleaned.vertical : brand.vertical,
      ai_enriched_at: new Date().toISOString(),
      ai_enrichment_version: "polish-v1",
    };

    const { error: updErr } = await supabase.from("brands").update(update).eq("id", brand.id);
    if (updErr) throw new Error(updErr.message);

    await supabase.from("brand_activity_log").insert({
      brand_id: brand.id,
      event_type: "enriched",
      metadata: { version: "polish-v1", model: MODEL },
    });

    console.log("✓");
    polished += 1;
  } catch (e) {
    console.log(`✗ ${e.message}`);
    errors.push({ brand: brand.business_name, error: e.message });
  }
}

console.log(`\n— Done —`);
console.log(`Polished: ${polished}`);
console.log(`Errors: ${errors.length}`);
if (errors.length > 0) console.log(JSON.stringify(errors, null, 2));
