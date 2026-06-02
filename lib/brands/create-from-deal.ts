// Closed Won classifier. Given a Monday deal item ID this:
//
//   1. Pulls the full deal snapshot (incl. contact info + services).
//   2. Decides the scenario by checking closed_won_dispatches (idempotency)
//      and matching against existing brands:
//        - same_deal        — webhook already dispatched for this deal
//        - returning_client — brand exists in Brand Hub
//        - new_client       — no matching brand
//   3. Returns a structured result for the caller to dispatch notifications.
//
// IMPORTANT: This module no longer creates brand rows, Dropbox folders, or
// briefs. Brands flow through the public intake form (BD sends the link to
// the client). Briefs and project tracking flow through Brief Tool's Project
// Request modal (AM/BD fills it in). The webhook just figures out who to
// notify and the dispatcher pings them.

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { fetchDealSnapshot, type DealSnapshot } from "@/lib/monday/deals";
import { brandFromDealItemName, findExistingBrand } from "@/lib/brands/name-match";
import type { Brand } from "@/types/brand";

export type ClosedWonResult =
  | { kind: "same_deal"; deal: DealSnapshot; brand: BrandLite | null }
  | { kind: "new_client"; deal: DealSnapshot }
  | { kind: "returning_client"; deal: DealSnapshot; brand: BrandLite };

export type BrandLite = Pick<
  Brand,
  | "id"
  | "business_name"
  | "submitter_name"
  | "submitter_email"
  | "submitter_phone"
  | "account_manager"
  | "dropbox_folder_url"
  | "source_deal_url"
>;

const BRAND_COLUMNS =
  "id, business_name, submitter_name, submitter_email, submitter_phone, account_manager, dropbox_folder_url, source_deal_url";

/** Entry point called by the webhook handler. Read-only — no side effects. */
export async function classifyClosedWonDeal(itemId: string): Promise<ClosedWonResult> {
  const deal = await fetchDealSnapshot(itemId);
  const admin = createSupabaseAdminClient();

  // ── Idempotency ─────────────────────────────────────────────────────────
  // Have we already dispatched for this deal? If so, return same_deal so the
  // webhook handler short-circuits.
  const { data: dispatched } = await admin
    .from("closed_won_dispatches")
    .select("brand_id")
    .eq("monday_deal_id", itemId)
    .maybeSingle();

  if (dispatched) {
    let brand: BrandLite | null = null;
    if (dispatched.brand_id) {
      const { data } = await admin
        .from("brands")
        .select(BRAND_COLUMNS)
        .eq("id", dispatched.brand_id as string)
        .maybeSingle();
      brand = (data as BrandLite | null) ?? null;
    }
    return { kind: "same_deal", deal, brand };
  }

  // ── New vs returning ────────────────────────────────────────────────────
  const { data: allBrands } = await admin
    .from("brands")
    .select("id, business_name, website, submitter_email, updated_at");

  const matched = findExistingBrand(
    deal.itemName,
    deal.primaryContact?.email ?? null,
    (allBrands ?? []) as Array<{
      id: string;
      business_name: string;
      website: string | null;
      submitter_email: string | null;
      updated_at: string;
    }>
  );

  if (matched) {
    const { data: full } = await admin
      .from("brands")
      .select(BRAND_COLUMNS)
      .eq("id", matched.id)
      .single();
    return { kind: "returning_client", deal, brand: full as BrandLite };
  }

  return { kind: "new_client", deal };
}

/**
 * Record that we've dispatched notifications for this deal. Called by the
 * webhook handler after dispatchClosedWonNotifications resolves. Subsequent
 * webhook firings for the same deal will short-circuit to same_deal.
 *
 * Safe on conflict — uses upsert so a race between two concurrent invocations
 * just collapses to a single row.
 */
export async function recordClosedWonDispatch(args: {
  monday_deal_id: string;
  brand_id: string | null;
  kind: "new_client" | "returning_client";
}): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("closed_won_dispatches")
    .upsert(
      {
        monday_deal_id: args.monday_deal_id,
        brand_id: args.brand_id,
        kind: args.kind,
      },
      { onConflict: "monday_deal_id" }
    );
  if (error) {
    console.error(`[closed-won] dispatch record failed: ${error.message}`);
  }
}

/**
 * Best-effort name extraction for a brand we don't have yet (new_client).
 * Used in notification copy.
 */
export function newClientBusinessName(deal: DealSnapshot): string {
  return (
    brandFromDealItemName(deal.itemName) ||
    deal.primaryContact?.company ||
    deal.itemName ||
    "New client"
  );
}

/**
 * Suggest a first billing date for a retainer based on the rule:
 * "next 1st or 15th that's at least 5 business days after the close date."
 * Used on the CFO card.
 */
export function suggestFirstBillingDate(closeDate: string | null): string | null {
  if (!closeDate) return null;
  const close = new Date(closeDate + "T00:00:00Z");
  if (Number.isNaN(close.getTime())) return null;
  let d = new Date(close);
  let added = 0;
  while (added < 5) {
    d.setUTCDate(d.getUTCDate() + 1);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) added += 1;
  }
  while (d.getUTCDate() !== 1 && d.getUTCDate() !== 15) {
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return d.toISOString().slice(0, 10);
}
