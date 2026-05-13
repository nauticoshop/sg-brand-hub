"use client";
import { useEffect, useState } from "react";
import { useDropzone, type Accept } from "react-dropzone";
import { FileText, Trash2, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";

export type StagedLogo = {
  file: File;
  previewUrl: string | null;
};

function isImage(name: string) {
  return /\.(png|jpe?g|svg|webp|gif)$/i.test(name);
}

const LOGO_ACCEPT: Accept = {
  "image/*": [".png", ".jpg", ".jpeg", ".webp", ".gif"],
  "image/svg+xml": [".svg"],
  "application/postscript": [".eps", ".ai"],
};

const REFERENCE_ACCEPT: Accept = {
  "application/pdf": [".pdf"],
  "image/*": [".png", ".jpg", ".jpeg", ".webp", ".gif"],
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": [".pptx"],
  "application/vnd.ms-powerpoint": [".ppt"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "application/msword": [".doc"],
  "video/mp4": [".mp4"],
  "video/quicktime": [".mov"],
  "application/zip": [".zip"],
};

export const LOGO_UPLOAD_DEFAULTS = {
  accept: LOGO_ACCEPT,
  placeholder: "Drop your logo files here or click to browse",
  helper: "PNG, SVG, EPS, AI — multiple files OK · up to 25MB each",
};

export const REFERENCE_UPLOAD_DEFAULTS = {
  accept: REFERENCE_ACCEPT,
  placeholder: "Drop your files here or click to browse",
  helper: "PDF, DOC, DECK, PHOTOS, or VIDEO — multiple files OK · up to 25MB each",
};

export function LogoUpload({
  value,
  onChange,
  accept = LOGO_ACCEPT,
  placeholder = LOGO_UPLOAD_DEFAULTS.placeholder,
  helper = LOGO_UPLOAD_DEFAULTS.helper,
}: {
  value: StagedLogo[];
  onChange: (next: StagedLogo[]) => void;
  accept?: Accept;
  placeholder?: string;
  helper?: string;
}) {
  const [error, setError] = useState<string | null>(null);

  // Revoke object URLs on unmount to avoid memory leaks.
  useEffect(() => {
    return () => {
      value.forEach((l) => {
        if (l.previewUrl) URL.revokeObjectURL(l.previewUrl);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept,
    maxSize: 25 * 1024 * 1024, // 25MB per file
    onDropRejected: (rejections) => {
      const reason = rejections[0]?.errors[0]?.message ?? "File rejected";
      setError(reason);
    },
    onDropAccepted: (files) => {
      setError(null);
      const staged = files.map((file) => ({
        file,
        previewUrl: isImage(file.name) ? URL.createObjectURL(file) : null,
      }));
      onChange([...value, ...staged]);
    },
  });

  function remove(i: number) {
    const next = [...value];
    const [removed] = next.splice(i, 1);
    if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
    onChange(next);
  }

  return (
    <div className="space-y-4">
      <div
        {...getRootProps()}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border bg-secondary/50 px-6 py-10 text-center transition-colors hover:bg-secondary ${
          isDragActive ? "border-accent bg-accent-soft" : ""
        }`}
      >
        <input {...getInputProps()} />
        <UploadCloud className="h-6 w-6 text-muted-foreground" />
        <p className="mt-3 text-sm font-medium">{placeholder}</p>
        <p className="mt-1 text-xs text-muted-foreground">{helper}</p>
      </div>

      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}

      {value.length > 0 && (
        <div className="space-y-2">
          {value.map((logo, i) => (
            <div
              key={`${logo.file.name}-${i}`}
              className="flex items-center gap-3 rounded-xl border border-border bg-panel p-3"
            >
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-secondary">
                {logo.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logo.previewUrl} alt={logo.file.name} className="h-full w-full object-contain" />
                ) : (
                  <FileText className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{logo.file.name}</div>
                <div className="text-xs text-muted-foreground">
                  {(logo.file.size / 1024).toFixed(0)} KB
                </div>
              </div>
              <Button type="button" variant="ghost" size="icon" onClick={() => remove(i)} aria-label="Remove">
                <Trash2 className="h-4 w-4 text-muted-foreground" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
