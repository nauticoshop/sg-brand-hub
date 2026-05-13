"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Props = {
  label: string;
  initialValue: string;
  field: string;
  brandId: string;
  multiline?: boolean;
  placeholder?: string;
  className?: string;
  type?: "text" | "url";
  onSave: (id: string, patch: Record<string, string | null>) => Promise<{ ok: boolean; error?: string }>;
};

export function EditableField({
  label,
  initialValue,
  field,
  brandId,
  multiline = false,
  placeholder,
  className,
  type = "text",
  onSave,
}: Props) {
  const [value, setValue] = useState(initialValue ?? "");
  const [savedValue, setSavedValue] = useState(initialValue ?? "");
  const [isPending, startTransition] = useTransition();
  const dirty = value !== savedValue;

  function commit() {
    if (!dirty) return;
    startTransition(async () => {
      const next = value.trim() === "" ? null : value;
      const res = await onSave(brandId, { [field]: next });
      if (res.ok) {
        setSavedValue(value);
      } else {
        toast.error(`Save failed: ${res.error ?? "unknown error"}`);
        setValue(savedValue);
      }
    });
  }

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {multiline ? (
        <Textarea
          value={value}
          placeholder={placeholder}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          rows={4}
          disabled={isPending}
        />
      ) : (
        <Input
          type={type}
          value={value}
          placeholder={placeholder}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          disabled={isPending}
        />
      )}
      {dirty && !isPending && <span className="text-xs text-muted-foreground">Unsaved</span>}
      {isPending && <span className="text-xs text-muted-foreground">Saving…</span>}
    </div>
  );
}
