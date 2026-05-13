"use client";
import { useTransition } from "react";
import { Check, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StatusPill } from "@/components/dashboard/status-pill";
import { STATUS_LABELS, type BrandStatus } from "@/types/brand";
import { updateBrand } from "@/app/(internal)/brand/[id]/actions";

const ORDER: BrandStatus[] = ["draft", "submitted", "in_review", "approved", "archived"];

export function StatusEditor({
  brandId,
  status,
}: {
  brandId: string;
  status: BrandStatus;
}) {
  const [isPending, startTransition] = useTransition();

  function change(next: BrandStatus) {
    if (next === status || isPending) return;
    startTransition(async () => {
      const res = await updateBrand(brandId, { status: next });
      if (!res.ok) {
        toast.error(`Couldn't change status: ${res.error}`);
        return;
      }
      toast.success(`Status → ${STATUS_LABELS[next]}`);
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="group inline-flex items-center gap-1 outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-full"
          aria-label="Change status"
          disabled={isPending}
        >
          <StatusPill status={status} />
          <ChevronDown className="h-3 w-3 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        {ORDER.map((s) => (
          <DropdownMenuItem
            key={s}
            onClick={() => change(s)}
            className="justify-between"
          >
            <span className="flex items-center gap-2">
              <StatusPill status={s} />
            </span>
            {s === status && <Check className="h-3.5 w-3.5 text-emerald-600" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
