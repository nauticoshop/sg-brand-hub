// Pre-approve checklist logic. Used by both the editor page (to render the
// missing-items panel) and the Approve button (to know whether to gate or
// pass through).
//
// "Required" items block approval entirely — without them, the downstream
// flow (Monday sync, share page, PDF) would either fail or produce a broken
// artifact.
//
// "Recommended" items are surfaced as warnings on the editor but do NOT
// block approval.

import type { Brand, BrandLogo } from "@/types/brand";

export type ChecklistItem = {
  /** Stable identifier for keying React lists + tests. */
  key: string;
  /** Short user-facing label. */
  label: string;
  /** Optional fix-it hint. */
  hint?: string;
  /** Editor tab the user should jump to to fix this. */
  tab: "overview" | "voice" | "visual" | "logos" | "creative" | "notes";
  /** Whether this item is currently satisfied. */
  done: boolean;
};

const trimBlank = (v: string | null | undefined) => !!v && v.trim().length > 0;

export function buildApprovalChecklist(
  brand: Brand,
  logos: BrandLogo[]
): { required: ChecklistItem[]; recommended: ChecklistItem[] } {
  // Treat .ai/.eps/.pdf reference files as "no image logo" — those don't
  // render on the share page or PDF.
  const imageLogos = logos.filter((l) => l.logo_type !== "reference");
  const hasPrimaryColor = (brand.colors ?? []).some((c) => c.role === "primary");
  const hasOverview = trimBlank(brand.overview_polished) || trimBlank(brand.overview_client_raw);

  const required: ChecklistItem[] = [
    {
      key: "account_manager",
      label: "Account manager assigned",
      hint: "Required so the Monday All Projects parent gets a person.",
      tab: "overview",
      done: trimBlank(brand.account_manager),
    },
    {
      key: "image_logo",
      label: "At least one image logo uploaded",
      hint: "PDF/AI/EPS don't render on the share page — needs a PNG/JPG/SVG.",
      tab: "logos",
      done: imageLogos.length > 0,
    },
    {
      key: "primary_color",
      label: "At least one primary color",
      hint: "Used in the editorial PDF + share page header.",
      tab: "visual",
      done: hasPrimaryColor,
    },
    {
      key: "overview",
      label: "Brand overview written",
      hint: "The share page header pulls from this.",
      tab: "overview",
      done: hasOverview,
    },
  ];

  const recommended: ChecklistItem[] = [
    {
      key: "tagline",
      label: "Tagline",
      tab: "overview",
      done: trimBlank(brand.tagline),
    },
    {
      key: "website",
      label: "Website URL",
      tab: "overview",
      done: trimBlank(brand.website),
    },
    {
      key: "vertical",
      label: "Vertical / industry",
      tab: "overview",
      done: trimBlank(brand.vertical),
    },
    {
      key: "fonts",
      label: "At least one font",
      tab: "visual",
      done: (brand.fonts ?? []).length > 0,
    },
    {
      key: "brand_voice",
      label: "Brand voice description",
      tab: "voice",
      done: trimBlank(brand.brand_voice),
    },
    {
      key: "audience_type",
      label: "Target audience",
      tab: "voice",
      done: trimBlank(brand.audience_type),
    },
    {
      key: "look_and_feel",
      label: "Look & feel description",
      tab: "creative",
      done: trimBlank(brand.look_and_feel),
    },
  ];

  return { required, recommended };
}

export function isReadyToApprove(brand: Brand, logos: BrandLogo[]): boolean {
  const { required } = buildApprovalChecklist(brand, logos);
  return required.every((item) => item.done);
}
