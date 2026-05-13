import { z } from "zod";

// Accepts "example.com", "www.example.com", "https://example.com" — auto-prepends https:// when missing.
const optionalUrl = z.preprocess(
  (val) => {
    if (typeof val !== "string") return val;
    const trimmed = val.trim();
    if (trimmed === "") return "";
    return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  },
  z.union([z.string().url("Enter a valid URL like example.com"), z.literal("")]).optional()
);

const hexColor = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, "Hex like #1A2B3C");

const colorEntry = z.object({
  name: z.string().optional().default(""),
  hex: hexColor,
  role: z.enum(["primary", "secondary"]),
});

const fontEntry = z.object({
  name: z.string().min(1),
  role: z.enum(["primary", "secondary"]),
  use_case: z.string().optional().default(""),
});

export const intakeSchema = z.object({
  // Submitter contact
  submitter_name: z.string().min(1, "Your name is required"),
  submitter_email: z.string().email("Enter a valid email"),
  submitter_phone: z.string().optional(),

  // Brand basics
  business_name: z.string().min(1, "Business name is required"),
  website: optionalUrl,
  tagline: z.string().optional(),
  vertical: z.string().optional(),
  vertical_other: z.string().optional(),

  // About
  overview_client_raw: z.string().optional(),
  look_and_feel: z.string().optional(),
  what_to_avoid: z.string().optional(),
  inspiration_references: z.string().optional(),
  audience_gender: z.string().optional(),
  audience_age: z.string().optional(),
  audience_type: z.string().optional(),
  music_notes: z.string().optional(),

  // Visual details (arrays)
  colors: z.array(colorEntry).optional().default([]),
  fonts: z.array(fontEntry).optional().default([]),

  // Asset handoff
  client_asset_folder_url: optionalUrl,

  // Social
  instagram: z.string().optional(),
  facebook: z.string().optional(),
  youtube: z.string().optional(),
  tiktok: z.string().optional(),
  linkedin: z.string().optional(),
});

export type IntakeInput = z.infer<typeof intakeSchema>;
