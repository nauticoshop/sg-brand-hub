import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { InitialsAvatar } from "@/components/ui/avatar";
import { StatusPill } from "@/components/dashboard/status-pill";
import { formatRelativeDate } from "@/lib/utils";
import { VERTICAL_LABELS, type Brand } from "@/types/brand";

export function BrandList({ brands }: { brands: Brand[] }) {
  if (brands.length === 0) {
    return (
      <div className="panel flex flex-col items-center justify-center px-6 py-16 text-center">
        <h3 className="text-base font-semibold">No brands yet</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          When a client submits the intake form it'll show up here.
        </p>
      </div>
    );
  }

  return (
    <div className="panel divide-y divide-border overflow-hidden">
      {brands.map((brand) => (
        <Link
          key={brand.id}
          href={`/brand/${brand.id}`}
          className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-secondary/50"
        >
          <InitialsAvatar name={brand.business_name} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate font-medium">{brand.business_name}</span>
              <StatusPill status={brand.status} />
            </div>
            <div className="mt-0.5 truncate text-xs text-muted-foreground">
              {brand.vertical ? VERTICAL_LABELS[brand.vertical] : "Vertical not set"} ·{" "}
              {brand.website || "No website"} · Updated {formatRelativeDate(brand.updated_at)}
            </div>
          </div>
          <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
        </Link>
      ))}
    </div>
  );
}
