"use client";
import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { HexColorPicker } from "react-colorful";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { BrandColor } from "@/types/brand";

function normalizeHex(v: string): string {
  const trimmed = v.trim().replace(/^#/, "");
  return `#${trimmed.slice(0, 6).toUpperCase()}`;
}

export function ColorsEditor({
  brandId,
  initial,
  onSave,
}: {
  brandId: string;
  initial: BrandColor[];
  onSave: (id: string, patch: { colors: BrandColor[] }) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [colors, setColors] = useState<BrandColor[]>(initial);
  const [, startTransition] = useTransition();

  function persist(next: BrandColor[]) {
    setColors(next);
    startTransition(async () => {
      const res = await onSave(brandId, { colors: next });
      if (!res.ok) toast.error(`Save failed: ${res.error ?? "unknown"}`);
    });
  }

  function update(i: number, patch: Partial<BrandColor>) {
    persist(colors.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  }
  function remove(i: number) {
    persist(colors.filter((_, idx) => idx !== i));
  }
  function add(role: "primary" | "secondary") {
    persist([...colors, { name: "New color", hex: "#000000", role }]);
  }

  return (
    <div className="space-y-6">
      {(["primary", "secondary"] as const).map((role) => (
        <div key={role}>
          <div className="mb-3 flex items-center justify-between">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              {role === "primary" ? "Primary palette" : "Secondary palette"}
            </Label>
            <Button variant="ghost" size="sm" onClick={() => add(role)}>
              <Plus className="h-3.5 w-3.5" />
              Add
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {colors
              .map((c, originalIndex) => ({ c, originalIndex }))
              .filter(({ c }) => c.role === role)
              .map(({ c, originalIndex }) => (
                <div key={originalIndex} className="panel flex items-center gap-3 p-3">
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        aria-label="Pick color"
                        className="h-12 w-12 flex-shrink-0 rounded-md border border-border"
                        style={{ background: c.hex }}
                      />
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-3" align="start">
                      <HexColorPicker color={c.hex} onChange={(hex) => update(originalIndex, { hex: normalizeHex(hex) })} />
                    </PopoverContent>
                  </Popover>
                  <div className="flex flex-1 flex-col gap-1.5">
                    <Input
                      value={c.name}
                      onChange={(e) => update(originalIndex, { name: e.target.value })}
                      placeholder="Color name"
                      className="h-8"
                    />
                    <Input
                      value={c.hex}
                      onChange={(e) => update(originalIndex, { hex: normalizeHex(e.target.value) })}
                      placeholder="#000000"
                      className="h-8 font-mono text-xs"
                    />
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => remove(originalIndex)} aria-label="Remove color">
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </div>
              ))}
            {colors.filter((c) => c.role === role).length === 0 && (
              <p className="text-sm text-muted-foreground">No {role} colors yet.</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
