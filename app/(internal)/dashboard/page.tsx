import { Plus, Upload } from "lucide-react";
import { IntakeFormShare } from "@/components/dashboard/intake-form-share";
import { DashboardFilters } from "@/components/dashboard/dashboard-filters";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageContainer, PageHeader } from "@/components/shell/page-container";
import { SearchInput } from "@/components/dashboard/search-input";
import { StatusFilter } from "@/components/dashboard/status-filter";
import { BrandList } from "@/components/dashboard/brand-list";
import { InactiveBrands } from "@/components/dashboard/inactive-brands";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Brand, BrandStatus } from "@/types/brand";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { q?: string; status?: string; engagement?: string; sort?: string };
}) {
  const supabase = createSupabaseServerClient();

  let query = supabase.from("brands").select("*");

  // Sort
  const sort = searchParams.sort ?? "updated_desc";
  if (sort === "alpha_asc") {
    query = query.order("business_name", { ascending: true });
  } else if (sort === "created_asc") {
    query = query.order("created_at", { ascending: true });
  } else {
    query = query.order("updated_at", { ascending: false });
  }

  if (searchParams.status && searchParams.status !== "all") {
    query = query.eq("status", searchParams.status as BrandStatus);
  }
  if (searchParams.engagement && searchParams.engagement !== "all") {
    query = query.eq("engagement_type", searchParams.engagement);
  }
  if (searchParams.q) {
    query = query.ilike("business_name", `%${searchParams.q}%`);
  }

  const { data, error } = await query;
  const allBrands = (error ? [] : (data ?? [])) as Brand[];

  // Split inactive into a separate collapsed section so the main list stays
  // focused on active engagements (retainer + project). If the user has
  // explicitly filtered to "inactive", everything stays in the main list
  // instead — they came here looking for inactive specifically.
  const userPickedInactive = searchParams.engagement === "inactive";
  const activeBrands = userPickedInactive
    ? allBrands
    : allBrands.filter((b) => b.engagement_type !== "inactive");
  const inactiveBrands = userPickedInactive
    ? []
    : allBrands.filter((b) => b.engagement_type === "inactive");

  return (
    <PageContainer>
      <PageHeader
        title="Brand Hub"
        description="Client brand records — intake, review, approve, ship."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <IntakeFormShare />
            <Button variant="outline" asChild>
              <Link href="/import">
                <Upload className="h-4 w-4" />
                Import PDFs
              </Link>
            </Button>
            <Button asChild>
              <Link href="/brand/new">
                <Plus className="h-4 w-4" />
                New brand
              </Link>
            </Button>
          </div>
        }
      />

      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center">
        <SearchInput placeholder="Search by business name…" />
        <DashboardFilters />
      </div>

      <div className="mb-6">
        <StatusFilter />
      </div>

      <BrandList brands={activeBrands} />

      <InactiveBrands brands={inactiveBrands} />
    </PageContainer>
  );
}
