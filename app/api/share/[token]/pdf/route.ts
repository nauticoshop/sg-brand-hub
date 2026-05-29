// Public PDF endpoint accessed via share token. Uses the admin client to
// bypass RLS — the share token IS the auth check.

import { NextResponse } from "next/server";
import { generateBrandPdfByShareToken } from "@/lib/pdf/generate";

export async function GET(_request: Request, { params }: { params: { token: string } }) {
  try {
    const pdf = await generateBrandPdfByShareToken(params.token);
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "inline",
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 404 });
  }
}
