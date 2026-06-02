// Brand-name matching utilities for the Closed Won webhook.
//
// A deal item on Monday is typically named "Brand | Project description"
// (e.g. "MarineMax | Florida Dealer Listings"). The part before the pipe is
// the brand name we try to match against an existing Brand Hub record.
//
// Matching strategy (tried in order):
//   1. Exact normalized business_name match
//   2. Primary contact email domain matches the brand's website OR an existing
//      submitter_email/contact_email on the brand
//
// Tie-breaker for multiple matches: most recently updated brand wins.

import type { Brand } from "@/types/brand";

/** Strip common corporate suffixes + marine-industry generics so
 *  "Bayliner Boats LLC" matches "Bayliner" matches "BAYLINER BOATS". */
const SUFFIX_TOKENS = new Set([
  "llc",
  "inc",
  "incorporated",
  "corp",
  "corporation",
  "co",
  "company",
  "ltd",
  "limited",
  "yachts",
  "yacht",
  "boats",
  "boat",
  "yachting",
  "marine",
  "group",
  "the",
]);

export function normalizeBusinessName(name: string): string {
  if (!name) return "";
  const lower = name.toLowerCase().replace(/[^\w\s]/g, " ");
  const tokens = lower.split(/\s+/).filter(Boolean);
  const kept = tokens.filter((t, i) => {
    // Keep meaningful tokens — drop only suffix tokens, but never drop the
    // first token (so "Marine Connection" doesn't strip down to "connection").
    if (i === 0) return true;
    return !SUFFIX_TOKENS.has(t);
  });
  return kept.join(" ").trim();
}

/** "MarineMax | Florida Dealer Listings" → "MarineMax". */
export function brandFromDealItemName(itemName: string): string {
  const head = itemName.split("|")[0]?.trim();
  return head || itemName.trim();
}

/** "Florida Dealer Listings" from the example above; falls back to full name. */
export function projectFromDealItemName(itemName: string): string {
  const parts = itemName.split("|");
  if (parts.length < 2) return itemName.trim();
  return parts.slice(1).join("|").trim();
}

function emailDomain(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.lastIndexOf("@");
  if (at < 0) return null;
  return email.slice(at + 1).toLowerCase().trim() || null;
}

function urlHostname(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

export type MatchInput = Pick<
  Brand,
  "id" | "business_name" | "website" | "submitter_email" | "updated_at"
>;

/**
 * Find an existing brand for a deal. Pass in all brands; we'll match the deal
 * against them. Returns the best candidate or null.
 */
export function findExistingBrand(
  dealItemName: string,
  primaryContactEmail: string | null,
  candidates: MatchInput[]
): MatchInput | null {
  const targetName = normalizeBusinessName(brandFromDealItemName(dealItemName));
  if (!targetName) return null;

  // 1. Exact normalized name match
  const nameMatches = candidates.filter(
    (b) => normalizeBusinessName(b.business_name) === targetName
  );
  if (nameMatches.length > 0) {
    return mostRecentlyUpdated(nameMatches);
  }

  // 2. Email-domain fallback
  const contactDomain = emailDomain(primaryContactEmail);
  if (contactDomain) {
    const domainMatches = candidates.filter((b) => {
      const submitterDomain = emailDomain(b.submitter_email);
      if (submitterDomain && submitterDomain === contactDomain) return true;
      const webHost = urlHostname(b.website);
      if (webHost && (webHost === contactDomain || webHost.endsWith(`.${contactDomain}`))) {
        return true;
      }
      return false;
    });
    if (domainMatches.length > 0) {
      return mostRecentlyUpdated(domainMatches);
    }
  }

  return null;
}

function mostRecentlyUpdated<T extends { updated_at: string }>(rows: T[]): T {
  return rows.slice().sort((a, b) => {
    const ta = new Date(a.updated_at).getTime();
    const tb = new Date(b.updated_at).getTime();
    return tb - ta;
  })[0];
}
