import { Badge } from "@/components/ui/badge";
import { STATUS_LABELS, type BrandStatus } from "@/types/brand";

const VARIANT: Record<BrandStatus, "default" | "accent" | "success" | "warning" | "muted"> = {
  draft: "muted",
  submitted: "accent",
  in_review: "warning",
  approved: "success",
  archived: "muted",
};

export function StatusPill({ status }: { status: BrandStatus }) {
  return <Badge variant={VARIANT[status]}>{STATUS_LABELS[status]}</Badge>;
}
