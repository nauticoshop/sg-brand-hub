// Dev-only test endpoint: simulates Justin assigning an AM to a deal-sourced
// brand. Mirrors the side-effect chain in updateBrand() — flips the column
// AND fires the "👋 You're up" card to the AMs space.
//
// Used by scripts/_test-am-assigned-card.mjs to verify the routing without
// having to manually click through the brand editor UI.
//
// Guard: requires Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}. The
// service-role key is already the most-privileged secret in the project, so
// gating on it doesn't lower the bar — anyone with it can already do anything
// to the database. A separate token would just be another secret to rotate.
//
// Body:
//   { brand_id: string, am_name: string }

import { NextResponse } from "next/server";
import { fetchDealSnapshot } from "@/lib/monday/deals";
import { notifyAmAssigned } from "@/lib/notifications/handoff";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { BrandLite } from "@/lib/brands/create-from-deal";

export async function POST(request: Request) {
  // Guard
  const auth = request.headers.get("authorization") ?? "";
  const supplied = auth.replace(/^Bearer\s+/i, "");
  const expected = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!expected || supplied !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { brand_id?: string; am_name?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const brandId = body.brand_id?.trim();
  const amName = body.am_name?.trim();
  if (!brandId || !amName) {
    return NextResponse.json({ error: "brand_id and am_name required" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data: brand, error: brandErr } = await admin
    .from("brands")
    .select(
      "id, business_name, submitter_name, submitter_email, submitter_phone, dropbox_folder_url, source_deal_url, source_deal_id, account_manager"
    )
    .eq("id", brandId)
    .single();
  if (brandErr || !brand) {
    return NextResponse.json({ error: `brand not found: ${brandErr?.message ?? "no row"}` }, { status: 404 });
  }
  if (!brand.source_deal_id) {
    return NextResponse.json(
      { error: "brand has no source_deal_id (not a Closed Won handoff)" },
      { status: 400 }
    );
  }

  // Flip the column (mirroring updateBrand) so the DB state matches the card.
  const { error: updErr } = await admin
    .from("brands")
    .update({ account_manager: amName })
    .eq("id", brandId);
  if (updErr) {
    return NextResponse.json({ error: `update failed: ${updErr.message}` }, { status: 500 });
  }

  try {
    const deal = await fetchDealSnapshot(brand.source_deal_id as string);
    const brandLite: BrandLite = {
      id: brand.id as string,
      business_name: brand.business_name as string,
      submitter_name: (brand.submitter_name as string | null) ?? null,
      submitter_email: (brand.submitter_email as string | null) ?? null,
      submitter_phone: (brand.submitter_phone as string | null) ?? null,
      account_manager: amName,
      dropbox_folder_url: (brand.dropbox_folder_url as string | null) ?? null,
      source_deal_url: (brand.source_deal_url as string | null) ?? null,
    };
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
    const briefToolUrl =
      process.env.NEXT_PUBLIC_BRIEF_TOOL_URL ?? "https://sg-brief-tool-nu.vercel.app";
    await notifyAmAssigned({ brand: brandLite, deal, appUrl, briefToolUrl });
    return NextResponse.json({ ok: true, brand_id: brandId, am_name: amName });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
