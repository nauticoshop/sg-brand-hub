// PDF endpoint for authenticated editors. The actual generation is in
// lib/pdf/generate.ts so the approve server action can call it directly
// without a same-origin HTTP roundtrip (which would lose cookies).

import { NextResponse } from "next/server";
import { generateBrandPdf, generateAndSaveBrandPdf } from "@/lib/pdf/generate";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const pdf = await generateBrandPdf(params.id);
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
 * and write the public URL onto the brand record. Idempotent (overwrites
 * the same path).
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const save = new URL(request.url).searchParams.get("save") === "1";
  try {
    if (!save) {
      const pdf = await generateBrandPdf(params.id);
      return new NextResponse(new Uint8Array(pdf), {
        headers: { "Content-Type": "application/pdf" },
      });
    }
    const url = await generateAndSaveBrandPdf(params.id);
    return NextResponse.json({ url });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
