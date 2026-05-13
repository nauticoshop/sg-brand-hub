"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

type Props = {
  label: string;
  initialValue: string | null;
  field: string;
  brandId: string;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
  className?: string;
  onSave: (id: string, patch: Record<string, string | null>) => Promise<{ ok: boolean; error?: string }>;
};

export function EditableSelect({
  label,
  initialValue,
  field,
  brandId,
  options,
  placeholder = "Select…",
  className,
  onSave,
}: Props) {
  const [value, setValue] = useState(initialValue ?? "");
  const [isPending, startTransition] = useTransition();

  function commit(next: string) {
    setValue(next);
    startTransition(async () => {
      const res = await onSave(brandId, { [field]: next || null });
      if (!res.ok) toast.error(`Save failed: ${res.error ?? "unknown error"}`);
    });
  }

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Select value={value} onValueChange={commit} disabled={isPending}>
        <SelectTrigger>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
