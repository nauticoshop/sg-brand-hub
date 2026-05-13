"use client";
import { useState } from "react";
import { Check, Copy, ExternalLink, Link2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export function ShareLinkButton({ shareToken }: { shareToken: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const url =
    typeof window !== "undefined"
      ? `${window.location.origin}/share/${shareToken}`
      : `/share/${shareToken}`;

  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success("Share link copied");
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Link2 className="h-4 w-4" />
        Share
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share brand guidelines</DialogTitle>
            <DialogDescription>
              Anyone with this link can view the brand. No login required — great for freelance editors and external creatives.
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-2 rounded-md border border-input bg-secondary/40 px-3 py-2">
            <Link2 className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
            <input
              readOnly
              value={url}
              onFocus={(e) => e.currentTarget.select()}
              className="flex-1 bg-transparent text-xs outline-none"
            />
            <Button variant="ghost" size="icon" onClick={copy} aria-label="Copy">
              {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="icon" asChild aria-label="Open">
              <a href={url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            Tip: paste this into the Brand Assets section of your creative brief — editors land directly on the brand page.
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}
