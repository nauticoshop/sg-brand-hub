import { NextResponse } from "next/server";
import { intakeSchema } from "@/app/(public)/intake/schema";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { notifyIntakeSubmission } from "@/lib/notifications/intake";

export async function POST(request: Request) {
  const raw = await request.json();
  const parsed = intakeSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const v = parsed.data;

  const colors = (v.colors ?? []).map((c) => ({
    name: c.name?.trim() || (c.role === "primary" ? "Primary" : "Secondary"),
    hex: c.hex.toUpperCase(),
    role: c.role,
  }));

  const fonts = (v.fonts ?? []).map((f) => ({
    name: f.name.trim(),
    role: f.role,
    use_case: f.use_case?.trim() || (f.role === "primary" ? "Headlines, titles" : "Body copy"),
  }));

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("brands")
    .insert({
      submitter_name: v.submitter_name,
      submitter_email: v.submitter_email,
      submitter_phone: v.submitter_phone || null,

      business_name: v.business_name,
      website: v.website || null,
      tagline: v.tagline || null,
      vertical: v.vertical || null,
      vertical_other: v.vertical === "other" ? v.vertical_other || null : null,

      overview_client_raw: v.overview_client_raw || null,
      look_and_feel: v.look_and_feel || null,
      what_to_avoid: v.what_to_avoid || null,
      inspiration_references: v.inspiration_references || null,

      audience_gender: v.audience_gender || null,
      audience_age: v.audience_age || null,
      audience_type: v.audience_type || null,
      music_notes: v.music_notes || null,

      client_asset_folder_url: v.client_asset_folder_url || null,

      instagram: v.instagram || null,
      facebook: v.facebook || null,
      youtube: v.youtube || null,
      tiktok: v.tiktok || null,
      linkedin: v.linkedin || null,

      colors,
      fonts,
      status: "submitted",
    })
    .select("id")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Could not save submission" }, { status: 500 });
  }

  await supabase.from("brand_activity_log").insert({
    brand_id: data.id,
    event_type: "submitted",
    metadata: { source: "public_intake", submitter: v.submitter_email },
  });

  // Notify the team. We DON'T await this — the user's form submit shouldn't
  // wait on Slack's webhook latency, and the helper swallows errors anyway.
  // The brand row is already safely persisted at this point.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
  notifyIntakeSubmission({
    brandId: data.id,
    businessName: v.business_name,
    submitterName: v.submitter_name,
    submitterEmail: v.submitter_email,
    vertical: v.vertical || null,
    hasColors: colors.length > 0,
    appUrl,
  });

  return NextResponse.json({ id: data.id });
}
