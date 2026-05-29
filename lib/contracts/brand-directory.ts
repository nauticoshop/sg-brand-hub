// Brand Hub → Brief Tool data contract.
//
// This file defines the SHAPE of the `public.brand_directory` Postgres view
// declared in 20260529000000_brand_directory_view.sql. Brief Tool should
// copy this type (or, eventually, both apps should import from a shared
// package) so the contract stays in sync.
//
// Changes to this shape are coordinated breaking changes. Adding new optional
// fields is safe. Renaming or removing fields requires Brief Tool to update.

/** Vertical/industry the brand operates in. Mirror of `public.brand_vertical` enum. */
export type BrandVertical =
  | "marine"
  | "real_estate"
  | "luxury_real_estate" // legacy — being retired; same data as real_estate
  | "yacht_charter"
  | "yacht_brokerage"
  | "powersports"
  | "fashion"
  | "hospitality"
  | "f_and_b"
  | "wellness"
  | "professional_services"
  | "other";

/** Status the brand is in within Brand Hub's pipeline. Brief Tool only ever
 *  sees `in_review` or `approved` — drafts and archived rows are filtered. */
export type BrandStatus = "in_review" | "approved";

export type EngagementType = "retainer" | "project" | "inactive";

export type BrandColor = {
  /** Display name — e.g. "Brand Red", "Charcoal". */
  name: string;
  /** Uppercase hex with leading #. e.g. "#0081A6". */
  hex: string;
  /** "primary" = brand-defining color; "secondary" = supporting/accent. */
  role: "primary" | "secondary";
};

export type BrandFont = {
  /** Font family name as the brand calls it — e.g. "Proxima Nova". */
  name: string;
  role: "primary" | "secondary";
  /** Optional usage hint — e.g. "Headlines", "Body copy". */
  use_case?: string;
};

/**
 * Row shape of `public.brand_directory`. Every column nullable except those
 * the view guarantees (brand_id, business_name, share_token, share_url,
 * colors, fonts, status, updated_at).
 */
export type BrandDirectoryRow = {
  brand_id: string;                     // uuid
  business_name: string;
  share_token: string;
  /** Pre-built editorial share-page URL. Use this instead of concatenating. */
  share_url: string;

  account_manager: string | null;
  primary_contact_name: string | null;
  primary_contact_email: string | null;
  primary_contact_phone: string | null;

  tagline: string | null;
  brand_voice: string | null;
  look_and_feel: string | null;
  what_to_avoid: string | null;
  audience_type: string | null;
  audience_age: string | null;
  audience_gender: string | null;
  overview: string | null;

  /** Array of brand colors. Empty array if none defined. */
  colors: BrandColor[];
  /** Array of brand fonts. Empty array if none defined. */
  fonts: BrandFont[];

  music_notes: string | null;
  music_mood: string[] | null;
  music_genre: string[] | null;
  coloring_tone: string | null;

  vertical: BrandVertical | null;
  engagement_type: EngagementType | null;

  dropbox_folder_url: string | null;
  client_monday_board_url: string | null;
  brand_guideline_pdf_url: string | null;

  /** Public URL of the highest-priority logo (excludes `reference` files). */
  primary_logo_url: string | null;

  status: BrandStatus;
  approved_at: string | null; // ISO timestamp
  updated_at: string;          // ISO timestamp
};
