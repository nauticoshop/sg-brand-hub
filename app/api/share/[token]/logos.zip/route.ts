// Public logos-zip endpoint accessed via share token. The share token IS the
// auth check — anyone with the token gets to download. Uses the admin client
// to bypass RLS on brand_logos read + storage download.
//
// Mirrors /api/brands/[id]/logos.zip but keyed by share_token so the public
// share page's "Download all logos" button works for unauthenticated viewers.

import { NextResponse } from "next/server";
import JSZip from "jszip";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function safeFilename(s: string): string {
  return s.replace(/[\\/:"*?<>|]+/g, "-").trim() || "brand";
}

export async function GET(request: Request, { params }: { params: { token: string } }) {
  const url = new URL(request.url);
  const includeRefs = url.searchParams.get("include") === "all";

  const admin = createSupabaseAdminClient();
  const { data: brand, error: brandErr } = await admin
    .from("brands")
    .select("id, business_name")
    .eq("share_token", params.token)
    .single();
  if (brandErr || !brand) {
    return NextResponse.json({ error: "Brand not found" }, { status: 404 });
  }

  let q = admin
    .from("brand_logos")
    .select("*")
    .eq("brand_id", brand.id)
    .order("display_order");
  if (!includeRefs) q = q.neq("logo_type", "reference");
  const { data: logos, error: logosErr } = await q;
  if (logosErr) return NextResponse.json({ error: logosErr.message }, { status: 500 });
  if (!logos || logos.length === 0) {
    return NextResponse.json({ error: "No logos to download" }, { status: 404 });
  }

  const zip = new JSZip();
  const seen = new Map<string, number>();

  for (const logo of logos) {
    const { data: blob, error: dlErr } = await admin.storage
      .from("brand-logos")
      .download(logo.file_path);
    if (dlErr || !blob) continue;
    const buffer = await blob.arrayBuffer();

    let name = logo.file_name;
    const count = seen.get(name) ?? 0;
    if (count > 0) {
      const dot = name.lastIndexOf(".");
      name =
        dot > 0 ? `${name.slice(0, dot)}-${count}${name.slice(dot)}` : `${name}-${count}`;
    }
    seen.set(logo.file_name, count + 1);

    zip.file(name, buffer);
  }

  const out = await zip.generateAsync({ type: "nodebuffer" });
  const filename = `${safeFilename(brand.business_name)}-logos.zip`;

  return new NextResponse(new Uint8Array(out), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
