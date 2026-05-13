import type { BrandFont } from "@/types/brand";

// A short list of fonts NOT on Google Fonts — we'll show the name only,
// not try to render a fake. Extend as needed.
const NON_GOOGLE_FONTS = new Set([
  "bn bergen",
  "interstate",
  "interstate regular",
  "neue haas grotesk",
  "gotham",
  "futura",
  "circular",
]);

function isGoogleFont(name: string): boolean {
  return !NON_GOOGLE_FONTS.has(name.toLowerCase().trim());
}

function googleFontHref(name: string): string {
  const family = name.trim().replace(/\s+/g, "+");
  return `https://fonts.googleapis.com/css2?family=${family}:wght@400;700&display=swap`;
}

export function GoogleFontStyles({ fonts }: { fonts: BrandFont[] }) {
  const loadable = fonts.filter((f) => isGoogleFont(f.name)).map((f) => f.name);
  if (loadable.length === 0) return null;
  return (
    <>
      {loadable.map((name) => (
        // eslint-disable-next-line @next/next/no-css-tags
        <link key={name} rel="stylesheet" href={googleFontHref(name)} />
      ))}
    </>
  );
}

export function TypographyBlock({ font }: { font: BrandFont }) {
  const renderable = isGoogleFont(font.name);
  const fontFamily = renderable ? `"${font.name}", system-ui, sans-serif` : undefined;
  return (
    <div className="border-t border-border py-10 first:border-t-0 first:pt-0">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {font.role}
      </div>
      <div className="mt-2 text-xl font-semibold">{font.name}</div>
      {font.use_case && <div className="mt-0.5 text-sm text-muted-foreground">{font.use_case}</div>}
      <div
        className="mt-6 text-5xl leading-tight md:text-6xl"
        style={{ fontFamily, letterSpacing: "-0.02em" }}
      >
        Aa Bb Cc 123
      </div>
      {!renderable && (
        <div className="mt-2 text-xs italic text-muted-foreground">
          Proprietary font — install locally for accurate preview.
        </div>
      )}
    </div>
  );
}
