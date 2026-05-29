"use client";
import { useTransition } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { approveBrand } from "@/app/(internal)/brand/[id]/actions";

export function ApproveButton({
  brandId,
  disabled,
  disabledReason,
}: {
  brandId: string;
  /** Hard gate — if true, button is unclickable. Used by the readiness check. */
  disabled?: boolean;
  /** Tooltip / toast shown when the user clicks a disabled button. */
  disabledReason?: string;
}) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    if (disabled) {
      // Surface what's missing so the user knows why this is blocked even if
      // they don't notice the panel above.
      toast.warning(
        disabledReason ?? "Brand isn't ready to approve yet — see the checklist.",
        { duration: 6000 }
      );
      return;
    }
    startTransition(async () => {
      toast.loading("Generating PDF, syncing to Monday…", { id: "approve" });
      const res = await approveBrand(brandId);
      if (!res.ok) {
        toast.error(`Approval failed: ${res.error ?? "unknown error"}`, { id: "approve" });
        return;
      }
      if (res.warnings && res.warnings.length > 0) {
        const heading = `Approved, but ${res.warnings.length} sync issue${
          res.warnings.length === 1 ? "" : "s"
        }:`;
        toast.warning(heading, {
          id: "approve",
          duration: 12000,
          description: res.warnings.map((w) => `• ${w}`).join("\n"),
        });
        return;
      }
      toast.success("Approved. PDF saved + Monday tasks created.", { id: "approve" });
    });
  }

  return (
    <Button
      onClick={handleClick}
      disabled={isPending}
      // Visually dim the button when blocked but still allow clicks (so the
      // toast can explain). Sonner toast is more helpful than a disabled
      // <button> that the user can't interact with at all.
      className={disabled ? "opacity-60" : undefined}
      title={disabled ? disabledReason : undefined}
    >
      <Check className="h-4 w-4" />
      {isPending ? "Approving…" : "Approve & Sync"}
    </Button>
  );
}
