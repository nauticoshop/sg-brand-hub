"use client";
import { useTransition } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { approveBrand } from "@/app/(internal)/brand/[id]/actions";

export function ApproveButton({ brandId }: { brandId: string }) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      toast.loading("Generating PDF, syncing to Monday…", { id: "approve" });
      const res = await approveBrand(brandId);
      if (!res.ok) {
        toast.error(`Approval failed: ${res.error ?? "unknown error"}`, { id: "approve" });
        return;
      }
      if (res.warnings && res.warnings.length > 0) {
        toast.warning(
          `Approved, but ${res.warnings.length} sync issue${res.warnings.length === 1 ? "" : "s"}: ${res.warnings[0]}`,
          { id: "approve", duration: 8000 }
        );
        return;
      }
      toast.success("Approved. PDF saved + Monday tasks created.", { id: "approve" });
    });
  }

  return (
    <Button onClick={handleClick} disabled={isPending}>
      <Check className="h-4 w-4" />
      {isPending ? "Approving…" : "Approve & Sync"}
    </Button>
  );
}
