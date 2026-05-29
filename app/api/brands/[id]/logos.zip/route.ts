import { NextResponse } from "next/server";
import JSZip from "jszip";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function safeFilename(s: string): string {
  return s.replace(/[\\/:"*?<>|]+/g, "-").trim() || "brand";
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const url = new URL(request.url);
  // Include reference files too? Default no — just brand logos.
  const includeRefs = url.searchParams.get("include") === "all";

  const supabase = createSupabaseServerClient();
  const { data: brand, error: brandErr } = await supabase
    .from("brands")
    .select("business_name")
    .eq("id", params.id)
    .single();
  if (brandErr || !brand) {
    return NextResponse.json({ error: "Brand not found" }, { status: 404 });
  }

  let q = supabase.from("brand_logos").select("*").eq("brand_id", params.id).order("display_order");
  if (!includeRefs) {
    // logo_type is null for normal image logos and 'reference' for PDFs/EPS
    // etc. `neq` against null returns NULL which Supabase treats as exclude,
    // so we need an explicit OR to keep the nulls.
    q = q.or("logo_type.is.null,logo_type.neq.reference");
  }
  const { data: logos, error: logosErr } = await q;
  if (logosErr) return NextResponse.json({ error: logosErr.message }, { status: 500 });
  if (!logos || logos.length === 0) {
    return NextResponse.json({ error: "No logos to download" }, { status: 404 });
  }

  const zip = new JSZip();
  // Deduplicate filenames so two logos with the same name don't collide.
  const seen = new Map<string, number>();

  for (const logo of logos) {
    const { data: blob, error: dlErr } = await supabase.storage
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
