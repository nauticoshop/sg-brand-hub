// Closed Won notification dispatcher.
//
// Full chain:
//
//   1. Deal hits Closed Won → webhook fires:
//      - NEW client       → DM BD with pre-stamped intake link
//      - RETURNING client → DM AM (or AM Head fallback) with project-request
//                           deeplink + deal context
//      Both: CFO billing card + credit DM
//
//   2. Client submits intake at /intake?deal_id=… → /api/intake calls
//      notifyAmHeadAssignmentNeeded() → DM Justin to assign an AM.
//
//   3. Justin assigns AM in brand editor → updateBrand() server action
//      detects null→set transition on a deal-sourced brand and calls
//      notifyAmAssigned() → DM the newly assigned AM with deal context +
//      project-request deeplink.
//
// Webhook channels (each falls back to GOOGLE_CHAT_INTAKE_WEBHOOK_URL):
//   GOOGLE_CHAT_BD_WEBHOOK_URL       — BDs / Sales handoff space
//   GOOGLE_CHAT_AM_HEAD_WEBHOOK_URL  — Justin Tarr's space
//   GOOGLE_CHAT_AMS_WEBHOOK_URL      — Account Managers space
//   GOOGLE_CHAT_CFO_WEBHOOK_URL      — CFO / Sales handoff space
//
// Card design rules (kept tight on purpose):
//   • Title carries the punch line (scenario + amount when applicable).
//   • Empty fields don't render at all — no "—" placeholders.
//   • Group related facts into one line ("$4,500 · Recurring") not two.
//   • ≤4 fact widgets per card. Body sentence only when there's a real
//     "next step" the recipient needs to read.
//
// Each post awaits its fetch so Vercel doesn't kill the function before the
// card lands. Per-post errors are logged but never thrown.

import type { DealSnapshot } from "@/lib/monday/deals";
import {
  newClientBusinessName,
  suggestFirstBillingDate,
  type BrandLite,
  type ClosedWonResult,
} from "@/lib/brands/create-from-deal";
import { findUserByName, mention, postUpdate } from "@/lib/monday/client";

const AM_HEAD_NAME = "Justin Tarr";

/**
 * Kill switch for the entire Closed Won handoff system (Chat cards + Monday
 * @mentions). Set HANDOFF_NOTIFICATIONS_DISABLED=true in Vercel to silence
 * everything without ripping out code. The webhook still classifies the deal
 * and writes the dispatch row — we just skip all outbound notifications.
 *
 * Use this while iterating on the design. To re-enable, unset the env var
 * (or set it to anything other than "true") and redeploy.
 */
function notificationsDisabled(): boolean {
  return process.env.HANDOFF_NOTIFICATIONS_DISABLED === "true";
}

/**
 * Look up the personal Google Chat DM webhook for a given AM. We keep the
 * map in a single env var (GOOGLE_CHAT_AM_DM_WEBHOOKS) as JSON so new AMs
 * are a Vercel env edit, not a code change:
 *
 *   GOOGLE_CHAT_AM_DM_WEBHOOKS={"Billy Pavlock":"https://...","Phallon Ray":"..."}
 *
 * Returns null when no mapping exists for that AM. Callers should then
 * decide whether to fall back to the group webhook, skip the Chat ping
 * entirely, or warn.
 *
 * Name matching is case-insensitive + trim-tolerant so a "Billy Pavlock "
 * with trailing whitespace still matches.
 */
function getAmDmWebhook(amName: string | null | undefined): string | null {
  if (!amName) return null;
  const raw = process.env.GOOGLE_CHAT_AM_DM_WEBHOOKS;
  if (!raw) return null;
  try {
    const map = JSON.parse(raw) as Record<string, string>;
    const needle = amName.trim().toLowerCase();
    for (const [key, value] of Object.entries(map)) {
      if (key.trim().toLowerCase() === needle && typeof value === "string") {
        return value;
      }
    }
  } catch (e) {
    console.error(
      `[handoff] GOOGLE_CHAT_AM_DM_WEBHOOKS is not valid JSON: ${(e as Error).message}`
    );
  }
  return null;
}

/**
 * Post a Monday update on the deal item that @mentions the assigned AM.
 * Lets the AM see the handoff in their Monday inbox in addition to (or
 * instead of) the Google Chat DM. Best-effort — logs and swallows on any
 * failure since the brand assignment already succeeded by the time we get
 * here.
 */
async function tagAmOnMondayDeal(args: {
  dealId: string;
  amName: string;
  bodyHtml: string;
}): Promise<void> {
  try {
    const user = await findUserByName(args.amName);
    if (!user) {
      console.warn(`[handoff/monday-tag] no Monday user matched "${args.amName}" — skipping update`);
      return;
    }
    const body = `${mention(user.id, user.name)} ${args.bodyHtml}`;
    await postUpdate({ itemId: args.dealId, body });
    console.log(`[handoff/monday-tag] tagged ${user.name} on deal ${args.dealId} ✓`);
  } catch (e) {
    console.error(`[handoff/monday-tag] failed: ${(e as Error).message}`);
  }
}

export type DispatchInput = {
  result: ClosedWonResult;
  appUrl: string;
  briefToolUrl: string;
};

export async function dispatchClosedWonNotifications(input: DispatchInput): Promise<void> {
  if (input.result.kind === "same_deal") return;
  if (notificationsDisabled()) {
    console.log(`[handoff] HANDOFF_NOTIFICATIONS_DISABLED=true — skipping all cards for ${input.result.deal.itemId}`);
    return;
  }

  const tasks: Array<Promise<void>> = [];

  if (input.result.kind === "new_client") {
    tasks.push(sendBdIntakeDm(input as DispatchInput & { result: Extract<ClosedWonResult, { kind: "new_client" }> }));
    tasks.push(sendCfoCard({ ...input, businessName: newClientBusinessName(input.result.deal), newClient: true }));
  } else {
    tasks.push(sendAmProjectRequestDm(input as DispatchInput & { result: Extract<ClosedWonResult, { kind: "returning_client" }> }));
    tasks.push(sendCfoCard({ ...input, businessName: input.result.brand.business_name, newClient: false }));
  }

  tasks.push(sendCreditDm(input));

  await Promise.allSettled(tasks);
}

// ────────────────────────────────────────────────────────────────────────────
// Format helpers
// ────────────────────────────────────────────────────────────────────────────

/** "$4,500" / null when value is missing. */
function money(value: number | null | undefined): string | null {
  if (value == null) return null;
  return `$${value.toLocaleString()}`;
}

/** True iff deal type contains "recurring". */
function isRecurring(deal: DealSnapshot): boolean {
  return /recurring/i.test(deal.dealType ?? "");
}

/** "$4,500/mo" for retainers, "$4,500" otherwise, null if no value. */
function amountWithCadence(deal: DealSnapshot): string | null {
  const m = money(deal.dealValue);
  if (!m) return null;
  return isRecurring(deal) ? `${m}/mo` : m;
}

/** "Recurring" or "One Time" or "—". Used only when title doesn't carry it. */
function dealTypeShort(deal: DealSnapshot): string | null {
  if (!deal.dealType) return null;
  return isRecurring(deal) ? "Recurring" : deal.dealType;
}

/** "$4,500 · Recurring" — one-line summary. Null if no value AND no type. */
function dealOneLiner(deal: DealSnapshot): string | null {
  const amt = amountWithCadence(deal);
  const type = dealTypeShort(deal);
  if (!amt && !type) return null;
  if (!amt) return type;
  if (!type) return amt;
  return `${amt} · ${type}`;
}

/** "Jane Doe · jane@brand.com" — drops missing parts; null if nothing. */
function contactOneLine(c: DealSnapshot["primaryContact"]): string | null {
  if (!c) return null;
  const parts = [c.name, c.email, c.phone].filter((s): s is string => !!s && s.trim().length > 0);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function intakeLinkForDeal(appUrl: string, deal: DealSnapshot): string {
  const params = new URLSearchParams({
    deal_id: deal.itemId,
    business_name: deal.primaryContact?.company ?? deal.itemName.split("|")[0]?.trim() ?? deal.itemName,
  });
  if (deal.primaryContact?.email) params.set("email", deal.primaryContact.email);
  if (deal.primaryContact?.name) params.set("name", deal.primaryContact.name);
  return `${appUrl.replace(/\/$/, "")}/intake?${params.toString()}`;
}

function projectRequestLink(briefToolUrl: string, businessName: string): string {
  // Brief Tool's briefs dashboard filtered to this client. AM clicks "New
  // project request" from there to open the modal — the modal picks up the
  // brand context from the filter.
  // TODO(brief-tool): query-param prefill on the modal itself (services,
  // value, deal_type) so this can fully pre-fill the form.
  const params = new URLSearchParams({ client: businessName });
  return `${briefToolUrl.replace(/\/$/, "")}/?${params.toString()}`;
}

function brandUrlFor(appUrl: string, brandId: string): string {
  return `${appUrl.replace(/\/$/, "")}/brand/${brandId}`;
}

/**
 * A single fact widget. Returns null when value is empty so the caller can
 * .filter(Boolean) and skip rendering an empty row. This is how we avoid
 * the "—" placeholder spam in earlier card revisions.
 */
function field(label: string, value: string | null | undefined): Record<string, unknown> | null {
  if (!value || !value.trim()) return null;
  return { decoratedText: { topLabel: label, text: value } };
}

/** Free-text body line — null on empty. */
function body(text: string | null | undefined): Record<string, unknown> | null {
  if (!text || !text.trim()) return null;
  return { decoratedText: { text } };
}

function buttonList(buttons: Array<{ text: string; url: string }>): Record<string, unknown> {
  return {
    buttonList: {
      buttons: buttons.map((b) => ({ text: b.text, onClick: { openLink: { url: b.url } } })),
    },
  };
}

async function postCard(webhook: string | undefined, card: unknown, label: string): Promise<void> {
  if (!webhook) {
    console.log(`[handoff/${label}] no webhook configured — skipping`);
    return;
  }
  try {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(card),
    });
    if (!res.ok) {
      console.error(`[handoff/${label}] webhook ${res.status}: ${(await res.text().catch(() => "")).slice(0, 400)}`);
    } else {
      console.log(`[handoff/${label}] posted ✓`);
    }
  } catch (e) {
    console.error(`[handoff/${label}] failed: ${(e as Error).message}`);
  }
}

/** Wrap widgets + cardId into the standard cardsV2 envelope. */
function buildCard(args: {
  cardId: string;
  title: string;
  subtitle?: string | null;
  widgets: Array<Record<string, unknown> | null>;
}): unknown {
  return {
    cardsV2: [
      {
        cardId: args.cardId,
        card: {
          header: {
            title: args.title,
            ...(args.subtitle ? { subtitle: args.subtitle } : {}),
          },
          sections: [{ widgets: args.widgets.filter(Boolean) }],
        },
      },
    ],
  };
}

// ────────────────────────────────────────────────────────────────────────────
// New client — DM the BD with the pre-stamped intake link
// ────────────────────────────────────────────────────────────────────────────

async function sendBdIntakeDm(args: {
  result: Extract<ClosedWonResult, { kind: "new_client" }>;
  appUrl: string;
}): Promise<void> {
  const webhook =
    process.env.GOOGLE_CHAT_BD_WEBHOOK_URL ||
    process.env.GOOGLE_CHAT_AMS_WEBHOOK_URL ||
    process.env.GOOGLE_CHAT_INTAKE_WEBHOOK_URL;

  const deal = args.result.deal;
  const intakeUrl = intakeLinkForDeal(args.appUrl, deal);
  const businessName = newClientBusinessName(deal);
  const contactName = deal.primaryContact?.name ?? "your client";

  const card = buildCard({
    cardId: `bd-intake-${deal.itemId}`,
    title: `🎉 New client — send intake link`,
    subtitle: deal.bd ? `${businessName} · ${deal.bd}` : businessName,
    widgets: [
      body(`Send this to ${contactName} to start their brand profile.`),
      field("Deal", dealOneLiner(deal)),
      field("Services", deal.services.length > 0 ? deal.services.join(", ") : null),
      field("Primary contact", contactOneLine(deal.primaryContact)),
      buttonList([
        { text: "Open intake link →", url: intakeUrl },
        { text: "Open Monday deal", url: deal.url },
      ]),
      field("Link to copy", intakeUrl),
    ],
  });
  await postCard(webhook, card, "BD intake");
}

// ────────────────────────────────────────────────────────────────────────────
// Returning client — DM the AM with deal context + project request deeplink
// ────────────────────────────────────────────────────────────────────────────

async function sendAmProjectRequestDm(args: {
  result: Extract<ClosedWonResult, { kind: "returning_client" }>;
  appUrl: string;
  briefToolUrl: string;
}): Promise<void> {
  const { result, appUrl, briefToolUrl } = args;
  const deal = result.deal;
  const brand = result.brand;
  const am = brand.account_manager?.trim() || null;

  // Routing:
  //   • AM is set and has a DM webhook  → DM the AM only
  //   • AM is set but no DM webhook     → fall back to AMs group (better
  //                                       than dropping the card; we still
  //                                       tag on Monday so they're notified)
  //   • AM is null                      → fall back to AMs group so Justin
  //                                       (in there) sees it and can assign
  let webhook: string | undefined;
  if (am) {
    webhook =
      getAmDmWebhook(am) ??
      process.env.GOOGLE_CHAT_AMS_WEBHOOK_URL ??
      process.env.GOOGLE_CHAT_INTAKE_WEBHOOK_URL;
  } else {
    webhook =
      process.env.GOOGLE_CHAT_AMS_WEBHOOK_URL ?? process.env.GOOGLE_CHAT_INTAKE_WEBHOOK_URL;
  }

  const subtitle = am
    ? `${brand.business_name} · AM: ${am}`
    : `${brand.business_name} · No AM — ${AM_HEAD_NAME} to assign`;

  const bodyText = am
    ? `${am} — open the project request to put this on the schedule.`
    : `${AM_HEAD_NAME} — assign an AM, they'll be DM'd to take it from there.`;

  const card = buildCard({
    cardId: `am-project-request-${deal.itemId}`,
    title: `📦 Returning client — new deal`,
    subtitle,
    widgets: [
      body(bodyText),
      field("Deal", dealOneLiner(deal)),
      field("Services", deal.services.length > 0 ? deal.services.join(", ") : null),
      field("Primary contact", contactOneLine(deal.primaryContact)),
      field("BD", deal.bd),
      buttonList([
        { text: "Open project request →", url: projectRequestLink(briefToolUrl, brand.business_name) },
        { text: "Open brand", url: brandUrlFor(appUrl, brand.id) },
        { text: "Open Monday deal", url: deal.url },
      ]),
    ],
  });

  // Fire Chat card + Monday @mention in parallel — both best-effort.
  await Promise.allSettled([
    postCard(webhook, card, "AM project request"),
    am
      ? tagAmOnMondayDeal({
          dealId: deal.itemId,
          amName: am,
          bodyHtml: `You're the AM on this returning client — open the project request in Brief Tool to put it on the schedule. <a href="${projectRequestLink(briefToolUrl, brand.business_name)}">Open project request</a>`,
        })
      : Promise.resolve(),
  ]);
}

// ────────────────────────────────────────────────────────────────────────────
// CFO card — billing-focused, both new + returning
// ────────────────────────────────────────────────────────────────────────────

async function sendCfoCard(args: {
  result: ClosedWonResult;
  appUrl: string;
  businessName: string;
  newClient: boolean;
}): Promise<void> {
  if (args.result.kind === "same_deal") return;
  const webhook =
    process.env.GOOGLE_CHAT_CFO_WEBHOOK_URL || process.env.GOOGLE_CHAT_INTAKE_WEBHOOK_URL;
  const deal = args.result.deal;
  const recurring = isRecurring(deal);
  const amount = amountWithCadence(deal); // "$4,500/mo" / "$9,000" / null

  // Title carries scenario + amount.
  let title: string;
  if (args.newClient) {
    if (recurring) {
      title = amount ? `💰 New retainer — ${amount}` : `💰 New retainer`;
    } else {
      title = amount ? `💰 New invoice — ${amount}` : `💰 New invoice`;
    }
  } else {
    if (recurring) {
      title = amount ? `💰 Retainer add-on — ${amount}` : `💰 Retainer add-on`;
    } else {
      title = amount ? `💰 New invoice — ${amount}` : `💰 New invoice`;
    }
  }

  // Billing contact falls back to primary contact if billing isn't set.
  const billing =
    contactOneLine(deal.billingContact) ?? contactOneLine(deal.primaryContact);

  // First billing date only matters for retainers with a close date.
  const firstBilling =
    recurring && deal.closeDate ? suggestFirstBillingDate(deal.closeDate) : null;

  const buttons: Array<{ text: string; url: string }> = [
    { text: "Open Monday deal", url: deal.url },
  ];
  if (args.result.kind === "returning_client") {
    buttons.push({ text: "Open brand", url: brandUrlFor(args.appUrl, args.result.brand.id) });
  }

  const card = buildCard({
    cardId: `cfo-${deal.itemId}`,
    title,
    subtitle: args.businessName,
    widgets: [
      firstBilling ? body(`First billing: ${firstBilling}`) : null,
      field("Services", deal.services.length > 0 ? deal.services.join(", ") : null),
      field("Billing contact", billing),
      args.newClient
        ? body(`Brand record will be created when the client submits the intake form.`)
        : null,
      buttonList(buttons),
    ],
  });
  await postCard(webhook, card, "CFO");
}

// ────────────────────────────────────────────────────────────────────────────
// Credit DM (skipped if no identifiers on the deal)
// ────────────────────────────────────────────────────────────────────────────

async function sendCreditDm(args: { result: ClosedWonResult }): Promise<void> {
  if (args.result.kind === "same_deal") return;
  const deal = args.result.deal;
  if (!deal.dealIdentifiers || deal.dealIdentifiers.length === 0) return;

  const webhook =
    process.env.GOOGLE_CHAT_AMS_WEBHOOK_URL || process.env.GOOGLE_CHAT_INTAKE_WEBHOOK_URL;

  const businessName =
    args.result.kind === "returning_client"
      ? args.result.brand.business_name
      : newClientBusinessName(deal);

  const amount = money(deal.dealValue);
  const subtitle = amount ? `${businessName} · ${amount}` : businessName;

  const card = buildCard({
    cardId: `credit-${deal.itemId}`,
    title: `🎉 Credit — deal closed`,
    subtitle,
    widgets: [
      field("Credit to", deal.dealIdentifiers.join(", ")),
      field("BD", deal.bd),
      buttonList([{ text: "Open Monday deal", url: deal.url }]),
    ],
  });
  await postCard(webhook, card, "Credit");
}

// ────────────────────────────────────────────────────────────────────────────
// Step 2 — Client submitted intake → DM Justin to assign an AM
// ────────────────────────────────────────────────────────────────────────────

export type AmHeadAssignmentInput = {
  brand: BrandLite;
  deal: DealSnapshot;
  appUrl: string;
};

export async function notifyAmHeadAssignmentNeeded(
  input: AmHeadAssignmentInput
): Promise<void> {
  if (notificationsDisabled()) {
    console.log(`[handoff] HANDOFF_NOTIFICATIONS_DISABLED=true — skipping AM Head card for ${input.brand.id}`);
    return;
  }
  const webhook =
    process.env.GOOGLE_CHAT_AM_HEAD_WEBHOOK_URL ||
    process.env.GOOGLE_CHAT_INTAKE_WEBHOOK_URL;

  const { brand, deal, appUrl } = input;
  const flavor = isRecurring(deal) ? "retainer" : "one-off";
  const amount = amountWithCadence(deal);
  const subtitle = amount ? `${brand.business_name} · ${amount}` : brand.business_name;

  const card = buildCard({
    cardId: `am-head-assign-${deal.itemId}`,
    title: `🎯 Assign AM — new ${flavor} client`,
    subtitle,
    widgets: [
      body(
        `Client just submitted intake. ${AM_HEAD_NAME}, assign an AM in the brand editor — they'll be DM'd to take over.`
      ),
      field("Services", deal.services.length > 0 ? deal.services.join(", ") : null),
      field("Primary contact", contactOneLine(deal.primaryContact)),
      field("BD", deal.bd),
      buttonList([
        { text: "Open brand → assign AM", url: brandUrlFor(appUrl, brand.id) },
        { text: "Open Monday deal", url: deal.url },
      ]),
    ],
  });
  await postCard(webhook, card, "AM Head assign");
}

// ────────────────────────────────────────────────────────────────────────────
// Step 3 — Justin assigned an AM → DM that AM with deal context + project link
// ────────────────────────────────────────────────────────────────────────────

export type AmAssignedInput = {
  brand: BrandLite;
  deal: DealSnapshot;
  appUrl: string;
  briefToolUrl: string;
};

export async function notifyAmAssigned(input: AmAssignedInput): Promise<void> {
  if (notificationsDisabled()) {
    console.log(`[handoff] HANDOFF_NOTIFICATIONS_DISABLED=true — skipping AM-assigned card for ${input.brand.id}`);
    return;
  }
  const { brand, deal, appUrl, briefToolUrl } = input;
  const am = brand.account_manager?.trim();
  if (!am) return;

  // Prefer AM's personal DM webhook; fall back to AMs group so the card
  // doesn't disappear into the void if the AM hasn't set up their DM yet.
  const webhook =
    getAmDmWebhook(am) ??
    process.env.GOOGLE_CHAT_AMS_WEBHOOK_URL ??
    process.env.GOOGLE_CHAT_INTAKE_WEBHOOK_URL;

  const card = buildCard({
    cardId: `am-assigned-${deal.itemId}-${brand.id}`,
    title: `👋 You're up — ${brand.business_name}`,
    subtitle: `AM: ${am}`,
    widgets: [
      body(`${am} — open the project request to put this on the schedule.`),
      field("Deal", dealOneLiner(deal)),
      field("Services", deal.services.length > 0 ? deal.services.join(", ") : null),
      field("Primary contact", contactOneLine(deal.primaryContact)),
      field("BD", deal.bd),
      buttonList([
        { text: "Open project request →", url: projectRequestLink(briefToolUrl, brand.business_name) },
        { text: "Open brand", url: brandUrlFor(appUrl, brand.id) },
        { text: "Open Monday deal", url: deal.url },
      ]),
    ],
  });

  // Fire Chat card + Monday @mention in parallel.
  await Promise.allSettled([
    postCard(webhook, card, "AM assigned"),
    tagAmOnMondayDeal({
      dealId: deal.itemId,
      amName: am,
      bodyHtml: `You're assigned as the AM. Open the project request in Brief Tool to put this on the schedule. <a href="${projectRequestLink(briefToolUrl, brand.business_name)}">Open project request</a>`,
    }),
  ]);
}
