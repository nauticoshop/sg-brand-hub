import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isEmailAllowed } from "@/lib/auth/domain";
import { extractBrandFromPdf } from "@/lib/anthropic/extract-pdf";

const VALID_VERTICALS = new Set([
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

// Claude's PDF processing can take 30–60s for a multi-page doc.
export const maxDuration = 120;

export async function POST(request: Request) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isEmailAllowed(user.email)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
  if (file.type !== "application/pdf") {
    return NextResponse.json({ error: "Must be a PDF" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let extracted;
  try {
    extracted = await extractBrandFromPdf(buffer);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  if (!extracted.business_name || extracted.business_name.trim() === "") {
    return NextResponse.json(
      { error: "Couldn't find a business name in this PDF — manual review needed." },
      { status: 422 }
    );
  }

  // Sanitize: drop any vertical Claude invented, drop bad hex codes, fill in font defaults.
  const vertical =
    extracted.vertical && VALID_VERTICALS.has(extracted.vertical) ? extracted.vertical : null;

  const colors = (extracted.colors ?? [])
    .filter((c) => c && /^#[0-9A-Fa-f]{6}$/.test(c.hex))
    .map((c, i) => ({
      name: c.name?.trim() || (c.role === "secondary" ? `Secondary ${i + 1}` : `Primary ${i + 1}`),
      hex: c.hex.toUpperCase(),
      role: c.role === "secondary" ? "secondary" : "primary",
    }));

  const fonts = (extracted.fonts ?? [])
    .filter((f) => f && f.name && f.name.trim().length > 0)
    .map((f) => ({
      name: f.name.trim(),
      role: f.role === "secondary" ? "secondary" : "primary",
      use_case: f.use_case ?? (f.role === "secondary" ? "Body copy" : "Headlines, titles"),
    }));

  const { data: brand, error } = await supabase
    .from("brands")
    .insert({
      business_name: extracted.business_name.trim(),
      overview_client_raw: extracted.overview,
      overview_polished: extracted.overview, // populated so the share/PDF have content immediately
      tagline: extracted.tagline,
      vertical,
      vertical_other: vertical === "other" ? extracted.vertical_other : null,
      website: extracted.website,
      instagram: extracted.instagram,
      facebook: extracted.facebook,
      youtube: extracted.youtube,
      tiktok: extracted.tiktok,
      linkedin: extracted.linkedin,
      audience_gender: extracted.audience_gender,
      audience_age: extracted.audience_age,
      audience_type: extracted.audience_type,
      brand_voice: extracted.brand_voice,
      look_and_feel: extracted.look_and_feel,
      what_to_avoid: extracted.what_to_avoid,
      inspiration_references: extracted.inspiration_references,
      coloring_tone: extracted.coloring_tone,
      music_mood: extracted.music_mood ?? [],
      music_genre: extracted.music_genre ?? [],
      music_notes: extracted.music_notes,
      client_monday_board_url: extracted.client_monday_board_url,
      dropbox_folder_url: extracted.dropbox_folder_url,
      client_asset_folder_url: extracted.brand_guidelines_external_url,
      colors,
      fonts,
      status: "in_review",
      created_by: user.id,
    })
    .select("id, business_name")
    .single();

  if (error || !brand) {
    return NextResponse.json({ error: error?.message ?? "Failed to save brand" }, { status: 500 });
  }

  await supabase.from("brand_activity_log").insert({
    brand_id: brand.id,
    user_id: user.id,
    event_type: "imported",
    metadata: { source: "pdf_import", filename: file.name },
  });

  return NextResponse.json({ id: brand.id, business_name: brand.business_name });
}
