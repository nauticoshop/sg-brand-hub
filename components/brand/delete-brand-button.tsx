"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { deleteBrand } from "@/app/(internal)/brand/[id]/actions";

export function DeleteBrandButton({
  brandId,
  brandName,
}: {
  brandId: string;
  brandName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [isPending, startTransition] = useTransition();

  const matches = confirm.trim().toLowerCase() === brandName.trim().toLowerCase();

  function handleDelete() {
    if (!matches) return;
    startTransition(async () => {
      try {
        await deleteBrand(brandId);
        // deleteBrand calls redirect() server-side; if we get here, do it client-side too.
        router.push("/dashboard");
        toast.success(`Deleted "${brandName}"`);
      } catch (e) {
        // Redirect throws an internal Next.js error — that's expected, ignore.
        if ((e as Error).message?.includes("NEXT_REDIRECT")) {
          toast.success(`Deleted "${brandName}"`);
          return;
        }
        toast.error(`Couldn't delete: ${(e as Error).message}`);
      }
    });
  }

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        className="text-destructive hover:bg-destructive/5 hover:text-destructive"
        aria-label="Delete brand"
      >
        <Trash2 className="h-4 w-4" />
        Delete
      </Button>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setConfirm(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this brand?</DialogTitle>
            <DialogDescription>
              This permanently removes <span className="font-medium text-foreground">{brandName}</span>, all its
              logos, and its activity log. Share links for this brand will stop working. This cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">
              Type the brand name to confirm
            </Label>
            <Input
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder={brandName}
              autoFocus
            />
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={!matches || isPending}
            >
              {isPending ? "Deleting…" : "Delete brand"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
