import { NextResponse } from "next/server";
import { intakeSchema } from "@/app/(public)/intake/schema";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { notifyIntakeSubmission } from "@/lib/notifications/intake";
import { notifyAmHeadAssignmentNeeded } from "@/lib/notifications/handoff";
import { fetchDealSnapshot } from "@/lib/monday/deals";
import type { BrandLite } from "@/lib/brands/create-from-deal";
import { alertError } from "@/lib/notifications/alert";

export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Honeypot — the public form renders a hidden field named `website_alt`
  // that real humans never see and bots dutifully fill in. If it's set, we
  // return success (so the bot doesn't retry with a workaround) but never
  // create a brand row.
  if (typeof raw === "object" && raw !== null) {
    const hp = (raw as Record<string, unknown>).website_alt;
    if (typeof hp === "string" && hp.trim().length > 0) {
      console.warn(`[intake] Honeypot triggered, dropping submission silently. value=${hp.slice(0, 40)}`);
      return NextResponse.json({ id: "honeypot" }, { status: 200 });
    }
  }

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

  // If the intake came from a BD's pre-stamped Closed Won link
  // (/intake?deal_id=…), wire it back to the Monday deal so the brand record
  // links to the deal in the UI and downstream tooling can reconcile.
  const sourceDealId = v.source_deal_id?.trim() || null;
  const sourceDealUrl = sourceDealId
    ? `https://nauticalnetwork.monday.com/pulses/${sourceDealId}`
    : null;

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

      source_deal_id: sourceDealId,
      source_deal_url: sourceDealUrl,

      colors,
      fonts,
      status: "submitted",
    })
    .select("id")
    .single();

  if (error || !data) {
    alertError({
      flow: "intake.insert",
      brandName: v.business_name,
      error: error?.message ?? "no row returned",
      extras: { submitter: v.submitter_email },
    });
    return NextResponse.json({ error: error?.message ?? "Could not save submission" }, { status: 500 });
  }

  await supabase.from("brand_activity_log").insert({
    brand_id: data.id,
    event_type: "submitted",
    metadata: {
      source: sourceDealId ? "closed_won_intake_link" : "public_intake",
      submitter: v.submitter_email,
      ...(sourceDealId ? { monday_deal_id: sourceDealId } : {}),
    },
  });

  // Notify the team. We DON'T await this — the user's form submit shouldn't
  // wait on the webhook latency, and the helper swallows errors anyway.
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

  // If the intake came from a Closed Won deal-stamped link, fire a DM to
  // Justin (AM Head) so he can assign an AM. Fetch the deal snapshot fresh
  // — we need it to include deal context in the card. We DO await this so
  // Vercel doesn't kill the fetch on serverless shutdown.
  if (sourceDealId) {
    try {
      const deal = await fetchDealSnapshot(sourceDealId);
      const brandLite: BrandLite = {
        id: data.id as string,
        business_name: v.business_name,
        submitter_name: v.submitter_name,
        submitter_email: v.submitter_email,
        submitter_phone: v.submitter_phone || null,
        account_manager: null,
        dropbox_folder_url: null,
        source_deal_url: sourceDealUrl,
      };
      await notifyAmHeadAssignmentNeeded({ brand: brandLite, deal, appUrl });
    } catch (e) {
      // Don't fail the intake response if the notification flow has issues —
      // the brand row is safely persisted and the team can still see it on
      // the dashboard via notifyIntakeSubmission above.
      alertError({
        flow: "intake.am_head_dm",
        brandName: v.business_name,
        error: e,
        extras: { source_deal_id: sourceDealId },
      });
    }
  }

  return NextResponse.json({ id: data.id });
}
