import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { ChevronDown, Folder, ExternalLink, Palette } from "lucide-react";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isEmailAllowed } from "@/lib/auth/domain";
import { VERTICAL_LABELS, type Brand, type BrandLogo } from "@/types/brand";
import { ShareHeader, ShareActionBar } from "@/components/share/share-header";
import { ColorSwatches } from "@/components/share/color-swatches";
import { LogoGrid } from "@/components/share/logo-grid";
import { GoogleFontStyles, TypographyBlock } from "@/components/share/typography-sample";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Decide white or near-black foreground based on the background's perceived luminance.
function fgFor(hex: string): { fg: string; subtle: string } {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2) || "00", 16);
  const g = parseInt(clean.slice(2, 4) || "00", 16);
  const b = parseInt(clean.slice(4, 6) || "00", 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6
    ? { fg: "#111111", subtle: "rgba(17, 17, 17, 0.65)" }
    : { fg: "#FFFFFF", subtle: "rgba(255, 255, 255, 0.7)" };
}

export async function generateMetadata({ params }: { params: { token: string } }) {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("brands")
    .select("business_name, tagline")
    .eq("share_token", params.token)
    .single();
  if (!data) return { title: "Brand — Surroundings Group" };
  return {
    title: `${data.business_name} — Brand Guidelines`,
    description: data.tagline ?? `${data.business_name} brand guidelines by Surroundings Group.`,
  };
}

export default async function SharePage({ params }: { params: { token: string } }) {
  // Disable any framework-level caching of this page's data fetches.
  // Brand records can update at any moment from the internal editor.
  noStore();
  const admin = createSupabaseAdminClient();

  const { data: brand } = await admin
    .from("brands")
    .select("*")
    .eq("share_token", params.token)
    .single();

  if (!brand) notFound();
  const b = brand as Brand;

  const { data: logos } = await admin
    .from("brand_logos")
    .select("*")
    .eq("brand_id", b.id)
    .order("display_order");
  const brandLogos = (logos ?? []) as BrandLogo[];

  // Is the viewer signed in as an SG team member?
  const userClient = createSupabaseServerClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();
  const canEdit = !!user && isEmailAllowed(user.email);

  const primary = b.colors?.find((c) => c.role === "primary")?.hex ?? "#293B29";
  const { fg, subtle } = fgFor(primary);

  const verticalLabel =
    b.vertical === "other" && b.vertical_other
      ? b.vertical_other
      : b.vertical
      ? VERTICAL_LABELS[b.vertical]
      : null;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const shareUrl = `${appUrl}/share/${b.share_token}`;
  const pdfUrl = `${appUrl}/api/share/${b.share_token}/pdf`;
  const editUrl = `/brand/${b.id}`;

  const logoCount = brandLogos.filter((l) => l.logo_type !== "reference").length;
  const hasColors = (b.colors ?? []).length > 0;
  const hasFonts = (b.fonts ?? []).length > 0;
  const hasVoice = !!(
    b.brand_voice ||
    b.look_and_feel ||
    b.what_to_avoid ||
    b.inspiration_references ||
    b.audience_gender ||
    b.audience_age ||
    b.audience_type
  );
  const hasDirection = !!(b.coloring_tone || b.music_notes || (b.music_mood && b.music_mood.length > 0));

  const overview = b.overview_polished || b.overview_client_raw;

  return (
    <>
      <GoogleFontStyles fonts={b.fonts ?? []} />
      <ShareHeader
        businessName={b.business_name}
        shareUrl={shareUrl}
        pdfUrl={pdfUrl}
        editUrl={editUrl}
        canEdit={canEdit}
      />

      {/* HERO */}
      <section
        className="relative flex min-h-[78vh] flex-col"
        style={{ backgroundColor: primary, color: fg }}
      >
        <div className="mx-auto flex w-full max-w-[1080px] flex-1 flex-col px-6 pt-12 md:px-12">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: subtle }}>
              Brand Guidelines
            </div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: subtle }}>
              Surroundings Group
            </div>
          </div>

          <div className="mt-auto pb-20">
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em]" style={{ color: subtle }}>
              {verticalLabel ?? "Brand"}
            </div>
            <h1
              className="mt-3 text-[14vw] font-bold leading-[0.95] tracking-tight md:text-[112px]"
              style={{ color: fg, letterSpacing: "-0.04em" }}
            >
              {b.business_name}
            </h1>
            {b.tagline && (
              <p className="mt-6 max-w-2xl text-lg md:text-xl" style={{ color: subtle, lineHeight: 1.45 }}>
                {b.tagline}
              </p>
            )}
          </div>

          <div className="flex items-center justify-center pb-10" style={{ color: subtle }}>
            <ChevronDown className="h-5 w-5 animate-bounce" />
          </div>
        </div>
      </section>

      {/* ACTION BAR (visible above the fold of body) */}
      <div className="border-b border-border bg-panel">
        <div className="mx-auto flex max-w-[1080px] items-center justify-between gap-3 px-6 py-4 md:px-12">
          <div className="text-xs text-muted-foreground">
            {logoCount > 0 && <span className="font-medium text-foreground">{logoCount}</span>}
            {logoCount > 0 && " logo files · "}
            {hasColors && <span className="font-medium text-foreground">{(b.colors ?? []).length}</span>}
            {hasColors && " colors · "}
            {hasFonts && <span className="font-medium text-foreground">{(b.fonts ?? []).length}</span>}
            {hasFonts && " fonts"}
          </div>
          <ShareActionBar shareUrl={shareUrl} pdfUrl={pdfUrl} editUrl={editUrl} canEdit={canEdit} />
        </div>
      </div>

      {/* RESOURCES — quick-access cards for editors / freelancers */}
      <ResourcesStrip
        dropbox={b.dropbox_folder_url}
        clientFolder={b.client_asset_folder_url}
      />

      {/* BODY */}
      <main className="mx-auto max-w-[1080px] px-6 md:px-12">
        {/* BRAND */}
        <Section index="01" label="Brand">
          <SectionTitle>About {b.business_name}</SectionTitle>
          {overview && <Prose>{overview}</Prose>}

          <div className="mt-12 grid grid-cols-1 gap-x-10 gap-y-6 border-t border-border pt-8 md:grid-cols-3">
            {verticalLabel && <Meta label="Category" value={verticalLabel} />}
            {b.website && <Meta label="Website" value={b.website} href={b.website} />}
            {b.instagram && <Meta label="Instagram" value={b.instagram} />}
            {b.facebook && <Meta label="Facebook" value={b.facebook} />}
            {b.youtube && <Meta label="YouTube" value={b.youtube} />}
            {b.tiktok && <Meta label="TikTok" value={b.tiktok} />}
            {b.linkedin && <Meta label="LinkedIn" value={b.linkedin} />}
          </div>
        </Section>

        {/* LOGOS */}
        {logoCount > 0 && (
          <Section index="02" label="Logos">
            <SectionTitle>Logo variations</SectionTitle>
            <p className="mt-2 text-sm text-muted-foreground">
              Click any tile to download. Use the button below for everything at once.
            </p>
            <div className="mt-8">
              <LogoGrid logos={brandLogos} />
            </div>
            <div className="mt-6">
              <a
                href={`${appUrl}/api/share/${params.token}/logos.zip`}
                className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Download all logos as zip
              </a>
            </div>
          </Section>
        )}

        {/* VOICE */}
        {hasVoice && (
          <Section index={logoCount > 0 ? "03" : "02"} label="Voice">
            <SectionTitle>Voice &amp; audience</SectionTitle>

            <div className="mt-8 space-y-10">
              {b.brand_voice && <SubBlock title="Tone &amp; personality">{b.brand_voice}</SubBlock>}
              {b.look_and_feel && <SubBlock title="Look &amp; feel">{b.look_and_feel}</SubBlock>}
              {b.what_to_avoid && <SubBlock title="What to avoid">{b.what_to_avoid}</SubBlock>}
              {b.inspiration_references && (
                <InspirationBlock value={b.inspiration_references} />
              )}
            </div>

            {(b.audience_gender || b.audience_age || b.audience_type) && (
              <div className="mt-12 grid grid-cols-1 gap-x-10 gap-y-6 border-t border-border pt-8 md:grid-cols-3">
                {b.audience_gender && <Meta label="Gender" value={b.audience_gender} />}
                {b.audience_age && <Meta label="Age" value={b.audience_age} />}
                {b.audience_type && (
                  <Meta className="md:col-span-3" label="Audience" value={b.audience_type} />
                )}
              </div>
            )}
          </Section>
        )}

        {/* COLORS */}
        {hasColors && (
          <Section index={nextIndex(logoCount > 0, hasVoice)} label="Colors">
            <SectionTitle>Palette</SectionTitle>
            <p className="mt-2 text-sm text-muted-foreground">Tap any swatch to copy its hex.</p>
            <div className="mt-8">
              <ColorSwatches colors={b.colors ?? []} />
            </div>
          </Section>
        )}

        {/* TYPOGRAPHY */}
        {hasFonts && (
          <Section
            index={nextIndex(logoCount > 0, hasVoice, hasColors)}
            label="Typography"
          >
            <SectionTitle>Type</SectionTitle>
            <div className="mt-8">
              {(b.fonts ?? []).map((f, i) => (
                <TypographyBlock key={i} font={f} />
              ))}
            </div>
          </Section>
        )}

        {/* DIRECTION */}
        {hasDirection && (
          <Section
            index={nextIndex(logoCount > 0, hasVoice, hasColors, hasFonts)}
            label="Production"
          >
            <SectionTitle>Production direction</SectionTitle>
            <div className="mt-8 space-y-10">
              {b.coloring_tone && <SubBlock title="Coloring tone">{b.coloring_tone}</SubBlock>}
              {b.music_mood && b.music_mood.length > 0 && (
                <SubBlock title="Music mood">{b.music_mood.join(", ")}</SubBlock>
              )}
              {b.music_notes && <SubBlock title="Music notes">{b.music_notes}</SubBlock>}
            </div>
          </Section>
        )}

        <footer className="border-t border-border py-16 text-center text-xs text-muted-foreground">
          Built by{" "}
          <span className="font-semibold text-foreground">Surroundings Group</span> · Nautical Network
        </footer>
      </main>
    </>
  );
}

// Helpers — small inline components for the editorial layout.

function nextIndex(...prior: boolean[]) {
  // 01 is always Brand; 02 starts the optional sections.
  const count = prior.filter(Boolean).length + 2;
  return String(count).padStart(2, "0");
}

function Section({
  index,
  label,
  children,
}: {
  index: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-border py-20 first:border-t-0 md:py-28">
      <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
        {index} · {label}
      </div>
      <div className="mt-6">{children}</div>
    </section>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-3xl font-semibold tracking-tight md:text-4xl" style={{ letterSpacing: "-0.02em" }}>
      {children}
    </h2>
  );
}

function Prose({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-6 max-w-2xl text-base leading-relaxed text-foreground/85 md:text-[17px] md:leading-[1.7]">
      {children}
    </p>
  );
}

function looksLikeUrl(v: string): boolean {
  return /^https?:\/\//i.test(v);
}

// Normalize "https://www.instagram.com/handle/" → "instagram.com/handle".
// Keeps it short and human-readable on the share page.
function prettyUrl(v: string): string {
  try {
    const u = new URL(v);
    const host = u.hostname.replace(/^www\./, "");
    const path = u.pathname.replace(/\/$/, "");
    return path && path !== "/" ? `${host}${path}` : host;
  } catch {
    return v;
  }
}

function Meta({
  label,
  value,
  href,
  className,
}: {
  label: string;
  value: string;
  href?: string;
  className?: string;
}) {
  // Auto-link any URL-looking value.
  const effectiveHref = href ?? (looksLikeUrl(value) ? value : undefined);
  const display = effectiveHref && looksLikeUrl(value) ? prettyUrl(value) : value;

  return (
    <div className={className}>
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-1.5 text-sm">
        {effectiveHref ? (
          <a
            href={effectiveHref}
            target="_blank"
            rel="noopener noreferrer"
            className="text-foreground underline-offset-4 hover:underline"
          >
            {display}
          </a>
        ) : (
          value
        )}
      </div>
    </div>
  );
}

function ResourcesStrip({
  dropbox,
  clientFolder,
}: {
  dropbox: string | null;
  clientFolder: string | null;
}) {
  const items: Array<{ label: string; sub: string; href: string; Icon: typeof Folder }> = [];

  if (dropbox) {
    items.push({
      label: "Brand Asset Library",
      sub: "Parent Dropbox folder — logos, photos, video assets",
      href: dropbox,
      Icon: Folder,
    });
  }
  if (clientFolder && clientFolder !== dropbox) {
    items.push({
      label: "Client Folder",
      sub: "Original assets shared by the client",
      href: clientFolder,
      Icon: Palette,
    });
  }

  if (items.length === 0) return null;

  return (
    <section className="border-b border-border bg-secondary/30">
      <div className="mx-auto max-w-[1080px] px-6 py-8 md:px-12">
        <div className="mb-4 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          Quick access
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <a
              key={item.label}
              href={item.href}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-3 rounded-xl border border-border bg-panel px-4 py-3.5 transition-shadow hover:shadow-panel-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-secondary text-foreground">
                <item.Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{item.label}</div>
                <div className="truncate text-xs text-muted-foreground">{item.sub}</div>
              </div>
              <ExternalLink className="h-4 w-4 flex-shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

function SubBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {title}
      </h3>
      <div className="mt-3 max-w-2xl text-base leading-relaxed text-foreground/85 md:text-[17px] md:leading-[1.7]">
        <p style={{ whiteSpace: "pre-wrap" }}>{children}</p>
      </div>
    </div>
  );
}

function InspirationBlock({ value }: { value: string }) {
  const lines = value
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  return (
    <div>
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        Inspiration references
      </h3>
      <div className="mt-3 max-w-2xl space-y-2">
        {lines.map((line, i) => {
          const isUrl = /^https?:\/\//i.test(line);
          if (isUrl) {
            return (
              <a
                key={i}
                href={line}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-base text-foreground/85 underline-offset-4 hover:underline md:text-[17px]"
              >
                {prettyUrl(line)}
              </a>
            );
          }
          return (
            <p
              key={i}
              className="text-base leading-relaxed text-foreground/85 md:text-[17px] md:leading-[1.7]"
            >
              {line}
            </p>
          );
        })}
      </div>
    </div>
  );
}
