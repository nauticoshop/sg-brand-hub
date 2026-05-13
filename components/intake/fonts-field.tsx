"use client";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type IntakeFont = { name: string; role: "primary" | "secondary"; use_case: string };

export function FontsField({
  value,
  onChange,
}: {
  value: IntakeFont[];
  onChange: (next: IntakeFont[]) => void;
}) {
  function update(i: number, patch: Partial<IntakeFont>) {
    onChange(value.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  }
  function remove(i: number) {
    onChange(value.filter((_, idx) => idx !== i));
  }
  function add() {
    const nextRole: "primary" | "secondary" =
      value.filter((f) => f.role === "primary").length >= 2 ? "secondary" : "primary";
    onChange([...value, { name: "", role: nextRole, use_case: "" }]);
  }

  return (
    <div className="space-y-3">
      {value.map((f, i) => (
        <div key={i} className="rounded-xl border border-border bg-panel p-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_140px_auto]">
            <Input
              value={f.name}
              onChange={(e) => update(i, { name: e.target.value })}
              placeholder="Font family (e.g. BN Bergen)"
              className="h-9"
            />
            <Select value={f.role} onValueChange={(v) => update(i, { role: v as "primary" | "secondary" })}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="primary">Primary</SelectItem>
                <SelectItem value="secondary">Secondary</SelectItem>
              </SelectContent>
            </Select>
            <Button type="button" variant="ghost" size="icon" onClick={() => remove(i)} aria-label="Remove font">
              <Trash2 className="h-4 w-4 text-muted-foreground" />
            </Button>
          </div>
          {f.name && (
            <div className="mt-3 rounded-md bg-secondary px-4 py-3 text-3xl" style={{ fontFamily: f.name }}>
              Aa Bb Cc 123
            </div>
          )}
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={add}>
        <Plus className="h-3.5 w-3.5" />
        Add font
      </Button>
    </div>
  );
}
