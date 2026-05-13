import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function NewBrandPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("brands")
    .insert({
      business_name: "Untitled brand",
      status: "draft",
      created_by: user?.id,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`Could not create brand: ${error?.message ?? "unknown error"}`);
  }

  redirect(`/brand/${data.id}`);
}
