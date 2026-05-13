"use client";
import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { BrandColor } from "@/types/brand";

function getContrast(hex: string): "light" | "dark" {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  // Perceived luminance
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? "dark" : "light";
}

export function ColorSwatches({ colors }: { colors: BrandColor[] }) {
  if (colors.length === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      {colors.map((c, i) => (
        <ColorSwatch key={i} color={c} />
      ))}
    </div>
  );
}

function ColorSwatch({ color }: { color: BrandColor }) {
  const [copied, setCopied] = useState(false);
  const text = getContrast(color.hex) === "dark" ? "#111111" : "#FFFFFF";

  async function copy() {
    await navigator.clipboard.writeText(color.hex);
    setCopied(true);
    toast.success(`${color.hex} copied`);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="group relative aspect-[5/6] overflow-hidden rounded-xl border border-border text-left transition-transform hover:scale-[1.01] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      style={{ backgroundColor: color.hex }}
    >
      <div className="absolute inset-x-4 bottom-4" style={{ color: text }}>
        <div className="text-[10px] font-semibold uppercase tracking-wider opacity-70">
          {color.role}
        </div>
        <div className="mt-0.5 text-base font-semibold">{color.name}</div>
        <div className="mt-0.5 font-mono text-xs opacity-80">{color.hex}</div>
      </div>
      <div
        className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-white/15 opacity-0 backdrop-blur transition-opacity group-hover:opacity-100"
        aria-hidden
      >
        {copied ? (
          <Check className="h-3.5 w-3.5" style={{ color: text }} />
        ) : (
          <Copy className="h-3.5 w-3.5" style={{ color: text }} />
        )}
      </div>
    </button>
  );
}
