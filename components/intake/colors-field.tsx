"use client";
import { Plus, Trash2 } from "lucide-react";
import { HexColorPicker } from "react-colorful";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type IntakeColor = { name: string; hex: string; role: "primary" | "secondary" };

function normalizeHex(v: string): string {
  const trimmed = v.trim().replace(/^#/, "");
  return `#${trimmed.slice(0, 6).toUpperCase()}`;
}

export function ColorsField({
  value,
  onChange,
}: {
  value: IntakeColor[];
  onChange: (next: IntakeColor[]) => void;
}) {
  function update(i: number, patch: Partial<IntakeColor>) {
    onChange(value.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  }
  function remove(i: number) {
    onChange(value.filter((_, idx) => idx !== i));
  }
  function add() {
    const nextRole: "primary" | "secondary" =
      value.filter((c) => c.role === "primary").length >= 3 ? "secondary" : "primary";
    onChange([...value, { name: "", hex: "#000000", role: nextRole }]);
  }

  return (
    <div className="space-y-3">
      {value.map((c, i) => (
        <div key={i} className="flex items-center gap-3 rounded-xl border border-border bg-panel p-3">
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
              <HexColorPicker color={c.hex} onChange={(hex) => update(i, { hex: normalizeHex(hex) })} />
            </PopoverContent>
          </Popover>
          <div className="grid flex-1 grid-cols-1 gap-2 md:grid-cols-[1fr_140px_140px]">
            <Input
              value={c.name}
              onChange={(e) => update(i, { name: e.target.value })}
              placeholder="Name (e.g. Deep Forest)"
              className="h-9"
            />
            <Input
              value={c.hex}
              onChange={(e) => update(i, { hex: normalizeHex(e.target.value) })}
              placeholder="#000000"
              className="h-9 font-mono text-xs"
            />
            <Select value={c.role} onValueChange={(v) => update(i, { role: v as "primary" | "secondary" })}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="primary">Primary</SelectItem>
                <SelectItem value="secondary">Secondary</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={() => remove(i)} aria-label="Remove color">
            <Trash2 className="h-4 w-4 text-muted-foreground" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={add}>
        <Plus className="h-3.5 w-3.5" />
        Add color
      </Button>
    </div>
  );
}
