import { cn, initials } from "@/lib/utils";

export function InitialsAvatar({
  name,
  className,
  size = "md",
}: {
  name: string;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const sizes = {
    sm: "h-7 w-7 text-[10px]",
    md: "h-9 w-9 text-[11px]",
    lg: "h-12 w-12 text-sm",
  } as const;

  return (
    <div
      className={cn(
        "flex flex-shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground font-medium tracking-wider",
        sizes[size],
        className
      )}
    >
      {initials(name)}
    </div>
  );
}
