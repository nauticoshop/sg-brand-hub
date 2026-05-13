"use client";
import { Download, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BrandLogo } from "@/types/brand";

function isImage(name: string) {
  return /\.(png|jpe?g|svg|webp|gif)$/i.test(name);
}

export function LogoGrid({ logos }: { logos: BrandLogo[] }) {
  const items = logos.filter((l) => l.logo_type !== "reference");
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">No logo files uploaded yet.</p>;
  }
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
      {items.map((logo) => (
        <LogoTile key={logo.id} logo={logo} />
      ))}
    </div>
  );
}

function LogoTile({ logo }: { logo: BrandLogo }) {
  const downloadUrl = `${logo.public_url}?download=${encodeURIComponent(logo.file_name)}`;
  return (
    <a
      href={downloadUrl}
      className="group flex flex-col overflow-hidden rounded-xl border border-border bg-panel transition-shadow hover:shadow-panel-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex aspect-[5/4] items-center justify-center overflow-hidden bg-secondary p-6">
        {isImage(logo.file_name) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logo.public_url}
            alt={logo.file_name}
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <FileText className="h-10 w-10 text-muted-foreground" />
        )}
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">
            {[logo.logo_type, logo.colorway].filter(Boolean).join(" — ") || logo.file_name}
          </div>
          {(logo.logo_type || logo.colorway) && (
            <div className="truncate text-xs text-muted-foreground">{logo.file_name}</div>
          )}
        </div>
        <Download className="h-4 w-4 flex-shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
      </div>
    </a>
  );
}
