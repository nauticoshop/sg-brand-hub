export type BrandStatus = "draft" | "submitted" | "in_review" | "approved" | "archived";

export type BrandVertical =
  | "marine"
  | "private_aviation"
  | "automotive"
  | "real_estate"
  | "real_estate_development"
  | "multifamily_residential"
  | "resort_travel"
  | "home_services"
  | "other"
  // legacy — kept for backwards compatibility with any existing records
  | "luxury_real_estate";

export const VERTICAL_LABELS: Record<BrandVertical, string> = {
  marine: "Marine",
  private_aviation: "Private Aviation",
  automotive: "Automotive",
  real_estate: "Real Estate",
  real_estate_development: "Real Estate Development",
  multifamily_residential: "Multifamily Residential",
  resort_travel: "Resort & Travel",
  home_services: "Home Services",
  other: "Other",
  luxury_real_estate: "Luxury Real Estate",
};

// Verticals shown in the public intake dropdown — excludes the legacy entry.
export const SELECTABLE_VERTICALS: BrandVertical[] = [
  "marine",
  "private_aviation",
  "automotive",
  "real_estate",
  "real_estate_development",
  "multifamily_residential",
  "resort_travel",
  "home_services",
  "other",
];

export const STATUS_LABELS: Record<BrandStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  in_review: "In Review",
  approved: "Approved",
  archived: "Archived",
};

export type BrandColor = {
  name: string;
  hex: string;
  role: "primary" | "secondary";
};

export type BrandFont = {
  name: string;
  role: "primary" | "secondary";
  use_case?: string;
};

export type Brand = {
  id: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;

  status: BrandStatus;
  approved_at: string | null;
  approved_by: string | null;

  business_name: string;
  website: string | null;
  vertical: BrandVertical | null;
  vertical_other: string | null;
  tagline: string | null;

  submitter_name: string | null;
  submitter_email: string | null;
  submitter_phone: string | null;

  account_manager: string | null;

  client_monday_board_url: string | null;
  dropbox_folder_url: string | null;
  video_assets_folder_url: string | null;
  client_asset_folder_url: string | null;
  canva_brand_kit_url: string | null;
  brand_guideline_pdf_url: string | null;

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

  ai_enriched_at: string | null;
  ai_enrichment_version: string | null;

  share_token: string;
};

export type BrandLogo = {
  id: string;
  brand_id: string;
  created_at: string;
  file_name: string;
  file_path: string;
  public_url: string;
  dropbox_path: string | null;
  logo_type: string | null;
  colorway: string | null;
  display_order: number;
};

export type BrandActivityLog = {
  id: string;
  brand_id: string;
  created_at: string;
  user_id: string | null;
  event_type: string;
  metadata: Record<string, unknown> | null;
};
