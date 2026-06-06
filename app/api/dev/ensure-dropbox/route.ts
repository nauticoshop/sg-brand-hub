// Dev-only: backfill a brand's Dropbox parent folder if it was missed
// (e.g. for brands that submitted before the on-intake Dropbox creation
// went live). Idempotent — runs ensureBrandFolderTree, then writes the
// returned share URL back onto the brand row.
//
// Guard: bearer token = SUPABASE_SERVICE_ROLE_KEY (already the most-
// privileged secret in the project, so gating on it doesn't lower the
// bar — anyone with it can already do anything to the DB).
//
// Body: { brand_id: string }

import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ensureBrandFolderTree } from "@/lib/dropbox/client";

export async function POST(request: Request) {
  // Guard
  const auth = request.headers.get("authorization") ?? "";
  const supplied = auth.replace(/^Bearer\s+/i, "");
  const expected = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!expected || supplied !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { brand_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const brandId = body.brand_id?.trim();
  if (!brandId) {
    return NextResponse.json({ error: "brand_id required" }, { status: 400 });
  }

  if (
    !process.env.DROPBOX_REFRESH_TOKEN ||
    !process.env.DROPBOX_APP_KEY ||
    !process.env.DROPBOX_APP_SECRET
  ) {
    return NextResponse.json(
      { error: "Dropbox env vars not configured on this deployment" },
      { status: 500 }
    );
  }

  const admin = createSupabaseAdminClient();
  const { data: brand, error: brandErr } = await admin
    .from("brands")
    .select("id, business_name, dropbox_folder_url")
    .eq("id", brandId)
    .single();
  if (brandErr || !brand) {
    return NextResponse.json(
      { error: `brand not found: ${brandErr?.message ?? "no row"}` },
      { status: 404 }
    );
  }

  try {
    const tree = await ensureBrandFolderTree(brand.business_name as string);
    await admin
      .from("brands")
      .update({ dropbox_folder_url: tree.shareUrl })
      .eq("id", brandId);
    return NextResponse.json({
      ok: true,
      brand_id: brandId,
      business_name: brand.business_name,
      parentPath: tree.parentPath,
      shareUrl: tree.shareUrl,
      was_already_set: !!brand.dropbox_folder_url,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
