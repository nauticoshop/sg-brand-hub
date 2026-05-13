import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { BrandPdf } from "@/components/pdf/brand-pdf";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Brand, BrandLogo } from "@/types/brand";

export async function GET(_request: Request, { params }: { params: { token: string } }) {
  const admin = createSupabaseAdminClient();
  const { data: brand, error } = await admin
    .from("brands")
    .select("*")
    .eq("share_token", params.token)
    .single();
  if (error || !brand) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const { data: logos } = await admin
    .from("brand_logos")
    .select("*")
    .eq("brand_id", brand.id)
    .order("display_order");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const pdf = await renderToBuffer(
    BrandPdf({ brand: brand as Brand, logos: (logos ?? []) as BrandLogo[], appUrl })
  );

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": "inline",
      "Cache-Control": "no-store",
    },
  });
}
