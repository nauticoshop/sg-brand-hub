// Seed a draft brief in Brief Tool's `briefs` table when a Content service
// deal closes. The draft is pre-populated with everything we already know
// from the brand + deal, so the AM just opens it, fills in deliverable
// specifics, and clicks "Project Request" — which fires Brief Tool's own
// flow (Monday item + sub-items + calendar invite).
//
// We DO NOT create the Monday All Projects item from Brand Hub. Brief Tool's
// existing Project Request handler is the one source of truth for that.

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Brand } from "@/types/brand";
import type { DealSnapshot } from "@/lib/monday/deals";

/** Mirrors Brief Tool's id format: brief_<unix-ms>_<7-char-random>. */
function newBriefId(): string {
  return `brief_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export type SeedBriefInput = {
  brand: Pick<Brand, "id" | "business_name" | "submitter_name" | "submitter_email" | "submitter_phone" | "account_manager">;
  projectName: string;
  deal: DealSnapshot;
};

/**
 * Create a draft brief row. Returns the new brief id. Idempotency: callers
 * should pre-check for an existing brief tied to the deal (we don't dedup
 * here because the same deal can spawn briefs over time for revisions etc).
 */
export async function seedBrief(input: SeedBriefInput): Promise<string> {
  const admin = createSupabaseAdminClient();

  // data_json schema mirrors the keys Brief Tool's editor reads — see
  // sg-brief-tool/src/components/briefs/brief-editor.tsx. Unknown fields are
  // ignored by the editor, missing fields default to empty strings.
  const briefData = {
    // Identity
    client: input.brand.business_name,
    project: input.projectName,
    project_type: "Content",

    // People
    am: input.brand.account_manager ?? "",
    poc_name: input.brand.submitter_name ?? input.deal.primaryContact?.name ?? "",
    poc_email: input.brand.submitter_email ?? input.deal.primaryContact?.email ?? "",
    poc_num: input.brand.submitter_phone ?? input.deal.primaryContact?.phone ?? "",

    // Provenance — so the AM (and a future audit script) knows where this came from.
    auto_created: true,
    auto_created_at: new Date().toISOString(),
    source: "brand_hub_closed_won_webhook",
    source_deal_id: input.deal.itemId,
    source_deal_url: input.deal.url,
    source_deal_value: input.deal.dealValue,
    source_deal_type: input.deal.dealType,
  };

  const id = newBriefId();
  const now = new Date().toISOString();
  const { error } = await admin.from("briefs").insert({
    id,
    brand_id: input.brand.id,
    data_json: briefData,
    created_at: now,
    updated_at: now,
  });
  if (error) throw new Error(`Brief seed failed: ${error.message}`);

  return id;
}

/**
 * Build the share URL for a Brief Tool brief — used in notification cards
 * so the AM can jump straight into the seeded draft.
 */
export function briefShareUrl(briefId: string): string {
  const base = process.env.NEXT_PUBLIC_BRIEF_TOOL_URL ?? "https://sg-brief-tool-nu.vercel.app";
  return `${base}/share/${briefId}`;
}
