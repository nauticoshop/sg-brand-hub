# SG client lifecycle — Brand Hub + Brief Tool

This is the end-to-end flow a client travels through, from first lead to
shipped deliverable. Brand Hub owns brand identity (one-time setup per
client). Brief Tool owns per-project briefs (many per client).

## At a glance

```mermaid
flowchart TB
    classDef phase fill:#f5f5f4,stroke:#a8a29e,stroke-width:1px,color:#1c1917
    classDef state fill:#fef3c7,stroke:#f59e0b,color:#7c2d12
    classDef approved fill:#d1fae5,stroke:#10b981,color:#064e3b
    classDef notify fill:#dbeafe,stroke:#3b82f6,color:#1e3a8a
    classDef brandhub fill:#ede9fe,stroke:#7c3aed,color:#5b21b6
    classDef brieftool fill:#fef9c3,stroke:#ca8a04,color:#713f12
    classDef external fill:#e7e5e4,stroke:#78716c,color:#1c1917

    Lead([🌟 New client lead]):::phase

    subgraph Onboard[" 1 · ONBOARDING "]
        Source{How did they<br/>come in?}
        Public[Public intake form<br/>at /intake]
        Manual[AM clicks 'New brand'<br/>in dashboard]
    end

    Lead --> Source
    Source -->|Self-serve URL| Public
    Source -->|Direct contact| Manual

    subgraph Hub[" 2 · BRAND HUB · capture + approve "]
        Submitted[(submitted)]:::state
        Draft[(draft)]:::state
        ChatNote[🔔 Google Chat:<br/>'New brand intake'<br/>with Review button]:::notify
        Polish[AM polishes record:<br/>· AM assigned<br/>· logos uploaded<br/>· primary color set<br/>· overview written<br/>· voice + audience]:::brandhub
        Gate{Pre-approve<br/>checklist passes?}
        Approve[[Approve & Sync]]:::brandhub
        PDF[📄 Editorial PDF<br/>generated + saved]:::brandhub
        DB[📁 Dropbox folder tree:<br/>/NN x SG/Brand/<br/>2026 · Assets/Logo<br/>Assets/Video Assets]:::external
        MI[📋 Monday Intake<br/>board row updated]:::external
        MA[🎯 Monday All Projects<br/>parent in 'Project Intake'<br/>group · @Rendi tagged]:::external
        SHARE[🌐 Public share page<br/>at /share/&lt;token&gt;]:::brandhub
        Approved[(approved)]:::approved
    end

    Public --> Submitted
    Manual --> Draft
    Submitted --> ChatNote
    ChatNote --> Polish
    Draft --> Polish
    Polish --> Gate
    Gate -->|missing items| Polish
    Gate -->|all required ✓| Approve
    Approve --> PDF
    Approve --> DB
    Approve --> MI
    Approve --> MA
    Approve --> SHARE
    PDF & DB & MI & MA & SHARE --> Approved

    subgraph Brief[" 3 · BRIEF TOOL · per-project briefs "]
        NewProject{Client orders<br/>a project?}
        OpenBrief[Open Brief Tool<br/>'New brief'<br/>pick client from list]:::brieftool
        Pull["⬅️ Pull brand data:<br/>colors · fonts · voice<br/>audience · AM contact<br/>via brand_directory view"]:::brieftool
        Write[AM writes brief specifics:<br/>· deliverables<br/>· deadlines<br/>· copy direction<br/>· references]:::brieftool
        BriefShare[Brief share URL<br/>sent to creative team]:::brieftool
        Work[🎬 Editor / designer<br/>delivers work]:::external
        Files[Files land in<br/>Dropbox Video Assets/<br/>or Deliverables/]:::external
    end

    Approved --> NewProject
    NewProject -->|new project| OpenBrief
    OpenBrief --> Pull
    Pull --> Write
    Write --> BriefShare
    BriefShare --> Work
    Work --> Files

    NewProject -.->|future projects<br/>reuse same brand| OpenBrief

    %% Two-way sync indicator
    Approved -.->|"AM contact, etc.<br/>auto-syncs via<br/>DB trigger"| OpenBrief

    class Onboard,Hub,Brief phase
```

## How to read it

Three phases, color-coded by ownership:

- 🟪 **Brand Hub steps** (purple) — capture, polish, approve. One-time per client.
- 🟨 **Brief Tool steps** (yellow) — per-project briefs that pull brand data. Many per client.
- ⬜️ **External integrations** (gray) — Dropbox, Monday, share page.

## Key handoffs

| From → To | What flows | How |
|---|---|---|
| Public form → Brand Hub | Initial brand info | `POST /api/intake` creates brand row at `status='submitted'` |
| Brand Hub → Team | "New brand needs review" | Google Chat card on submission |
| Brand Hub → Dropbox | Folder tree | Dropbox SDK on approve |
| Brand Hub → Monday | Brand info + parent item | Monday GraphQL API on approve |
| Brand Hub → Brief Tool | Brand identity for briefs | `public.brand_directory` view (read-only contract) |
| Brand Hub ↔ Brief Tool | Contact info / AM | Two-way trigger syncs canonical ↔ duplicate columns |
| Brief Tool → Creative team | Brief specifics | Brief share URL |
| Creative team → Dropbox | Final deliverables | Manual upload to Brand Hub-created folders |

## Why this shape

- **Brand identity is durable** (a brand exists for years across many projects), so it lives in Brand Hub with permanent storage and a stable share URL.
- **Briefs are ephemeral** (one per project, dozens per year per client), so they live in Brief Tool with the brand identity pulled in fresh each time — no copy-paste of colors/fonts/voice between systems.
- **Single source of truth** — when an AM updates the brand's voice description in Brand Hub, the next brief created automatically uses the new voice. No "which version of the brand is right?" confusion.

## Two-way sync (Brand Hub ↔ Brief Tool)

Both apps share one Supabase project. Brief Tool currently reads + writes its
own column names (`am`, `poc_name`, `poc_email`, `poc_num`); Brand Hub uses
canonical names (`account_manager`, `submitter_*`). A DB trigger keeps both
sides in lockstep — editing either app updates the other. Long-term plan is
for Brief Tool to fully migrate onto `brand_directory` and the duplicates to
get dropped, but no rush.
