import { cn } from "@/lib/utils";
import { Eyebrow } from "@/components/ui/eyebrow";

export function FormSection({
  label,
  title,
  description,
  children,
  className,
}: {
  label?: string;
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("py-6 first:pt-0", className)}>
      {label && <Eyebrow className="mb-4">{label}</Eyebrow>}
      {(title || description) && (
        <div className="mb-5">
          {title && <h2 className="text-lg font-semibold tracking-tight">{title}</h2>}
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
      )}
      {children}
    </section>
  );
}

export function FieldGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("grid grid-cols-1 gap-5 md:grid-cols-2", className)}>{children}</div>;
}
