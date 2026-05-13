"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Brand, BrandColor, BrandFont } from "@/types/brand";
import {
  createIntakeItem,
  updateIntakeColumns,
  createAllProjectsParent,
  postUpdate,
  buildIntakeColumnValues,
  buildSubitemDescription,
  mention,
  findUserByName,
  ALL_PROJECTS_INTAKE_GROUP_ID,
  ALL_PROJECTS_PROJECT_TYPE_COLUMN,
  PROJECT_TYPE_VIDEO_ASSETS_INDEX,
  ALL_PROJECTS_COLUMNS,
} from "@/lib/monday/client";
import { ensureBrandFolderTree } from "@/lib/dropbox/client";

// Display name for the default editor used in @ mentions on Monday updates.
// Kept in code rather than env to make the HTML mention copy obvious.
const DEFAULT_EDITOR_NAME = "Rendi Andrianto";

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

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const intakeBoardId = process.env.MONDAY_BOARD_ID_INTAKE;
  const allProjectsBoardId = process.env.MONDAY_BOARD_ID_ALL_PROJECTS;
  const defaultEditorId = process.env.MONDAY_DEFAULT_EDITOR_USER_ID;

  // 1) Generate + save the brand guideline PDF.
  const pdfRes = await fetch(`${appUrl}/api/brands/${id}/pdf?save=1`, { method: "POST" });
  if (!pdfRes.ok) {
    const text = await pdfRes.text();
    return { ok: false as const, error: `PDF generation failed: ${text}` };
  }

  // 2) Fetch the fresh brand record (with the new PDF URL).
  const { data: brandRow, error: fetchErr } = await supabase
    .from("brands")
    .select("*")
    .eq("id", id)
    .single();
  if (fetchErr || !brandRow) {
    return { ok: false as const, error: fetchErr?.message ?? "Brand not found" };
  }
  const b = brandRow as Brand;
  const shareUrl = `${appUrl}/share/${b.share_token}`;
  const syncWarnings: string[] = [];

  // 3) Dropbox — create the parent folder tree if we don't already have one
  //    on the brand. Idempotent (Dropbox returns existing folders / share
  //    link if they already exist). Run before Monday so the Intake sync
  //    can include the fresh Dropbox URL.
  let effectiveDropboxUrl = b.dropbox_folder_url;
  if (
    !effectiveDropboxUrl &&
    process.env.DROPBOX_REFRESH_TOKEN &&
    process.env.DROPBOX_APP_KEY &&
    process.env.DROPBOX_APP_SECRET
  ) {
    try {
      const tree = await ensureBrandFolderTree(b.business_name);
      effectiveDropboxUrl = tree.shareUrl;
      await supabase
        .from("brands")
        .update({ dropbox_folder_url: tree.shareUrl })
        .eq("id", id);
    } catch (e) {
      syncWarnings.push(`Dropbox folder creation failed: ${(e as Error).message}`);
    }
  }

  // 4) Monday — Client Onboarding Asset Intake board.
  //    If we already know the Monday item ID, UPDATE it. Otherwise CREATE.
  if (intakeBoardId && process.env.MONDAY_API_TOKEN) {
    try {
      const columnValues = buildIntakeColumnValues(
        {
          business_name: b.business_name,
          brand_guideline_pdf_url: b.brand_guideline_pdf_url,
          share_token: b.share_token,
          website: b.website,
          dropbox_folder_url: effectiveDropboxUrl,
          overview_polished: b.overview_polished,
          audience_type: b.audience_type,
          music_notes: b.music_notes,
          colors: b.colors,
          fonts: b.fonts,
        },
        appUrl
      );

      if (b.monday_intake_item_id) {
        await updateIntakeColumns({
          boardId: intakeBoardId,
          itemId: b.monday_intake_item_id,
          columnValues,
        });
      } else {
        const created = await createIntakeItem({
          boardId: intakeBoardId,
          itemName: b.business_name,
          columnValues,
        });
        await supabase
          .from("brands")
          .update({ monday_intake_item_id: created.id })
          .eq("id", id);
      }
    } catch (e) {
      syncWarnings.push(`Intake board sync failed: ${(e as Error).message}`);
    }
  }

  // 4) Monday — All Projects: create parent item in the Project Intake group
  //    with Project Type set to "Video Assets". Subitems are intentionally NOT
  //    created here — the user has their own Monday automation that fires when
  //    Project Type = Video Assets to spawn the subitems.
  //    Idempotent: only runs if monday_all_projects_item_id is null on the brand.
  if (
    !b.monday_all_projects_item_id &&
    allProjectsBoardId &&
    process.env.MONDAY_API_TOKEN
  ) {
    try {
      // Look up the AM by name so we can assign the AM/BD person column
      // and pre-fill primary contact info from their Monday profile.
      let amUser: { id: string; name: string; email: string | null; phone: string | null } | null = null;
      if (b.account_manager?.trim()) {
        try {
          amUser = await findUserByName(b.account_manager);
        } catch (amErr) {
          syncWarnings.push(
            `Couldn't look up AM "${b.account_manager}": ${(amErr as Error).message}`
          );
        }
      }

      const columnValues: Record<string, unknown> = {
        [ALL_PROJECTS_PROJECT_TYPE_COLUMN]: { index: PROJECT_TYPE_VIDEO_ASSETS_INDEX },
        // Client dropdown — Monday will reuse an existing label of this name
        // or create one if it doesn't exist (create_labels_if_missing: true).
        [ALL_PROJECTS_COLUMNS.client]: { labels: [b.business_name] },
      };

      if (amUser) {
        columnValues[ALL_PROJECTS_COLUMNS.amBd] = {
          personsAndTeams: [{ id: Number(amUser.id), kind: "person" }],
        };
        columnValues[ALL_PROJECTS_COLUMNS.primaryName] = amUser.name;
        if (amUser.email) columnValues[ALL_PROJECTS_COLUMNS.primaryEmail] = amUser.email;
        if (amUser.phone) columnValues[ALL_PROJECTS_COLUMNS.primaryPhone] = amUser.phone;
      }

      const parent = await createAllProjectsParent({
        boardId: allProjectsBoardId,
        itemName: `${b.business_name} | Video Assets`,
        groupId: ALL_PROJECTS_INTAKE_GROUP_ID,
        columnValues,
      });

      // Post an update on the parent tagging Rendi with the project details.
      const description = buildSubitemDescription({
        brandName: b.business_name,
        shareUrl,
        pdfUrl: b.brand_guideline_pdf_url,
        dropboxUrl: effectiveDropboxUrl,
      });
      const tag = defaultEditorId ? `Hi ${mention(defaultEditorId, DEFAULT_EDITOR_NAME)} — ` : "";
      try {
        await postUpdate({
          itemId: parent.id,
          body: `${tag}Brand approved and ready to start video assets.\n\n${description}`,
        });
      } catch (updateErr) {
        syncWarnings.push(`Couldn't post update: ${(updateErr as Error).message}`);
      }

      await supabase
        .from("brands")
        .update({ monday_all_projects_item_id: parent.id })
        .eq("id", id);
    } catch (e) {
      syncWarnings.push(`All Projects sync failed: ${(e as Error).message}`);
    }
  }

  // 5) Flip status to approved + log it.
  const { error: updErr } = await supabase
    .from("brands")
    .update({
      status: "approved",
      approved_at: new Date().toISOString(),
      approved_by: user?.id,
    })
    .eq("id", id);
  if (updErr) return { ok: false as const, error: updErr.message };

  await supabase.from("brand_activity_log").insert({
    brand_id: id,
    event_type: "approved",
    user_id: user?.id,
    metadata: { sync_warnings: syncWarnings.length > 0 ? syncWarnings : undefined },
  });

  revalidatePath(`/brand/${id}`);
  revalidatePath(`/share/${b.share_token}`);
  revalidatePath("/dashboard");

  return { ok: true as const, warnings: syncWarnings };
}

export async function deleteBrand(id: string) {
  const supabase = createSupabaseServerClient();
  await supabase.from("brands").delete().eq("id", id);
  redirect("/dashboard");
}
