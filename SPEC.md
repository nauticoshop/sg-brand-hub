# SG Brand Hub — Build Spec

**Project:** Internal brand intake + management tool for Surroundings Group / Nautical Network
**Owner:** Billy Pavlock
**Audience:** SG internal team (account managers, creative team, video editors)
**Client-facing surface:** Public brand intake form only

---

## 1. Purpose

Replace the current Monday-form-to-Canva manual brand guideline process with a polished, semi-automated internal tool. Clients fill out a clean intake form. The SG team reviews, edits, AI-enriches, and approves brand records inside an internal dashboard. On approval, the system generates a Canva-ready PDF brand guideline, creates the client's Dropbox folder structure, writes the brand record to Monday.com, and creates the video asset build tasks on the All Projects board assigned to Rendi.

This is **not** client-facing software beyond the public intake form. The dashboard, brand record management, and PDF generation all live on the internal side.

---

## 2. Tech Stack

Mirror the patterns from SG Creative Brief Tool and SocialDesk for consistency.

- **Framework:** Next.js 14+ (App Router)
- **Hosting:** Vercel
- **Database:** Supabase (Postgres)
- **Auth:** Supabase Auth (Google SSO, restricted to @surroundingsgroup.com and @nauticalnetwork.com domains)
- **File storage:** Supabase Storage for logos/brand assets (with Dropbox sync on approval)
- **AI:** Anthropic Claude API (Sonnet 4.6) for enrichment
- **PDF generation:** React-PDF (`@react-pdf/renderer`) — server-side, branded layout
- **Styling:** Tailwind CSS + shadcn/ui components, matching Creative Brief Tool visual language
- **External APIs:**
  - Monday.com GraphQL API (write back brand records, create All Projects tasks)
  - Dropbox API (folder structure creation, file uploads)
  - Anthropic Claude API (enrichment)
  - Optional: Google Chat webhook (Rendi/team notifications)

---

## 3. Visual Identity

Match SG Creative Brief Tool exactly:
- Same color palette (SG brand colors)
- Same typography
- Same component library (shadcn/ui with SG customizations)
- Same navigation pattern
- Same login screen pattern
- Same form input style
- Same toast/notification style

Public intake form: lean toward SG.com aesthetics — premium, minimal, confident. Mobile-responsive priority since clients may fill out on phone.

---

## 4. Data Model (Supabase / Postgres)

### `brands` table
Primary record. One row per client/brand.

```
id                      uuid PRIMARY KEY
created_at              timestamp
updated_at              timestamp
created_by              uuid (FK to auth.users, nullable for public submissions)

# Status
status                  enum: 'draft' | 'submitted' | 'in_review' | 'approved' | 'archived'
approved_at             timestamp (nullable)
approved_by             uuid (nullable, FK to auth.users)

# Identity
business_name           text NOT NULL
website                 text
vertical                text (enum: marine, private_aviation, automotive, luxury_real_estate, home_services, resort_travel, multifamily_residential, other)
client_monday_board_url text (nullable)
dropbox_folder_url      text (nullable)
canva_brand_kit_url     text (nullable)
brand_guideline_pdf_url text (nullable, set on approval)

# Social
instagram               text
facebook                text
youtube                 text
tiktok                  text
linkedin                text

# Brand voice & overview
overview_client_raw     text  (what client submitted)
overview_polished       text  (AI-enriched or AM-edited, used in PDF)
look_and_feel           text
brand_voice             text
what_to_avoid           text
inspiration_references  text

# Audience
audience_gender         text
audience_age            text
audience_type           text

# Creative direction
coloring_tone           text
music_mood              text[] (array)
music_genre             text[] (array)
music_notes             text

# Colors (structured)
colors                  jsonb  (array of {name, hex, role: 'primary'|'secondary'})

# Fonts (structured)
fonts                   jsonb  (array of {name, role: 'primary'|'secondary', use_case})

# Notes (internal only)
internal_notes          text (visible only on dashboard, never in PDF)

# AI enrichment metadata
ai_enriched_at          timestamp (nullable)
ai_enrichment_version   text (nullable, tracks prompt version used)
```

### `brand_logos` table
One row per uploaded logo file.

```
id                uuid PRIMARY KEY
brand_id          uuid FK → brands.id
created_at        timestamp
file_name         text
file_path         text (supabase storage path)
public_url        text
dropbox_path      text (nullable, set after sync)
logo_type         text (e.g. 'full', 'icon', 'wordmark')
colorway          text (e.g. 'cream', 'clay', 'moss', 'evergreen')
display_order     integer
```

### `brand_activity_log` table
Audit trail for changes.

```
id          uuid PRIMARY KEY
brand_id    uuid FK
created_at  timestamp
user_id     uuid (nullable for system events)
event_type  text  (e.g. 'submitted', 'enriched', 'edited', 'approved', 'synced_to_monday')
metadata    jsonb
```

---

## 5. Page-by-Page UX Flow

### PUBLIC SIDE

#### `/intake` — Public brand intake form
- Single-page form, no login required
- URL can be shared with clients: `brandhub.surroundingsgroup.com/intake`
- Optional: pre-filled URL params for known clients: `/intake?client=wylden&am=arial`
- Sections (collapsible accordion or vertical scroll):
  1. **The Basics** — business name (required), website
  2. **About Your Brand** — overview, vertical (dropdown), what makes you different
  3. **Look & Feel** — visual personality description, inspiration references, what to avoid
  4. **Audio Vibe** — music mood + genre prefs + references
  5. **Colors** — primary color picker(s) + hex input, secondary, additional
  6. **Fonts** — primary + secondary (text input with autocomplete from Google Fonts API)
  7. **Logos** — drag-drop upload (multiple files, accept PNG/SVG/EPS/AI)
  8. **Social** — IG/FB/YT/TikTok/LinkedIn handles (all optional)
- Smart features:
  - When client enters website, async call to `/api/enrich-preview` returns suggested vertical and short overview as placeholder. Client can keep or edit.
  - Color picker with hex input AND visual swatch preview
  - Live font preview when typing font names (Google Fonts API)
  - Logo upload: shows thumbnails, allows reorder via drag
- On submit: writes to `brands` with status `submitted`, optionally redirects to `/thanks` page

#### `/thanks` — Post-submission confirmation
- Simple confirmation
- "Your SG team is reviewing your brand and will be in touch within 24 hours"
- Optional: link to surroundingsgroup.com or calendar booking

---

### INTERNAL SIDE (authenticated)

#### `/login`
- Google SSO button (Supabase Auth)
- Redirects to `/dashboard` on success
- Restricted to approved email domains

#### `/dashboard` — Brand inbox / queue
- Header: "SG Brand Hub" + user avatar
- Tabs or filters: All / Submitted / In Review / Approved / Archived
- Table view: business name, vertical, submitted date, assigned AM, status, last updated
- Search bar
- "Create new brand" button (for cases where AM creates manually instead of waiting for form)
- Each row clicks into `/brand/[id]`

#### `/brand/[id]` — Brand detail / editor
- Header: business name, status pill, "Approve" button (if not yet approved)
- Tabs:
  - **Overview** — business name, website, vertical, social, polished overview (with AI re-enrich button)
  - **Brand Voice & Audience** — voice, look & feel, what to avoid, target audience
  - **Visual Identity** — colors (visual swatches, hex codes, add/remove), fonts (with previews)
  - **Logos** — uploaded files with thumbnails, drag-reorder, type/colorway tags
  - **Creative Direction** — coloring tone, music mood/genre, notes
  - **Internal Notes** — free text, never appears in PDF
  - **Activity** — audit log
- Every field is editable inline
- "Re-run AI enrichment" button at top: re-runs Claude API call with current data, suggests updates to polished overview / vertical / audience inference
- "Generate preview PDF" button: renders current state as PDF, opens in new tab (doesn't save anything, just preview)
- "Approve & Sync" button: when clicked, runs:
  1. Final PDF generation, saved to Supabase Storage + public URL written to record
  2. Dropbox folder structure created
  3. Logos synced to Dropbox `/01_Brand Assets/Logos/`
  4. Monday row created/updated on Client Onboarding Asset Intake board
  5. All Projects board parent item + 4 subitems created, assigned to Rendi
  6. Monday update posted tagging Rendi with all links
  7. Status → `approved`, `approved_at`/`approved_by` set
  8. Activity log entries written for each step
  9. Toast confirms each step as it completes
- Post-approval, record stays fully editable. Edits trigger optional re-sync (button: "Re-sync to Monday").

#### `/brand/[id]/preview` — Preview PDF
- Iframe of the generated PDF
- "Download" button
- "Regenerate" button

#### `/settings` — Team settings (admin only)
- Manage team members
- View API integration status (Monday connected, Dropbox connected, etc.)
- Default assignees (e.g. "default video editor: Rendi")
- Vertical taxonomy management
- PDF template settings (logo, footer text)

---

## 6. API Routes

```
POST /api/intake
  Public, no auth. Accepts form submission, creates brands row with status='submitted'.
  Triggers async AI enrichment job.

POST /api/intake/enrich-preview
  Public. Takes website URL, returns suggested vertical + overview draft.
  Lightweight Claude call.

POST /api/brands/[id]/enrich
  Authenticated. Full AI enrichment run on a brand record.
  Returns updated fields, doesn't write — frontend confirms and writes.

POST /api/brands/[id]/approve
  Authenticated. Runs the full approval pipeline.
  Returns step-by-step status (or websocket events for live progress).

GET  /api/brands/[id]/pdf
  Authenticated. Generates and returns PDF for current state.

POST /api/brands/[id]/sync-monday
  Authenticated. Re-syncs to Monday after edits.

POST /api/webhooks/monday
  Webhook from Monday — handles updates to brand records initiated from Monday side.
```

---

## 7. AI Enrichment Logic

Single Claude API call (Sonnet 4.6), structured JSON output.

**Inputs:** business name, website URL, client raw overview, look & feel, inspiration refs, what to avoid

**Outputs (JSON):**
```json
{
  "vertical": "luxury_real_estate",
  "polished_overview": "...",
  "audience_gender": "...",
  "audience_age": "...",
  "audience_type": "...",
  "coloring_tone_inference": "...",
  "brand_voice_summary": "..."
}
```

**Prompt structure:** system prompt establishes SG's house style for brand guidelines, references the existing Wylden example as a few-shot example of what good output looks like. User prompt provides the client's submitted data.

**Versioning:** prompt version stored alongside enrichment timestamp so we can track quality over time.

---

## 8. PDF Generation

**Library:** `@react-pdf/renderer`

**Layout matches the Wylden test PDF** generated earlier:
1. Hero cover (large name on Deep Forest background, replaceable per brand)
2. Brand overview + vertical + website + social
3. Brand voice + target audience table
4. Brand colors (visual swatches + hex reference table)
5. Brand fonts (samples + reference table)
6. Logo variations (list + Dropbox link, optionally embedded images)
7. Creative guidelines (coloring tone, music mood/genre)
8. References (website, social, Dropbox, inspiration)

**Per-brand customization:** cover page color uses the brand's primary color. Everything else is consistent SG-branded layout.

**Optimized for Canva Brand Kit Builder AI extraction:**
- Section headers in ALL CAPS
- Hex codes spelled out explicitly twice (swatch + reference table)
- Font names called out with samples
- Brand voice as prose, not bullets

**Output:** PDF saved to Supabase Storage, public URL stored on brand record.

---

## 9. Integration Touchpoints

### Monday.com
- **On approval:** create/update row on Client Onboarding Asset Intake board (board ID: 8012504126), Intake group. Populate columns: business name, vertical, brand guideline link (PDF URL), Dropbox folder, colors, fonts, audience, music notes.
- **On approval:** create parent item on All Projects board: `[Brand] — Brand Video Asset Build`. Create 4 subitems assigned to Rendi: Social Vertical Intro/Outro, Horizontal Intro/Outro, Social Lower Thirds, Horizontal Lower Thirds. Each subitem description includes brand guideline PDF link + Dropbox link.
- **Notification:** post update on parent item tagging Rendi.

### Dropbox
- **On approval:** create folder structure under `/Clients/[Business Name]/`:
  ```
  01_Brand Assets/
    Logos/
    Fonts/
    Photos/
    Inspiration/
  02_Video Assets/
    Intros & Outros - Social Vertical/
    Intros & Outros - Horizontal/
    Lower Thirds - Social/
    Lower Thirds - Horizontal/
  03_Active Projects/
  04_Delivered/
  ```
- Upload all logos from Supabase Storage to `/01_Brand Assets/Logos/`
- Upload PDF brand guideline to `/01_Brand Assets/`
- Store the parent folder shareable URL on the brand record

### Anthropic Claude
- Used for enrichment only (Sonnet 4.6 via direct API)
- All enrichment runs are logged with timestamp + prompt version

### Google Chat (optional, Phase 3)
- Webhook posts to team space on approval
- DM Rendi when assigned

---

## 10. Phase Breakdown

### Phase 1 — Core MVP (Week 1)
Goal: replace the current manual workflow with the form + dashboard + PDF.

- Supabase project + schema
- Auth + Google SSO with domain restriction
- Public intake form (`/intake`) with all fields, file upload
- Internal dashboard (`/dashboard`) with brand list + filters
- Brand detail view (`/brand/[id]`) with edit capability
- PDF generation (preview + download)
- Manual approve flow (no Monday/Dropbox integration yet, AM does that manually for now)

### Phase 2 — Automation (Week 2)
Goal: add the automations that replace the rest of the manual work.

- AI enrichment (Claude API) on submission + on-demand
- `/api/intake/enrich-preview` for live form suggestions
- Monday integration: create/update Client Onboarding Asset Intake row on approval
- Monday integration: create All Projects parent + 4 subitems assigned to Rendi
- Dropbox integration: folder structure + logo upload + PDF upload
- Activity log for all events
- Monday update notification on assignment

### Phase 3 — Polish & Growth (Week 3+)
- Re-sync button for post-approval edits
- Public brand share URL ("Here's your brand profile, [client]" — read-only client view)
- Version history for brand records
- Google Chat notifications
- Settings page (default assignees, vertical taxonomy management)
- Bulk import for existing clients
- Search across all brand records

---

## 11. Reference Patterns from SG Creative Brief Tool

Mirror these from the Creative Brief Tool repo:
- Folder structure (App Router conventions)
- `lib/supabase/` server and client helpers
- Auth middleware
- shadcn/ui component setup + customizations
- Tailwind config and brand colors
- Form validation patterns (likely zod + react-hook-form)
- API route error handling
- Toast notification system
- Login screen layout
- Navigation/sidebar pattern

---

## 12. Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
ANTHROPIC_API_KEY
MONDAY_API_TOKEN
MONDAY_BOARD_ID_INTAKE=8012504126
MONDAY_BOARD_ID_ALL_PROJECTS=[to fill in]
MONDAY_DEFAULT_EDITOR_USER_ID=[Rendi's Monday user ID]
DROPBOX_ACCESS_TOKEN
DROPBOX_REFRESH_TOKEN
DROPBOX_APP_KEY
DROPBOX_APP_SECRET
DROPBOX_ROOT_PATH=/Clients
GOOGLE_CHAT_WEBHOOK_URL (optional, Phase 3)
NEXT_PUBLIC_APP_URL
```

---

## 13. Repo Structure (proposed)

```
sg-brand-hub/
├── app/
│   ├── (public)/
│   │   ├── intake/page.tsx
│   │   └── thanks/page.tsx
│   ├── (internal)/
│   │   ├── dashboard/page.tsx
│   │   ├── brand/[id]/page.tsx
│   │   ├── brand/[id]/preview/page.tsx
│   │   └── settings/page.tsx
│   ├── api/
│   │   ├── intake/route.ts
│   │   ├── intake/enrich-preview/route.ts
│   │   ├── brands/[id]/enrich/route.ts
│   │   ├── brands/[id]/approve/route.ts
│   │   ├── brands/[id]/pdf/route.ts
│   │   ├── brands/[id]/sync-monday/route.ts
│   │   └── webhooks/monday/route.ts
│   ├── login/page.tsx
│   └── layout.tsx
├── components/
│   ├── intake/        (public form components)
│   ├── dashboard/     (internal dashboard components)
│   ├── brand/         (brand editor components)
│   ├── pdf/           (React-PDF components)
│   └── ui/            (shadcn primitives)
├── lib/
│   ├── supabase/
│   ├── monday/
│   ├── dropbox/
│   ├── anthropic/
│   └── pdf/
├── types/
│   └── brand.ts
└── supabase/
    └── migrations/
```

---

## 14. Success Criteria

- A client can fill out the public intake form in under 8 minutes on mobile
- The AM can review and approve a brand record in under 5 minutes
- On approval, all downstream artifacts (PDF, Dropbox folders, Monday rows, All Projects tasks) are created within 30 seconds
- The generated PDF can be uploaded directly to Canva Brand Kit Builder and Canva extracts at least colors + fonts correctly
- The tool's visual identity is indistinguishable from SG Creative Brief Tool

---

*End of spec.*
