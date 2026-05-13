"use client";
import { useState } from "react";
import { Check, Copy, ExternalLink, FileText } from "lucide-react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Brand } from "@/types/brand";

export function PdfLinkField({ brand, className }: { brand: Brand; className?: string }) {
  const [copied, setCopied] = useState(false);
  const url = brand.brand_guideline_pdf_url;

  async function copy() {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success("PDF link copied");
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label className="text-xs text-muted-foreground">Brand guideline PDF</Label>
      {url ? (
        <div className="flex items-center gap-2 rounded-md border border-input bg-panel px-3 py-2">
          <FileText className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
          <span className="flex-1 truncate text-xs text-muted-foreground">{url}</span>
          <Button variant="ghost" size="icon" type="button" onClick={copy} aria-label="Copy link">
            {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="icon" type="button" asChild aria-label="Open PDF">
            <a href={url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-border bg-secondary/40 px-3 py-2.5 text-xs text-muted-foreground">
          Auto-generated when this brand is approved.{" "}
          <a
            href={`/api/brands/${brand.id}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-foreground underline-offset-2 hover:underline"
          >
            Preview current draft →
          </a>
        </div>
      )}
    </div>
  );
}
