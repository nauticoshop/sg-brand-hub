// A simple section wrapper for the dashboard — a small header with a label
// and count, followed by a BrandList. Hidden entirely when there are no
// brands in the bucket so we don't render empty section headers.

import { BrandList } from "@/components/dashboard/brand-list";
import type { Brand } from "@/types/brand";

export function BrandsSection({
  label,
  description,
  brands,
}: {
  label: string;
  description?: string;
  brands: Brand[];
}) {
  if (brands.length === 0) return null;

  return (
    <section className="mb-8">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">
            {label}
            <span className="ml-2 rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {brands.length}
            </span>
          </h2>
          {description && (
            <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
          )}
        </div>
      </div>
      <BrandList brands={brands} />
    </section>
  );
}
