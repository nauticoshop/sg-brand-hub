"use client";
import { useCallback, useState } from "react";
import Link from "next/link";
import { useDropzone } from "react-dropzone";
import { CheckCircle2, FileText, Loader2, UploadCloud, XCircle } from "lucide-react";

type ItemStatus = "pending" | "processing" | "done" | "error";

type Item = {
  id: string;
  file: File;
  status: ItemStatus;
  brandId?: string;
  brandName?: string;
  merged?: boolean;
  error?: string;
};

async function processItem(item: Item): Promise<Partial<Item>> {
  const formData = new FormData();
  formData.append("file", item.file);

  try {
    const res = await fetch("/api/import/pdf", { method: "POST", body: formData });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? `Import failed (${res.status})`);
    }
    const data = (await res.json()) as { id: string; business_name: string; merged?: boolean };
    return {
      status: "done",
      brandId: data.id,
      brandName: data.business_name,
      merged: data.merged,
    };
  } catch (e) {
    return { status: "error", error: (e as Error).message };
  }
}

export function ImportUploader() {
  const [items, setItems] = useState<Item[]>([]);

  const updateItem = (id: string, patch: Partial<Item>) =>
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));

  const onDrop = useCallback(async (files: File[]) => {
    const newItems: Item[] = files.map((file) => ({
      id: crypto.randomUUID(),
      file,
      status: "pending",
    }));
    setItems((prev) => [...prev, ...newItems]);

    // Sequential processing keeps API spend predictable + avoids rate limits.
    for (const item of newItems) {
      updateItem(item.id, { status: "processing" });
      const result = await processItem(item);
      updateItem(item.id, result);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/pdf": [".pdf"] },
    maxSize: 25 * 1024 * 1024, // 25MB
  });

  const stats = {
    pending: items.filter((i) => i.status === "pending" || i.status === "processing").length,
    done: items.filter((i) => i.status === "done").length,
    error: items.filter((i) => i.status === "error").length,
  };

  return (
    <div className="space-y-6">
      <div
        {...getRootProps()}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border bg-secondary/40 px-6 py-14 text-center transition-colors hover:bg-secondary ${
          isDragActive ? "border-accent bg-accent-soft" : ""
        }`}
      >
        <input {...getInputProps()} />
        <UploadCloud className="h-7 w-7 text-muted-foreground" />
        <p className="mt-3 text-sm font-medium">
          {isDragActive ? "Drop the PDFs to import" : "Drop PDFs here or click to browse"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          PDF only · up to 25 MB each · multiple files OK · ~30s per file
        </p>
      </div>

      {items.length > 0 && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-medium">Queue</h2>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              {stats.pending > 0 && <span>{stats.pending} in progress</span>}
              {stats.done > 0 && <span className="text-emerald-700">{stats.done} done</span>}
              {stats.error > 0 && <span className="text-destructive">{stats.error} failed</span>}
            </div>
          </div>
          <div className="space-y-2">
            {items.map((item) => (
              <ItemRow key={item.id} item={item} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ItemRow({ item }: { item: Item }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-panel p-4">
      <FileText className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{item.file.name}</div>
        {item.status === "pending" && (
          <div className="text-xs text-muted-foreground">Queued</div>
        )}
        {item.status === "processing" && (
          <div className="text-xs text-muted-foreground">Extracting with Claude — usually ~30s…</div>
        )}
        {item.status === "done" && item.brandName && (
          <div className="text-xs text-muted-foreground">
            {item.merged ? "Merged into" : "Imported as"}{" "}
            <span className="font-medium text-foreground">{item.brandName}</span> ·{" "}
            <Link href={`/brand/${item.brandId}`} className="text-foreground underline underline-offset-2">
              Review →
            </Link>
          </div>
        )}
        {item.status === "error" && (
          <div className="text-xs text-destructive">{item.error}</div>
        )}
      </div>
      <div className="flex-shrink-0">
        {item.status === "processing" && (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        )}
        {item.status === "done" && <CheckCircle2 className="h-5 w-5 text-emerald-600" />}
        {item.status === "error" && <XCircle className="h-5 w-5 text-destructive" />}
      </div>
    </div>
  );
}
