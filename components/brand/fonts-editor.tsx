"use client";
import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { BrandFont } from "@/types/brand";

export function FontsEditor({
  brandId,
  initial,
  onSave,
}: {
  brandId: string;
  initial: BrandFont[];
  onSave: (id: string, patch: { fonts: BrandFont[] }) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [fonts, setFonts] = useState<BrandFont[]>(initial);
  const [, startTransition] = useTransition();

  function persist(next: BrandFont[]) {
    setFonts(next);
    startTransition(async () => {
      const res = await onSave(brandId, { fonts: next });
      if (!res.ok) toast.error(`Save failed: ${res.error ?? "unknown"}`);
    });
  }

  function update(i: number, patch: Partial<BrandFont>) {
    persist(fonts.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  }
  function remove(i: number) {
    persist(fonts.filter((_, idx) => idx !== i));
  }
  function add(role: "primary" | "secondary") {
    persist([...fonts, { name: "", role, use_case: "" }]);
  }

  return (
    <div className="space-y-6">
      {(["primary", "secondary"] as const).map((role) => (
        <div key={role}>
          <div className="mb-3 flex items-center justify-between">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              {role === "primary" ? "Primary font" : "Secondary font"}
            </Label>
            <Button variant="ghost" size="sm" onClick={() => add(role)}>
              <Plus className="h-3.5 w-3.5" />
              Add
            </Button>
          </div>
          <div className="space-y-3">
            {fonts
              .map((f, originalIndex) => ({ f, originalIndex }))
              .filter(({ f }) => f.role === role)
              .map(({ f, originalIndex }) => (
                <div key={originalIndex} className="panel grid grid-cols-1 gap-3 p-4 md:grid-cols-[1fr_1fr_auto]">
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs text-muted-foreground">Font family</Label>
                    <Input
                      value={f.name}
                      onChange={(e) => update(originalIndex, { name: e.target.value })}
                      placeholder="e.g. BN Bergen"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs text-muted-foreground">Use case</Label>
                    <Input
                      value={f.use_case ?? ""}
                      onChange={(e) => update(originalIndex, { use_case: e.target.value })}
                      placeholder="e.g. Headlines, titles, hero copy"
                    />
                  </div>
                  <div className="flex items-end">
                    <Button variant="ghost" size="icon" onClick={() => remove(originalIndex)} aria-label="Remove font">
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                  {f.name && (
                    <div className="md:col-span-3">
                      <div className="rounded-md bg-secondary px-4 py-3 text-3xl" style={{ fontFamily: f.name }}>
                        Aa Bb Cc 123
                      </div>
                    </div>
                  )}
                </div>
              ))}
            {fonts.filter((f) => f.role === role).length === 0 && (
              <p className="text-sm text-muted-foreground">No {role} font yet.</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
