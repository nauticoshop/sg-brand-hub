// Single source of truth for PDF generation. Replaces the previous pattern of
// `approveBrand` making an internal HTTP POST to /api/brands/[id]/pdf?save=1 —
// that round-trip lost cookies and was fragile to RLS changes. Now both the
// HTTP routes and the server action call the same in-process helpers.

import { renderToBuffer } from "@react-pdf/renderer";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BrandPdf } from "@/components/pdf/brand-pdf";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Brand, BrandLogo } from "@/types/brand";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

type Client = SupabaseClient;

async function loadBrand(client: Client, id: string): Promise<{ brand: Brand; logos: BrandLogo[] }> {
  const [{ data: brand, error: brandErr }, { data: logos }] = await Promise.all([
    client.from("brands").select("*").eq("id", id).single(),
    client.from("brand_logos").select("*").eq("brand_id", id).order("display_order"),
  ]);
  if (brandErr || !brand) throw new Error(brandErr?.message ?? "Brand not found");
  return { brand: brand as Brand, logos: (logos ?? []) as BrandLogo[] };
}

async function loadBrandByShareToken(
  client: Client,
  token: string
): Promise<{ brand: Brand; logos: BrandLogo[] }> {
  const { data: brand, error } = await client
    .from("brands")
    .select("*")
    .eq("share_token", token)
    .single();
  if (error || !brand) throw new Error(error?.message ?? "Brand not found");
  const { data: logos } = await client
    .from("brand_logos")
    .select("*")
    .eq("brand_id", brand.id)
    .order("display_order");
  return { brand: brand as Brand, logos: (logos ?? []) as BrandLogo[] };
}

/**
 * Generate a PDF buffer for a brand by id. Uses the regular server client
 * (caller-authenticated) by default — pass `{ client: "admin" }` to use the
 * service-role client for unauthenticated callers (the share endpoint, the
 * approve-action's server-side call).
 */
export async function generateBrandPdf(
  id: string,
  opts: { client?: "server" | "admin" } = {}
): Promise<Buffer> {
  const client = opts.client === "admin" ? createSupabaseAdminClient() : createSupabaseServerClient();
  const { brand, logos } = await loadBrand(client, id);
  return renderToBuffer(BrandPdf({ brand, logos, appUrl: APP_URL }));
}

/**
 * Generate a PDF buffer for a brand by share token (public flow).
 * Always uses the admin client since callers may be unauthenticated.
 */
export async function generateBrandPdfByShareToken(token: string): Promise<Buffer> {
  const admin = createSupabaseAdminClient();
  const { brand, logos } = await loadBrandByShareToken(admin, token);
  return renderToBuffer(BrandPdf({ brand, logos, appUrl: APP_URL }));
}

/**
 * Generate + upload + persist. Used by approveBrand to save the PDF to
 * brand-pdfs storage and link it on the brand record. Returns the public URL.
 *
 * Idempotency: writes to a fixed path `${id}/brand-guidelines.pdf` with
 * upsert=true so re-runs replace rather than orphan. The brand record gets
 * the same public URL each time (Supabase Storage URLs are stable per path).
 */
export async function generateAndSaveBrandPdf(id: string): Promise<string> {
  const admin = createSupabaseAdminClient();
  const { brand, logos } = await loadBrand(admin, id);
  const pdf = await renderToBuffer(BrandPdf({ brand, logos, appUrl: APP_URL }));

  const fileName = `${id}/brand-guidelines.pdf`;
  const { error: upErr } = await admin.storage
    .from("brand-pdfs")
    .upload(fileName, pdf, { contentType: "application/pdf", upsert: true });
  if (upErr) throw new Error(`PDF upload failed: ${upErr.message}`);

  const { data: pub } = admin.storage.from("brand-pdfs").getPublicUrl(fileName);
  await admin.from("brands").update({ brand_guideline_pdf_url: pub.publicUrl }).eq("id", id);
  await admin.from("brand_activity_log").insert({
    brand_id: id,
    event_type: "pdf_generated",
    metadata: { url: pub.publicUrl },
  });

  return pub.publicUrl;
}
