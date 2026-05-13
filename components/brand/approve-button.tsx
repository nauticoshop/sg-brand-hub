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
      toast.loading("Generating PDF and approving…", { id: "approve" });
      const res = await approveBrand(brandId);
      if (res.ok) {
        toast.success("Brand approved. PDF saved.", { id: "approve" });
      } else {
        toast.error(`Approval failed: ${res.error ?? "unknown error"}`, { id: "approve" });
      }
    });
  }

  return (
    <Button onClick={handleClick} disabled={isPending}>
      <Check className="h-4 w-4" />
      {isPending ? "Approving…" : "Approve & Sync"}
    </Button>
  );
}
