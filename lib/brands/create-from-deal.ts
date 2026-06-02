// Create a Brand Hub brand draft from a Monday deal that just closed. Called
// by the Closed Won webhook. Idempotent — if a brand already exists for this
// deal, returns the existing record instead of creating a duplicate.

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { fetchDealSnapshot, mapDealTypeToEngagement, type DealSnapshot } from "@/lib/monday/deals";

export type CreateFromDealResult = {
  brandId: string;
  businessName: string;
  alreadyExisted: boolean;
  deal: DealSnapshot;
};

export async function createBrandFromDeal(itemId: string): Promise<CreateFromDealResult> {
  const deal = await fetchDealSnapshot(itemId);
  const admin = createSupabaseAdminClient();

  // Idempotency: if we already created a brand for this deal, return it.
  const { data: existing } = await admin
    .from("brands")
    .select("id, business_name")
    .eq("source_deal_id", itemId)
    .maybeSingle();
  if (existing) {
    return {
      brandId: existing.id,
      businessName: existing.business_name,
      alreadyExisted: true,
      deal,
    };
  }

  // The deal item name often follows "Brand | Project description" — use the
  // part before the pipe as the brand name. Fall back to the full item name
  // (or contact's company) when there's no separator.
  const itemNameBrand = deal.itemName.split("|")[0]?.trim();
  const businessName =
    itemNameBrand ||
    deal.primaryContact?.company ||
    deal.itemName ||
    "Untitled brand";

  const engagement = mapDealTypeToEngagement(deal.dealType);

  const note = [
    `🤝 Auto-created from Monday deal "${deal.itemName}".`,
    deal.dealValue != null ? `Deal value: $${deal.dealValue.toLocaleString()}.` : null,
    deal.dealType ? `Deal type: ${deal.dealType}.` : null,
    deal.closeDate ? `Closed: ${deal.closeDate}.` : null,
    deal.bd ? `BD: ${deal.bd}.` : null,
    deal.dealIdentifiers.length > 0 ? `Credit: ${deal.dealIdentifiers.join(", ")}.` : null,
    `Monday deal: ${deal.url}`,
  ]
    .filter(Boolean)
    .join("\n");

  const insert = {
    business_name: businessName,
    submitter_name: deal.primaryContact?.name ?? null,
    submitter_email: deal.primaryContact?.email ?? null,
    submitter_phone: deal.primaryContact?.phone ?? null,
    engagement_type: engagement,
    internal_notes: note,
    source_deal_id: deal.itemId,
    source_deal_url: deal.url,
    status: "submitted" as const,
  };

  const { data: created, error } = await admin
    .from("brands")
    .insert(insert)
    .select("id, business_name")
    .single();
  if (error || !created) {
    throw new Error(`Failed to insert brand from deal: ${error?.message ?? "no row"}`);
  }

  await admin.from("brand_activity_log").insert({
    brand_id: created.id,
    event_type: "created_from_deal",
    metadata: {
      monday_deal_id: deal.itemId,
      monday_deal_url: deal.url,
      deal_name: deal.itemName,
      deal_value: deal.dealValue,
      deal_type: deal.dealType,
      bd: deal.bd,
      deal_identifiers: deal.dealIdentifiers,
    },
  });

  return {
    brandId: created.id,
    businessName: created.business_name,
    alreadyExisted: false,
    deal,
  };
}
