// Closed Won webhook orchestrator. Given a Monday deal item ID, this:
//
//   1. Pulls the full deal snapshot (incl. multi-select Service Type).
//   2. Decides the scenario:
//        - same_deal    — webhook re-fired for an already-processed deal
//        - existing_client — returning client; brand already exists
//        - new_client   — brand-new business
//   3. For new clients: creates the brand row + brand parent Dropbox folder.
//   4. For each Service Type on the deal, creates one brand_projects row:
//        - Content: also creates the project Dropbox subfolder + seeds a
//                   Brief Tool draft.
//        - Social/Website/Brand Strategy: no folder, no brief, just the row.
//   5. Returns a structured result for the caller to dispatch notifications.

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  CONTENT_SERVICE,
  fetchDealSnapshot,
  mapDealTypeToEngagement,
  type DealSnapshot,
  type ServiceType,
} from "@/lib/monday/deals";
import { ensureBrandFolderTree, ensureProjectFolderTree } from "@/lib/dropbox/client";
import {
  brandFromDealItemName,
  findExistingBrand,
  projectFromDealItemName,
} from "@/lib/brands/name-match";
import { seedBrief } from "@/lib/brief-tool/seed-brief";
import type { Brand } from "@/types/brand";

export type ProjectOutcome = {
  /** brand_projects.id */
  id: string;
  service_type: ServiceType;
  project_name: string;
  /** Set only for Content. */
  dropbox_project_folder_url: string | null;
  /** Set only for Content. */
  brief_id: string | null;
};

export type ClosedWonResult =
  | { kind: "same_deal"; brand: BrandLite; projects: ProjectOutcome[] }
  | {
      kind: "new_client";
      brand: BrandLite;
      deal: DealSnapshot;
      projects: ProjectOutcome[];
    }
  | {
      kind: "existing_client";
      brand: BrandLite;
      deal: DealSnapshot;
      projects: ProjectOutcome[];
    };

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

/** Entry point called by the webhook handler. */
export async function processClosedWonDeal(itemId: string): Promise<ClosedWonResult> {
  const deal = await fetchDealSnapshot(itemId);
  const admin = createSupabaseAdminClient();

  // ── Scenario detection ──────────────────────────────────────────────────

  // Same deal re-fired? If we already have brand_projects rows tagged with
  // this monday_deal_id, the webhook is replaying — return early with no
  // side effects.
  const { data: existingProjectRows } = await admin
    .from("brand_projects")
    .select("id, brand_id, service_type, project_name, dropbox_project_folder_url, brief_id")
    .eq("monday_deal_id", itemId);

  if (existingProjectRows && existingProjectRows.length > 0) {
    const brandId = existingProjectRows[0].brand_id as string;
    const { data: brand } = await admin
      .from("brands")
      .select(
        "id, business_name, submitter_name, submitter_email, submitter_phone, account_manager, dropbox_folder_url, source_deal_url"
      )
      .eq("id", brandId)
      .single();
    return {
      kind: "same_deal",
      brand: (brand ?? { id: brandId }) as BrandLite,
      projects: existingProjectRows.map((p) => ({
        id: p.id as string,
        service_type: p.service_type as ServiceType,
        project_name: p.project_name as string,
        dropbox_project_folder_url: (p.dropbox_project_folder_url as string) ?? null,
        brief_id: (p.brief_id as string) ?? null,
      })),
    };
  }

  // Try to find an existing brand (returning client).
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

  // ── New-client path: create the brand record + parent Dropbox folder ────
  let brand: BrandLite;
  let isNewClient = false;
  if (matched) {
    const { data: full } = await admin
      .from("brands")
      .select(
        "id, business_name, submitter_name, submitter_email, submitter_phone, account_manager, dropbox_folder_url, source_deal_url"
      )
      .eq("id", matched.id)
      .single();
    brand = full as BrandLite;
  } else {
    brand = await createNewBrandFromDeal(deal);
    isNewClient = true;
  }

  // Always ensure the brand parent Dropbox folder exists. For new clients
  // this also creates Assets/Logo, Assets/Video Assets, current year folder.
  // For returning clients it's typically a no-op (folder already there).
  if (
    process.env.DROPBOX_REFRESH_TOKEN &&
    process.env.DROPBOX_APP_KEY &&
    process.env.DROPBOX_APP_SECRET
  ) {
    try {
      const tree = await ensureBrandFolderTree(brand.business_name);
      if (!brand.dropbox_folder_url) {
        await admin.from("brands").update({ dropbox_folder_url: tree.shareUrl }).eq("id", brand.id);
        brand = { ...brand, dropbox_folder_url: tree.shareUrl };
      }
    } catch (e) {
      console.error(`[closed-won] brand Dropbox ensure failed: ${(e as Error).message}`);
    }
  }

  // ── Per-service project rows ────────────────────────────────────────────
  // If the deal had no Service Type tagged (column missing, or empty), fall
  // back to a single "Content" project so the AM at least has something to
  // open. They can change it from the brief.
  const services: ServiceType[] = deal.services.length > 0 ? deal.services : [CONTENT_SERVICE];

  const projects: ProjectOutcome[] = [];
  const year = inferYear(deal.closeDate);
  const projectBase = projectFromDealItemName(deal.itemName);

  for (const service of services) {
    const projectName = services.length > 1 ? `${projectBase} - ${service}` : projectBase;
    const outcome = await createProjectForService({
      brand,
      deal,
      service,
      projectName,
      year,
    });
    projects.push(outcome);
  }

  await admin.from("brand_activity_log").insert({
    brand_id: brand.id,
    event_type: isNewClient ? "deal_won_new_client" : "deal_won_returning_client",
    metadata: {
      monday_deal_id: deal.itemId,
      monday_deal_url: deal.url,
      deal_name: deal.itemName,
      deal_value: deal.dealValue,
      deal_type: deal.dealType,
      services,
      project_ids: projects.map((p) => p.id),
    },
  });

  return {
    kind: isNewClient ? "new_client" : "existing_client",
    brand,
    deal,
    projects,
  };
}

async function createNewBrandFromDeal(deal: DealSnapshot): Promise<BrandLite> {
  const admin = createSupabaseAdminClient();
  const businessName =
    brandFromDealItemName(deal.itemName) ||
    deal.primaryContact?.company ||
    deal.itemName ||
    "Untitled brand";

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

  const { data, error } = await admin
    .from("brands")
    .insert({
      business_name: businessName,
      submitter_name: deal.primaryContact?.name ?? null,
      submitter_email: deal.primaryContact?.email ?? null,
      submitter_phone: deal.primaryContact?.phone ?? null,
      engagement_type: mapDealTypeToEngagement(deal.dealType),
      internal_notes: note,
      source_deal_id: deal.itemId,
      source_deal_url: deal.url,
      status: "submitted" as const,
    })
    .select(
      "id, business_name, submitter_name, submitter_email, submitter_phone, account_manager, dropbox_folder_url, source_deal_url"
    )
    .single();
  if (error || !data) throw new Error(`Brand insert failed: ${error?.message ?? "no row"}`);
  return data as BrandLite;
}

async function createProjectForService(args: {
  brand: BrandLite;
  deal: DealSnapshot;
  service: ServiceType;
  projectName: string;
  year: number;
}): Promise<ProjectOutcome> {
  const { brand, deal, service, projectName, year } = args;
  const admin = createSupabaseAdminClient();

  // Per (deal × service) idempotency — the unique index on the table guards
  // against double inserts on webhook retries.
  let dropboxProjectFolderUrl: string | null = null;
  let briefId: string | null = null;

  if (service === CONTENT_SERVICE) {
    // Project Dropbox folder
    if (
      process.env.DROPBOX_REFRESH_TOKEN &&
      process.env.DROPBOX_APP_KEY &&
      process.env.DROPBOX_APP_SECRET
    ) {
      try {
        const tree = await ensureProjectFolderTree(brand.business_name, year, projectName);
        dropboxProjectFolderUrl = tree.shareUrl;
      } catch (e) {
        console.error(`[closed-won] project Dropbox failed: ${(e as Error).message}`);
      }
    }
    // Brief seed
    try {
      briefId = await seedBrief({
        brand,
        projectName,
        deal,
      });
    } catch (e) {
      console.error(`[closed-won] brief seed failed: ${(e as Error).message}`);
    }
  }

  const { data, error } = await admin
    .from("brand_projects")
    .insert({
      brand_id: brand.id,
      monday_deal_id: deal.itemId,
      service_type: service,
      project_name: projectName,
      year,
      deal_value: deal.dealValue,
      deal_type: deal.dealType,
      dropbox_project_folder_url: dropboxProjectFolderUrl,
      brief_id: briefId,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`brand_projects insert failed: ${error?.message ?? "no row"}`);

  return {
    id: data.id as string,
    service_type: service,
    project_name: projectName,
    dropbox_project_folder_url: dropboxProjectFolderUrl,
    brief_id: briefId,
  };
}

/** Derive the year folder from the deal's close date; fall back to current year. */
function inferYear(closeDate: string | null): number {
  if (closeDate) {
    const y = Number(closeDate.slice(0, 4));
    if (Number.isFinite(y) && y > 2020 && y < 2100) return y;
  }
  return new Date().getFullYear();
}

/**
 * Suggest a first billing date for a retainer based on the rule:
 * "next 1st or 15th that's at least 5 business days after the close date."
 * Useful for the CFO card on retainer closes.
 */
export function suggestFirstBillingDate(closeDate: string | null): string | null {
  if (!closeDate) return null;
  const close = new Date(closeDate + "T00:00:00Z");
  if (Number.isNaN(close.getTime())) return null;
  // Add 5 business days to the close date
  let d = new Date(close);
  let added = 0;
  while (added < 5) {
    d.setUTCDate(d.getUTCDate() + 1);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) added += 1;
  }
  // Now advance to the next 1 or 15 (whichever comes first)
  while (d.getUTCDate() !== 1 && d.getUTCDate() !== 15) {
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return d.toISOString().slice(0, 10);
}
