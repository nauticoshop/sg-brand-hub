import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

export function InfoBanner({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border border-accent/20 bg-accent-soft px-4 py-3 text-sm text-accent-foreground",
        className
      )}
    >
      <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent" />
      <div className="flex-1">{children}</div>
    </div>
  );
}
