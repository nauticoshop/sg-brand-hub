"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { BrandColor, BrandFont } from "@/types/brand";

type BrandPatch = Partial<{
  business_name: string;
  website: string | null;
  tagline: string | null;
  vertical: string | null;
  vertical_other: string | null;
  submitter_name: string | null;
  submitter_email: string | null;
  submitter_phone: string | null;
  account_manager: string | null;
  client_asset_folder_url: string | null;
  client_monday_board_url: string | null;
  dropbox_folder_url: string | null;
  video_assets_folder_url: string | null;
  canva_brand_kit_url: string | null;
  instagram: string | null;
  facebook: string | null;
  youtube: string | null;
  tiktok: string | null;
  linkedin: string | null;
  overview_client_raw: string | null;
  overview_polished: string | null;
  look_and_feel: string | null;
  brand_voice: string | null;
  what_to_avoid: string | null;
  inspiration_references: string | null;
  audience_gender: string | null;
  audience_age: string | null;
  audience_type: string | null;
  coloring_tone: string | null;
  music_mood: string[] | null;
  music_genre: string[] | null;
  music_notes: string | null;
  colors: BrandColor[];
  fonts: BrandFont[];
  internal_notes: string | null;
  status: "draft" | "submitted" | "in_review" | "approved" | "archived";
  engagement_type: "retainer" | "project" | "inactive";
}>;

export async function updateBrand(id: string, patch: BrandPatch) {
  const supabase = createSupabaseServerClient();

  // Auto-flip: if this edit didn't include a status change, and the brand is
  // still sitting in `submitted` or `draft`, the AM is actively working on
  // it now — bump to `in_review`. One-shot transition, happens silently on
  // the first edit after a public form submission.
  let effectivePatch: BrandPatch = patch;
  if (!patch.status) {
    const { data: current } = await supabase
      .from("brands")
      .select("status")
      .eq("id", id)
      .single();
    if (current?.status === "submitted" || current?.status === "draft") {
      effectivePatch = { ...patch, status: "in_review" };
    }
  }

  const { error } = await supabase.from("brands").update(effectivePatch).eq("id", id);
  if (error) return { ok: false as const, error: error.message };

  await supabase.from("brand_activity_log").insert({
    brand_id: id,
    event_type: "edited",
    metadata: { fields: Object.keys(patch) },
  });

  revalidatePath(`/brand/${id}`);

  // Keep the public share page in sync so external editors see latest content
  // without needing a hard refresh.
  const { data: brandRow } = await supabase
    .from("brands")
    .select("share_token")
    .eq("id", id)
    .single();
  if (brandRow?.share_token) {
    revalidatePath(`/share/${brandRow.share_token}`);
  }

  return { ok: true as const };
}

export async function deleteLogo(brandId: string, logoId: string, filePath: string) {
  const supabase = createSupabaseServerClient();
  await supabase.storage.from("brand-logos").remove([filePath]);
  await supabase.from("brand_logos").delete().eq("id", logoId);
  await supabase.from("brand_activity_log").insert({
    brand_id: brandId,
    event_type: "logo_deleted",
    metadata: { logo_id: logoId, file_path: filePath },
  });
  revalidatePath(`/brand/${brandId}`);
}

export async function reorderLogos(brandId: string, orderedIds: string[]) {
  const supabase = createSupabaseServerClient();
  await Promise.all(
    orderedIds.map((id, i) =>
      supabase.from("brand_logos").update({ display_order: i }).eq("id", id)
    )
  );
  revalidatePath(`/brand/${brandId}`);
}

export async function approveBrand(id: string) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Phase 1 scope: generate + save PDF, flip status, log it.
  // Monday + Dropbox sync land in Phase 2.
  const pdfRes = await fetch(
    `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/brands/${id}/pdf?save=1`,
    { method: "POST" }
  );
  if (!pdfRes.ok) {
    const text = await pdfRes.text();
    return { ok: false as const, error: `PDF generation failed: ${text}` };
  }

  const { error } = await supabase
    .from("brands")
    .update({
      status: "approved",
      approved_at: new Date().toISOString(),
      approved_by: user?.id,
    })
    .eq("id", id);

  if (error) return { ok: false as const, error: error.message };

  await supabase.from("brand_activity_log").insert({
    brand_id: id,
    event_type: "approved",
    user_id: user?.id,
  });

  revalidatePath(`/brand/${id}`);
  return { ok: true as const };
}

export async function deleteBrand(id: string) {
  const supabase = createSupabaseServerClient();
  await supabase.from("brands").delete().eq("id", id);
  redirect("/dashboard");
}
