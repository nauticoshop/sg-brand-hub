"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { cn, initials } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Crumb = { label: string; href?: string };

function buildCrumbs(pathname: string): Crumb[] {
  const crumbs: Crumb[] = [{ label: "Surroundings Group", href: "/dashboard" }];
  if (pathname.startsWith("/dashboard")) {
    crumbs.push({ label: "Brand Hub" });
  } else if (pathname.startsWith("/brand/")) {
    crumbs.push({ label: "Brand Hub", href: "/dashboard" });
    crumbs.push({ label: "Brand" });
  } else if (pathname.startsWith("/settings")) {
    crumbs.push({ label: "Brand Hub", href: "/dashboard" });
    crumbs.push({ label: "Settings" });
  } else {
    crumbs.push({ label: "Brand Hub" });
  }
  return crumbs;
}

export function TopNav({ email }: { email: string }) {
  const pathname = usePathname();
  const crumbs = buildCrumbs(pathname);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-panel/95 backdrop-blur supports-[backdrop-filter]:bg-panel/80">
      <div className="mx-auto flex h-14 max-w-[1280px] items-center justify-between px-6">
        <nav className="flex items-center gap-1 text-sm">
          {crumbs.map((crumb, i) => (
            <div key={i} className="flex items-center gap-1">
              {i > 0 && <span className="text-muted-foreground">/</span>}
              {crumb.href ? (
                <Link
                  href={crumb.href}
                  className={cn(
                    "px-1 transition-colors hover:text-foreground",
                    i === crumbs.length - 1 ? "font-medium text-foreground" : "text-muted-foreground"
                  )}
                >
                  {crumb.label}
                </Link>
              ) : (
                <span
                  className={cn(
                    "px-1",
                    i === crumbs.length - 1 ? "font-medium text-foreground" : "text-muted-foreground"
                  )}
                >
                  {crumb.label}
                </span>
              )}
            </div>
          ))}
        </nav>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-[11px] font-medium text-secondary-foreground transition-opacity hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              aria-label="Account menu"
            >
              {initials(email.split("@")[0] || "?")}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <div className="px-2 py-2">
              <div className="text-sm font-medium">{email.split("@")[0]}</div>
              <div className="truncate text-xs text-muted-foreground">{email}</div>
            </div>
            <DropdownMenuSeparator />
            <form action="/auth/signout" method="post">
              <DropdownMenuItem asChild>
                <button type="submit" className="w-full justify-start">
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </DropdownMenuItem>
            </form>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
