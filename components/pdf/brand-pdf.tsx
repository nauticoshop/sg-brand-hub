import { Document, Page, View, Text, Image, Link, StyleSheet, Font } from "@react-pdf/renderer";
import { VERTICAL_LABELS, type Brand, type BrandLogo } from "@/types/brand";

// Disable mid-word hyphenation — long names wrap on word boundaries (e.g. "Nautical / Network").
Font.registerHyphenationCallback((word) => [word]);

const INK = "#111111";
const SOFT_INK = "#3A3733";
const MUTED = "#8A867F";
const LINE = "#E8E5DE";
const SG_GREEN = "#293B29"; // fallback cover color
const PAPER = "#FFFFFF";

const styles = StyleSheet.create({
  // PAGE BASE — generous editorial margins
  page: {
    paddingTop: 84,
    paddingBottom: 72,
    paddingHorizontal: 72,
    fontFamily: "Helvetica",
    color: INK,
    fontSize: 10.5,
    lineHeight: 1.65,
  },

  // COVER
  cover: { padding: 0 },
  coverFill: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  coverEyebrow: {
    position: "absolute",
    top: 64,
    left: 64,
    color: "#FFFFFF",
    opacity: 0.85,
    fontSize: 9,
    letterSpacing: 2.2,
    fontFamily: "Helvetica-Bold",
  },
  coverYear: {
    position: "absolute",
    top: 64,
    right: 64,
    color: "#FFFFFF",
    opacity: 0.85,
    fontSize: 9,
    letterSpacing: 2.2,
    fontFamily: "Helvetica-Bold",
  },
  coverHairline: {
    position: "absolute",
    bottom: 220,
    left: 64,
    right: 64,
    borderTopWidth: 0.5,
    borderTopColor: "#FFFFFF",
    opacity: 0.35,
  },
  coverTitleWrap: {
    position: "absolute",
    bottom: 80,
    left: 64,
    right: 64,
  },
  coverTitle: {
    color: "#FFFFFF",
    fontSize: 64,
    fontFamily: "Helvetica-Bold",
    letterSpacing: -1.4,
    lineHeight: 1.02,
  },
  coverTagline: {
    color: "#FFFFFF",
    opacity: 0.78,
    marginTop: 18,
    fontSize: 12,
    lineHeight: 1.5,
    maxWidth: 380,
  },
  coverFooter: {
    position: "absolute",
    bottom: 48,
    left: 64,
    right: 64,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  coverFooterText: {
    color: "#FFFFFF",
    opacity: 0.6,
    fontSize: 8,
    letterSpacing: 1.6,
    fontFamily: "Helvetica-Bold",
  },

  // INNER PAGE EYEBROW (e.g. "01 / BRAND")
  pageEyebrow: {
    fontSize: 8.5,
    color: MUTED,
    letterSpacing: 2,
    fontFamily: "Helvetica-Bold",
    marginBottom: 36,
  },

  // Embedded brand logo at top of Brand page
  brandLogo: {
    maxHeight: 64,
    maxWidth: 180,
    marginBottom: 28,
    objectFit: "contain",
  },

  // Clickable link
  link: { color: INK, textDecoration: "none" },

  // HEADLINES
  h1: {
    fontSize: 36,
    fontFamily: "Helvetica-Bold",
    color: INK,
    marginBottom: 22,
    letterSpacing: -0.6,
    lineHeight: 1.05,
  },
  display: {
    fontSize: 18,
    fontFamily: "Helvetica",
    color: SOFT_INK,
    marginBottom: 28,
    letterSpacing: -0.1,
    lineHeight: 1.4,
  },

  // BODY
  body: { fontSize: 10.5, lineHeight: 1.7, color: INK, marginBottom: 14 },
  bodyMuted: { fontSize: 10.5, lineHeight: 1.7, color: MUTED, marginBottom: 14 },

  // SECTION HEADER (smaller, used inside a page)
  h2: {
    fontSize: 9,
    color: MUTED,
    letterSpacing: 2,
    fontFamily: "Helvetica-Bold",
    marginTop: 40,
    marginBottom: 16,
  },

  // BOTTOM METADATA (label / value pairs)
  metaSection: {
    marginTop: 48,
    paddingTop: 22,
    borderTopWidth: 0.5,
    borderTopColor: LINE,
  },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 30 },
  metaItem: { minWidth: 110, marginBottom: 12 },
  metaLabel: {
    fontSize: 7,
    color: MUTED,
    letterSpacing: 1.4,
    fontFamily: "Helvetica-Bold",
    marginBottom: 4,
  },
  metaValue: { fontSize: 10, color: INK, lineHeight: 1.4 },

  // COLORS — dramatic full-width banner of swatches
  colorBanner: { flexDirection: "row", marginTop: 8, marginBottom: 28, height: 200 },
  colorCell: { flex: 1 },
  colorDetailRow: { flexDirection: "row", flexWrap: "wrap", gap: 32 },
  colorDetailItem: { minWidth: 100, marginBottom: 18 },
  colorDetailRole: {
    fontSize: 7,
    color: MUTED,
    letterSpacing: 1.4,
    fontFamily: "Helvetica-Bold",
  },
  colorDetailName: { fontSize: 11, fontFamily: "Helvetica-Bold", color: INK, marginTop: 5 },
  colorDetailHex: { fontSize: 9, color: MUTED, marginTop: 2 },

  // FONTS — big sample, generous spacing
  fontBlock: { marginBottom: 36 },
  fontRoleLabel: {
    fontSize: 7,
    color: MUTED,
    letterSpacing: 1.4,
    fontFamily: "Helvetica-Bold",
    marginBottom: 8,
  },
  fontName: { fontSize: 14, fontFamily: "Helvetica-Bold", color: INK },
  fontUse: { fontSize: 9.5, color: MUTED, marginTop: 3 },
  fontSample: { fontSize: 44, marginTop: 14, color: INK, letterSpacing: -0.4 },

  // LISTS (logos, references) — minimal, type-driven
  listRow: {
    flexDirection: "row",
    paddingVertical: 10,
    borderTopWidth: 0.4,
    borderTopColor: LINE,
  },
  listIndex: { width: 28, fontSize: 9.5, color: MUTED, fontFamily: "Helvetica-Bold" },
  listLabel: { width: 150, fontSize: 9.5, color: MUTED },
  listValue: { flex: 1, fontSize: 9.5, color: INK },

  // PAGE FOOTER (number + brand)
  pageFooter: {
    position: "absolute",
    bottom: 40,
    left: 72,
    right: 72,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  pageFooterText: {
    fontSize: 7.5,
    color: MUTED,
    letterSpacing: 1.2,
    fontFamily: "Helvetica-Bold",
  },
});

type PdfProps = { brand: Brand; logos: BrandLogo[]; appUrl?: string };

function primaryColorOf(brand: Brand) {
  return brand.colors?.find((c) => c.role === "primary")?.hex ?? SG_GREEN;
}

function PageFooter({ brand }: { brand: Brand }) {
  return (
    <View style={styles.pageFooter} fixed>
      <Text style={styles.pageFooterText}>{brand.business_name.toUpperCase()}</Text>
      <Text
        style={styles.pageFooterText}
        render={({ pageNumber, totalPages }) =>
          `${String(pageNumber).padStart(2, "0")} / ${String(totalPages).padStart(2, "0")}`
        }
      />
    </View>
  );
}

function HeroCover({ brand }: { brand: Brand }) {
  const primary = primaryColorOf(brand);
  const year = new Date().getFullYear();
  // Scale title down for long names so it stays in one or two clean lines.
  const len = brand.business_name.length;
  const titleSize = len <= 9 ? 72 : len <= 14 ? 64 : len <= 22 ? 52 : 42;
  return (
    <Page size="LETTER" style={[styles.page, styles.cover]}>
      <View style={[styles.coverFill, { backgroundColor: primary }]} />

      <Text style={styles.coverEyebrow}>BRAND GUIDELINES</Text>
      <Text style={styles.coverYear}>{year}</Text>

      <View style={styles.coverHairline} />

      <View style={styles.coverTitleWrap}>
        <Text style={[styles.coverTitle, { fontSize: titleSize }]}>{brand.business_name}</Text>
        {brand.tagline && <Text style={styles.coverTagline}>{brand.tagline}</Text>}
      </View>

      <View style={styles.coverFooter}>
        <Text style={styles.coverFooterText}>SURROUNDINGS GROUP</Text>
        <Text style={styles.coverFooterText}>NAUTICAL NETWORK</Text>
      </View>
    </Page>
  );
}

function BrandPage({
  brand,
  sectionIndex,
  embeddableLogo,
}: {
  brand: Brand;
  sectionIndex: string;
  embeddableLogo: BrandLogo | null;
}) {
  const overview = brand.overview_polished || brand.overview_client_raw;
  const verticalLabel =
    brand.vertical === "other" && brand.vertical_other
      ? brand.vertical_other
      : brand.vertical
      ? VERTICAL_LABELS[brand.vertical]
      : null;
  const primarySocial = brand.instagram
    ? { label: "Instagram", value: brand.instagram }
    : brand.linkedin
    ? { label: "LinkedIn", value: brand.linkedin }
    : null;

  return (
    <Page size="LETTER" style={styles.page}>
      <Text style={styles.pageEyebrow}>{sectionIndex} / BRAND</Text>
      {embeddableLogo && <Image src={embeddableLogo.public_url} style={styles.brandLogo} />}
      <Text style={styles.h1}>{brand.business_name}</Text>
      {brand.tagline && <Text style={styles.display}>{brand.tagline}</Text>}
      {overview && <Text style={styles.body}>{overview}</Text>}

      {(verticalLabel || brand.website || primarySocial) && (
        <View style={styles.metaSection}>
          <View style={styles.metaRow}>
            {verticalLabel && (
              <View style={styles.metaItem}>
                <Text style={styles.metaLabel}>CATEGORY</Text>
                <Text style={styles.metaValue}>{verticalLabel}</Text>
              </View>
            )}
            {brand.website && (
              <View style={styles.metaItem}>
                <Text style={styles.metaLabel}>WEB</Text>
                <Link src={brand.website} style={[styles.metaValue, styles.link]}>
                  {brand.website}
                </Link>
              </View>
            )}
            {primarySocial &&
              (() => {
                const isUrl = /^https?:\/\//i.test(primarySocial.value);
                return (
                  <View style={styles.metaItem}>
                    <Text style={styles.metaLabel}>{primarySocial.label.toUpperCase()}</Text>
                    {isUrl ? (
                      <Link src={primarySocial.value} style={[styles.metaValue, styles.link]}>
                        {primarySocial.value}
                      </Link>
                    ) : (
                      <Text style={styles.metaValue}>{primarySocial.value}</Text>
                    )}
                  </View>
                );
              })()}
          </View>
        </View>
      )}

      <PageFooter brand={brand} />
    </Page>
  );
}

function VoicePage({ brand, sectionIndex }: { brand: Brand; sectionIndex: string }) {
  const hasAudience = brand.audience_gender || brand.audience_age || brand.audience_type;
  const hasAnyVoice =
    brand.brand_voice ||
    brand.look_and_feel ||
    brand.what_to_avoid ||
    brand.inspiration_references;
  if (!hasAnyVoice && !hasAudience) return null;

  const inspirationLines = (brand.inspiration_references ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  return (
    <Page size="LETTER" style={styles.page}>
      <Text style={styles.pageEyebrow}>{sectionIndex} / VOICE</Text>
      <Text style={styles.h1}>Voice &amp; Audience</Text>

      {brand.brand_voice && (
        <>
          <Text style={styles.h2}>TONE &amp; PERSONALITY</Text>
          <Text style={styles.body}>{brand.brand_voice}</Text>
        </>
      )}

      {brand.look_and_feel && (
        <>
          <Text style={styles.h2}>LOOK &amp; FEEL</Text>
          <Text style={styles.body}>{brand.look_and_feel}</Text>
        </>
      )}

      {brand.what_to_avoid && (
        <>
          <Text style={styles.h2}>WHAT TO AVOID</Text>
          <Text style={styles.body}>{brand.what_to_avoid}</Text>
        </>
      )}

      {inspirationLines.length > 0 && (
        <>
          <Text style={styles.h2}>INSPIRATION REFERENCES</Text>
          {inspirationLines.map((line, i) => {
            const isUrl = /^https?:\/\//i.test(line);
            return isUrl ? (
              <Link key={i} src={line} style={[styles.body, styles.link, { marginBottom: 4 }]}>
                {line}
              </Link>
            ) : (
              <Text key={i} style={[styles.body, { marginBottom: 4 }]}>
                {line}
              </Text>
            );
          })}
        </>
      )}

      {hasAudience && (
        <View style={styles.metaSection}>
          <View style={styles.metaRow}>
            {brand.audience_gender && (
              <View style={styles.metaItem}>
                <Text style={styles.metaLabel}>GENDER</Text>
                <Text style={styles.metaValue}>{brand.audience_gender}</Text>
              </View>
            )}
            {brand.audience_age && (
              <View style={styles.metaItem}>
                <Text style={styles.metaLabel}>AGE</Text>
                <Text style={styles.metaValue}>{brand.audience_age}</Text>
              </View>
            )}
            {brand.audience_type && (
              <View style={[styles.metaItem, { minWidth: 280 }]}>
                <Text style={styles.metaLabel}>AUDIENCE</Text>
                <Text style={styles.metaValue}>{brand.audience_type}</Text>
              </View>
            )}
          </View>
        </View>
      )}

      <PageFooter brand={brand} />
    </Page>
  );
}

function ColorsPage({ brand, sectionIndex }: { brand: Brand; sectionIndex: string }) {
  const colors = brand.colors ?? [];
  if (colors.length === 0) return null;
  // Cap the banner at a comfortable number so cells stay readable.
  const bannerCount = Math.min(colors.length, 6);
  const bannerColors = colors.slice(0, bannerCount);

  return (
    <Page size="LETTER" style={styles.page}>
      <Text style={styles.pageEyebrow}>{sectionIndex} / PALETTE</Text>
      <Text style={styles.h1}>Colors</Text>

      <View style={styles.colorBanner}>
        {bannerColors.map((c, i) => (
          <View key={i} style={[styles.colorCell, { backgroundColor: c.hex }]} />
        ))}
      </View>

      <View style={styles.colorDetailRow}>
        {colors.map((c, i) => (
          <View key={i} style={styles.colorDetailItem}>
            <Text style={styles.colorDetailRole}>{c.role.toUpperCase()}</Text>
            <Text style={styles.colorDetailName}>{c.name}</Text>
            <Text style={styles.colorDetailHex}>{c.hex}</Text>
          </View>
        ))}
      </View>

      <PageFooter brand={brand} />
    </Page>
  );
}

function TypographyPage({ brand, sectionIndex }: { brand: Brand; sectionIndex: string }) {
  const fonts = brand.fonts ?? [];
  if (fonts.length === 0) return null;

  return (
    <Page size="LETTER" style={styles.page}>
      <Text style={styles.pageEyebrow}>{sectionIndex} / TYPOGRAPHY</Text>
      <Text style={styles.h1}>Type</Text>

      {fonts.map((f, i) => (
        <View key={i} style={styles.fontBlock}>
          <Text style={styles.fontRoleLabel}>{f.role.toUpperCase()}</Text>
          <Text style={styles.fontName}>{f.name}</Text>
          {f.use_case && <Text style={styles.fontUse}>{f.use_case}</Text>}
          <Text style={styles.fontSample}>Aa Bb Cc 123</Text>
        </View>
      ))}

      <PageFooter brand={brand} />
    </Page>
  );
}

function DirectionPage({ brand, sectionIndex }: { brand: Brand; sectionIndex: string }) {
  const hasContent =
    brand.coloring_tone ||
    (brand.music_mood && brand.music_mood.length > 0) ||
    brand.music_notes;
  if (!hasContent) return null;

  return (
    <Page size="LETTER" style={styles.page}>
      <Text style={styles.pageEyebrow}>{sectionIndex} / DIRECTION</Text>
      <Text style={styles.h1}>Production</Text>

      {brand.coloring_tone && (
        <>
          <Text style={styles.h2}>COLORING TONE</Text>
          <Text style={styles.body}>{brand.coloring_tone}</Text>
        </>
      )}
      {brand.music_mood && brand.music_mood.length > 0 && (
        <>
          <Text style={styles.h2}>MUSIC MOOD</Text>
          <Text style={styles.body}>{brand.music_mood.join(", ")}</Text>
        </>
      )}
      {brand.music_notes && (
        <>
          <Text style={styles.h2}>MUSIC NOTES</Text>
          <Text style={styles.body}>{brand.music_notes}</Text>
        </>
      )}

      <PageFooter brand={brand} />
    </Page>
  );
}

function AssetsPage({
  brand,
  logos,
  sectionIndex,
  zipUrl,
}: {
  brand: Brand;
  logos: BrandLogo[];
  sectionIndex: string;
  zipUrl: string | null;
}) {
  const logoOnly = logos.filter((l) => l.logo_type !== "reference");
  const references: Array<{ label: string; value: string }> = [];
  if (brand.website) references.push({ label: "Website", value: brand.website });
  if (brand.instagram) references.push({ label: "Instagram", value: brand.instagram });
  if (brand.facebook) references.push({ label: "Facebook", value: brand.facebook });
  if (brand.youtube) references.push({ label: "YouTube", value: brand.youtube });
  if (brand.tiktok) references.push({ label: "TikTok", value: brand.tiktok });
  if (brand.linkedin) references.push({ label: "LinkedIn", value: brand.linkedin });
  if (brand.dropbox_folder_url) references.push({ label: "Asset Library", value: brand.dropbox_folder_url });
  if (brand.client_asset_folder_url && !brand.dropbox_folder_url)
    references.push({ label: "Client Folder", value: brand.client_asset_folder_url });
  if (brand.inspiration_references)
    references.push({ label: "Inspiration", value: brand.inspiration_references });

  return (
    <Page size="LETTER" style={styles.page}>
      <Text style={styles.pageEyebrow}>{sectionIndex} / ASSETS</Text>
      <Text style={styles.h1}>Logos &amp; References</Text>

      {logoOnly.length > 0 ? (
        <>
          <Text style={styles.h2}>LOGO VARIATIONS · CLICK TO DOWNLOAD</Text>
          {zipUrl && (
            <Link src={zipUrl} style={[styles.body, styles.link, { fontFamily: "Helvetica-Bold", marginBottom: 8 }]}>
              ↓ Download all logos as zip
            </Link>
          )}
          {logoOnly.map((l, i) => {
            const downloadUrl = `${l.public_url}?download=${encodeURIComponent(l.file_name)}`;
            return (
              <View key={l.id} style={styles.listRow}>
                <Text style={styles.listIndex}>{String(i + 1).padStart(2, "0")}</Text>
                <Link src={downloadUrl} style={[styles.listValue, styles.link]}>
                  {[l.logo_type, l.colorway].filter(Boolean).join(" — ") || l.file_name}
                </Link>
              </View>
            );
          })}
        </>
      ) : (
        <>
          <Text style={styles.h2}>LOGO VARIATIONS</Text>
          <Text style={styles.bodyMuted}>No logo files catalogued yet.</Text>
        </>
      )}

      {references.length > 0 && (
        <>
          <Text style={styles.h2}>REFERENCES</Text>
          {references.map((r) => {
            const looksLikeUrl = /^https?:\/\//i.test(r.value);
            return (
              <View key={r.label} style={styles.listRow}>
                <Text style={styles.listLabel}>{r.label}</Text>
                {looksLikeUrl ? (
                  <Link src={r.value} style={[styles.listValue, styles.link]}>
                    {r.value}
                  </Link>
                ) : (
                  <Text style={styles.listValue}>{r.value}</Text>
                )}
              </View>
            );
          })}
        </>
      )}

      <PageFooter brand={brand} />
    </Page>
  );
}

export function BrandPdf({ brand, logos, appUrl }: PdfProps) {
  // First renderable logo for embedding on the Brand page.
  // React-PDF can't render SVG/EPS/AI reliably — pick PNG/JPG/GIF/WEBP only.
  const embeddableLogo =
    logos.find(
      (l) => l.logo_type !== "reference" && /\.(png|jpe?g|gif|webp)$/i.test(l.file_name)
    ) ?? null;

  const zipUrl = appUrl ? `${appUrl}/api/brands/${brand.id}/logos.zip` : null;

  // Logos & References moves up — right after Brand — so editors don't hunt for it.
  // Section numbers auto-rebuild based on what's actually rendered.
  type SectionKind = "brand" | "assets" | "voice" | "colors" | "type" | "direction";
  const allSections: Array<{ kind: SectionKind; show: boolean }> = [
    { kind: "brand", show: true },
    { kind: "assets", show: true },
    { kind: "voice", show: !!(brand.brand_voice || brand.audience_gender || brand.audience_age || brand.audience_type) },
    { kind: "colors", show: (brand.colors ?? []).length > 0 },
    { kind: "type", show: (brand.fonts ?? []).length > 0 },
    {
      kind: "direction",
      show: !!(brand.coloring_tone || (brand.music_mood && brand.music_mood.length > 0) || brand.music_notes),
    },
  ];
  const sections = allSections.filter((s) => s.show);

  const indexFor = (kind: SectionKind) => {
    const i = sections.findIndex((s) => s.kind === kind);
    return String(i + 1).padStart(2, "0");
  };

  return (
    <Document title={`${brand.business_name} — Brand Guidelines`}>
      <HeroCover brand={brand} />
      {sections.find((s) => s.kind === "brand") && (
        <BrandPage brand={brand} sectionIndex={indexFor("brand")} embeddableLogo={embeddableLogo} />
      )}
      {sections.find((s) => s.kind === "assets") && (
        <AssetsPage brand={brand} logos={logos} sectionIndex={indexFor("assets")} zipUrl={zipUrl} />
      )}
      {sections.find((s) => s.kind === "voice") && (
        <VoicePage brand={brand} sectionIndex={indexFor("voice")} />
      )}
      {sections.find((s) => s.kind === "colors") && (
        <ColorsPage brand={brand} sectionIndex={indexFor("colors")} />
      )}
      {sections.find((s) => s.kind === "type") && (
        <TypographyPage brand={brand} sectionIndex={indexFor("type")} />
      )}
      {sections.find((s) => s.kind === "direction") && (
        <DirectionPage brand={brand} sectionIndex={indexFor("direction")} />
      )}
    </Document>
  );
}
