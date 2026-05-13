"use client";
import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function CopyButton({
  value,
  label = "Copy",
  className,
  size = "sm",
}: {
  value: string;
  label?: string;
  className?: string;
  size?: "sm" | "icon";
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    toast.success(`${label} copied`);
    setTimeout(() => setCopied(false), 1500);
  }

  if (size === "icon") {
    return (
      <Button variant="ghost" size="icon" onClick={copy} className={className} aria-label={label}>
        {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
      </Button>
    );
  }

  return (
    <Button variant="outline" size="sm" onClick={copy} className={cn("gap-2", className)}>
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copied" : label}
    </Button>
  );
}
