import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { BrandPdf } from "@/components/pdf/brand-pdf";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Brand, BrandLogo } from "@/types/brand";

async function loadBrand(id: string) {
  const supabase = createSupabaseServerClient();
  const [{ data: brand, error: brandErr }, { data: logos }] = await Promise.all([
    supabase.from("brands").select("*").eq("id", id).single(),
    supabase.from("brand_logos").select("*").eq("brand_id", id).order("display_order"),
  ]);
  if (brandErr || !brand) throw new Error(brandErr?.message ?? "Brand not found");
  return { brand: brand as Brand, logos: (logos ?? []) as BrandLogo[] };
}

async function generate(id: string): Promise<Buffer> {
  const { brand, logos } = await loadBrand(id);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return renderToBuffer(BrandPdf({ brand, logos, appUrl }));
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const pdf = await generate(params.id);
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "inline",
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/**
 * POST with ?save=1 — generate the PDF, upload to brand-pdfs storage,
 * and write the public URL onto the brand record.
 * Used by the approve flow.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const save = new URL(request.url).searchParams.get("save") === "1";
  try {
    const pdf = await generate(params.id);

    if (!save) {
      return new NextResponse(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf" } });
    }

    const admin = createSupabaseAdminClient();
    const fileName = `${params.id}/brand-guidelines-${Date.now()}.pdf`;
    const { error: upErr } = await admin.storage
      .from("brand-pdfs")
      .upload(fileName, pdf, { contentType: "application/pdf", upsert: true });
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

    const { data: pub } = admin.storage.from("brand-pdfs").getPublicUrl(fileName);
    await admin.from("brands").update({ brand_guideline_pdf_url: pub.publicUrl }).eq("id", params.id);
    await admin.from("brand_activity_log").insert({
      brand_id: params.id,
      event_type: "pdf_generated",
      metadata: { url: pub.publicUrl },
    });

    return NextResponse.json({ url: pub.publicUrl });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
