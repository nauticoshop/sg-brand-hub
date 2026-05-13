"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Download, Link2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CopyButton } from "./copy-button";

export function ShareHeader({
  businessName,
  shareUrl,
  pdfUrl,
  editUrl,
  canEdit,
}: {
  businessName: string;
  shareUrl: string;
  pdfUrl: string;
  editUrl: string;
  canEdit: boolean;
}) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 120);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`pointer-events-none fixed top-0 left-0 right-0 z-40 transition-all duration-200 ${
        scrolled ? "opacity-100" : "opacity-0"
      }`}
    >
      <div
        className={`pointer-events-auto mx-auto flex h-14 max-w-[1080px] items-center justify-between px-6 transition-colors ${
          scrolled ? "bg-panel/95 backdrop-blur border-b border-border" : ""
        }`}
      >
        <span className="text-sm font-medium tracking-tight">{businessName}</span>
        <div className="flex items-center gap-2">
          <CopyButton value={shareUrl} label="Copy link" />
          <Button variant="outline" size="sm" asChild>
            <a href={pdfUrl} target="_blank" rel="noopener noreferrer">
              <Download className="h-3.5 w-3.5" />
              Export PDF
            </a>
          </Button>
          {canEdit && (
            <Button variant="default" size="sm" asChild>
              <Link href={editUrl}>
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}

export function ShareActionBar({
  shareUrl,
  pdfUrl,
  editUrl,
  canEdit,
}: {
  shareUrl: string;
  pdfUrl: string;
  editUrl: string;
  canEdit: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <CopyButton value={shareUrl} label="Copy link" />
      <Button variant="outline" size="sm" asChild>
        <a href={pdfUrl} target="_blank" rel="noopener noreferrer">
          <Download className="h-3.5 w-3.5" />
          Export PDF
        </a>
      </Button>
      {canEdit && (
        <Button variant="default" size="sm" asChild>
          <Link href={editUrl}>
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </Link>
        </Button>
      )}
    </div>
  );
}
