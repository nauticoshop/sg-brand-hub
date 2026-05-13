"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import type { BrandStatus } from "@/types/brand";

const OPTIONS: Array<{ value: "all" | BrandStatus; label: string }> = [
  { value: "all", label: "All" },
  { value: "submitted", label: "Submitted" },
  { value: "in_review", label: "In Review" },
  { value: "approved", label: "Approved" },
  { value: "archived", label: "Archived" },
];

export function StatusFilter() {
  const searchParams = useSearchParams();
  const current = searchParams.get("status") ?? "all";

  return (
    <div className="flex items-center gap-6 border-b border-border">
      {OPTIONS.map((opt) => {
        const isActive = current === opt.value;
        const params = new URLSearchParams(searchParams);
        if (opt.value === "all") params.delete("status");
        else params.set("status", opt.value);
        return (
          <Link
            key={opt.value}
            href={`?${params.toString()}`}
            className={cn(
              "relative py-3 text-sm font-medium transition-colors",
              isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {opt.label}
            {isActive && (
              <span className="absolute -bottom-px left-0 right-0 h-0.5 rounded-full bg-accent" />
            )}
          </Link>
        );
      })}
    </div>
  );
}
