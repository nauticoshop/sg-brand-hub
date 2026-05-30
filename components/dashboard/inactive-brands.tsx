"use client";
// Collapsible section for inactive clients. Hidden by default to keep the
// main list focused on active engagements, but one click expands to the
// full inactive list (typically a handful of brands).

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { BrandList } from "@/components/dashboard/brand-list";
import type { Brand } from "@/types/brand";

export function InactiveBrands({ brands }: { brands: Brand[] }) {
  const [open, setOpen] = useState(false);

  if (brands.length === 0) return null;

  return (
    <section className="mt-10">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-xl border border-dashed border-border bg-transparent px-5 py-3 text-left text-sm text-muted-foreground transition-colors hover:bg-secondary/50"
      >
        <span>
          <span className="font-medium text-foreground">Inactive clients</span>
          <span className="ml-2 rounded-full bg-secondary px-2 py-0.5 text-xs">{brands.length}</span>
        </span>
        <ChevronDown
          className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="mt-3">
          <BrandList brands={brands} />
        </div>
      )}
    </section>
  );
}
