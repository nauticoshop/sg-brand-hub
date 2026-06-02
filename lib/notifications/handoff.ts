// Closed Won notification dispatcher.
//
// Full chain:
//
//   1. Deal hits Closed Won → webhook fires:
//      - NEW client       → DM BD with pre-stamped intake link
//      - RETURNING client → DM AM (or AM Head fallback) with project-request
//                           deeplink + full deal context
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
// Each post awaits its fetch so Vercel doesn't kill the function before the
// card lands. Per-post errors are logged but never thrown.

import type { DealSnapshot } from "@/lib/monday/deals";
import {
  newClientBusinessName,
  suggestFirstBillingDate,
  type BrandLite,
  type ClosedWonResult,
} from "@/lib/brands/create-from-deal";

const AM_HEAD_NAME = "Justin Tarr"; // fallback for returning clients with no AM assigned

export type DispatchInput = {
  result: ClosedWonResult;
  /** Public origin for the Brand Hub (used to build intake / brand links). */
  appUrl: string;
  /** Public origin for Brief Tool (used to build project request deeplinks). */
  briefToolUrl: string;
};

export async function dispatchClosedWonNotifications(input: DispatchInput): Promise<void> {
  if (input.result.kind === "same_deal") return; // dedup — nothing to do

  const tasks: Array<Promise<void>> = [];

  if (input.result.kind === "new_client") {
    tasks.push(sendBdIntakeDm(input as DispatchInput & { result: Extract<ClosedWonResult, { kind: "new_client" }> }));
    tasks.push(sendCfoCard({ ...input, businessName: newClientBusinessName(input.result.deal), newClient: true }));
  } else {
    tasks.push(sendAmProjectRequestDm(input as DispatchInput & { result: Extract<ClosedWonResult, { kind: "returning_client" }> }));
    tasks.push(sendCfoCard({ ...input, businessName: input.result.brand.business_name, newClient: false }));
  }

  // Credit DM fires for both scenarios.
  tasks.push(sendCreditDm(input));

  await Promise.allSettled(tasks);
}

// ────────────────────────────────────────────────────────────────────────────
// Format helpers
// ────────────────────────────────────────────────────────────────────────────

function dealValueLine(deal: DealSnapshot): string {
  return deal.dealValue != null ? `$${deal.dealValue.toLocaleString()}` : "—";
}

function primaryContactLine(deal: DealSnapshot): string {
  if (!deal.primaryContact) return "—";
  const c = deal.primaryContact;
  return [c.name, c.email, c.phone].filter(Boolean).join(" · ");
}

function billingContactLine(deal: DealSnapshot): string {
  if (!deal.billingContact) return "—";
  const c = deal.billingContact;
  return [c.name, c.email, c.phone].filter(Boolean).join(" · ");
}

function servicesLine(deal: DealSnapshot): string {
  if (deal.services.length === 0) return "—";
  return deal.services.join(", ");
}

function dealTypeLabel(deal: DealSnapshot): string {
  if (!deal.dealType) return "—";
  return /recurring/i.test(deal.dealType) ? "Retainer (recurring)" : deal.dealType;
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
  // Brief Tool's briefs dashboard filtered to this client. The AM clicks
  // "New project request" from there to open the modal — the modal picks
  // up the brand context from the filter.
  // TODO(brief-tool): support query-param prefill on the modal itself
  // (services, value, deal_type) so this link can fully pre-fill the form.
  const params = new URLSearchParams({ client: businessName });
  return `${briefToolUrl.replace(/\/$/, "")}/?${params.toString()}`;
}

function brandUrlFor(appUrl: string, brandId: string): string {
  return `${appUrl.replace(/\/$/, "")}/brand/${brandId}`;
}

/** Common deal-context widgets used in every "do the project request" card. */
function dealContextWidgets(deal: DealSnapshot): Array<Record<string, unknown> | null> {
  return [
    { decoratedText: { topLabel: "Services sold", text: servicesLine(deal) } },
    { decoratedText: { topLabel: "Deal value", text: dealValueLine(deal) } },
    { decoratedText: { topLabel: "Deal type", text: dealTypeLabel(deal) } },
    deal.closeDate ? { decoratedText: { topLabel: "Close date", text: deal.closeDate } } : null,
    { decoratedText: { topLabel: "BD", text: deal.bd ?? "—" } },
    deal.dealIdentifiers.length > 0
      ? { decoratedText: { topLabel: "Credit", text: deal.dealIdentifiers.join(", ") } }
      : null,
    { decoratedText: { topLabel: "Primary contact", text: primaryContactLine(deal) } },
    deal.billingContact
      ? { decoratedText: { topLabel: "Billing contact", text: billingContactLine(deal) } }
      : null,
  ];
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

  const card = {
    cardsV2: [
      {
        cardId: `bd-intake-${deal.itemId}`,
        card: {
          header: {
            title: `🎉 Closed Won — new client`,
            subtitle: `${businessName}${deal.bd ? ` · ${deal.bd}` : ""}`,
          },
          sections: [
            {
              widgets: [
                {
                  decoratedText: {
                    topLabel: "Next step",
                    text: `Send this intake link to ${deal.primaryContact?.name ?? "your client"}. Once they submit, Justin gets pinged to assign an AM.`,
                  },
                },
                ...dealContextWidgets(deal),
                {
                  buttonList: {
                    buttons: [
                      { text: "Copy intake link →", onClick: { openLink: { url: intakeUrl } } },
                      { text: "Open Monday deal", onClick: { openLink: { url: deal.url } } },
                    ],
                  },
                },
                {
                  decoratedText: {
                    topLabel: "Intake link",
                    text: intakeUrl,
                    wrapText: true,
                  },
                },
              ].filter(Boolean),
            },
          ],
        },
      },
    ],
  };
  await postCard(webhook, card, "BD intake");
}

// ────────────────────────────────────────────────────────────────────────────
// Returning client — DM the AM with full deal context + project request link
// ────────────────────────────────────────────────────────────────────────────

async function sendAmProjectRequestDm(args: {
  result: Extract<ClosedWonResult, { kind: "returning_client" }>;
  appUrl: string;
  briefToolUrl: string;
}): Promise<void> {
  const webhook =
    process.env.GOOGLE_CHAT_AMS_WEBHOOK_URL || process.env.GOOGLE_CHAT_INTAKE_WEBHOOK_URL;

  const { result, appUrl, briefToolUrl } = args;
  const deal = result.deal;
  const brand = result.brand;
  const am = brand.account_manager?.trim() || null;
  const brandUrl = brandUrlFor(appUrl, brand.id);
  const projectUrl = projectRequestLink(briefToolUrl, brand.business_name);

  const subtitle = am
    ? `${brand.business_name} · AM: ${am}`
    : `${brand.business_name} · No AM assigned — ${AM_HEAD_NAME}, please assign`;

  const card = {
    cardsV2: [
      {
        cardId: `am-project-request-${deal.itemId}`,
        card: {
          header: {
            title: `📦 Closed Won — returning client`,
            subtitle,
          },
          sections: [
            {
              widgets: [
                {
                  decoratedText: {
                    topLabel: "Next step",
                    text: am
                      ? `${am} — open a project request in Brief Tool to put this on the schedule. Deal details below.`
                      : `${AM_HEAD_NAME} — assign an AM, then they should open a project request in Brief Tool.`,
                  },
                },
                { decoratedText: { topLabel: "Deal", text: deal.itemName } },
                ...dealContextWidgets(deal),
                {
                  buttonList: {
                    buttons: [
                      { text: "Open project request →", onClick: { openLink: { url: projectUrl } } },
                      { text: "Open brand", onClick: { openLink: { url: brandUrl } } },
                      { text: "Open Monday deal", onClick: { openLink: { url: deal.url } } },
                    ],
                  },
                },
              ].filter(Boolean),
            },
          ],
        },
      },
    ],
  };
  await postCard(webhook, card, "AM project request");
}

// ────────────────────────────────────────────────────────────────────────────
// CFO card (both new + returning, different copy)
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
  const isRecurring = /recurring/i.test(deal.dealType ?? "");

  const billingLine =
    isRecurring && deal.closeDate
      ? `${dealValueLine(deal)}/mo — first billing ${suggestFirstBillingDate(deal.closeDate) ?? "TBD"}`
      : `${dealValueLine(deal)} — invoice now`;

  const title = args.newClient
    ? isRecurring
      ? "💰 Closed Won — set up monthly billing"
      : "💰 Closed Won — invoice ready"
    : `💰 Existing client — new ${isRecurring ? "retainer add-on" : "invoice"}`;

  const buttons: Array<{ text: string; onClick: { openLink: { url: string } } }> = [
    { text: "Open Monday deal", onClick: { openLink: { url: deal.url } } },
  ];
  if (args.result.kind === "returning_client") {
    buttons.push({
      text: "Open brand",
      onClick: { openLink: { url: brandUrlFor(args.appUrl, args.result.brand.id) } },
    });
  }

  const card = {
    cardsV2: [
      {
        cardId: `cfo-${deal.itemId}`,
        card: {
          header: {
            title,
            subtitle: args.businessName,
          },
          sections: [
            {
              widgets: [
                { decoratedText: { topLabel: "Amount", text: billingLine } },
                { decoratedText: { topLabel: "Services", text: servicesLine(deal) } },
                { decoratedText: { topLabel: "Deal type", text: deal.dealType ?? "—" } },
                { decoratedText: { topLabel: "Close date", text: deal.closeDate ?? "—" } },
                {
                  decoratedText: {
                    topLabel: "Billing contact",
                    text:
                      billingContactLine(deal) !== "—"
                        ? billingContactLine(deal)
                        : primaryContactLine(deal),
                  },
                },
                args.newClient
                  ? {
                      decoratedText: {
                        topLabel: "Note",
                        text: "Brand record will be created once the client submits the intake form.",
                      },
                    }
                  : null,
                { buttonList: { buttons } },
              ].filter(Boolean),
            },
          ],
        },
      },
    ],
  };
  await postCard(webhook, card, "CFO");
}

// ────────────────────────────────────────────────────────────────────────────
// Credit DM for deal identifiers (both new + returning)
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

  const card = {
    cardsV2: [
      {
        cardId: `credit-${deal.itemId}`,
        card: {
          header: {
            title: `🎉 Credit: deal closed`,
            subtitle: `${businessName} — ${dealValueLine(deal)}`,
          },
          sections: [
            {
              widgets: [
                {
                  decoratedText: {
                    topLabel: "Credit to",
                    text: deal.dealIdentifiers.join(", "),
                  },
                },
                deal.bd ? { decoratedText: { topLabel: "Run by (BD)", text: deal.bd } } : null,
                { decoratedText: { topLabel: "Deal", text: deal.itemName } },
                {
                  buttonList: {
                    buttons: [
                      { text: "Open Monday deal", onClick: { openLink: { url: deal.url } } },
                    ],
                  },
                },
              ].filter(Boolean),
            },
          ],
        },
      },
    ],
  };
  await postCard(webhook, card, "Credit");
}

// ────────────────────────────────────────────────────────────────────────────
// Step 2 — Client submitted intake on a deal-sourced link → DM Justin
//          (AM Head) so he can assign an AM.
// ────────────────────────────────────────────────────────────────────────────

export type AmHeadAssignmentInput = {
  brand: BrandLite;
  deal: DealSnapshot;
  appUrl: string;
};

export async function notifyAmHeadAssignmentNeeded(
  input: AmHeadAssignmentInput
): Promise<void> {
  const webhook =
    process.env.GOOGLE_CHAT_AM_HEAD_WEBHOOK_URL ||
    process.env.GOOGLE_CHAT_INTAKE_WEBHOOK_URL;

  const { brand, deal, appUrl } = input;
  const brandUrl = brandUrlFor(appUrl, brand.id);
  const isRecurring = /recurring/i.test(deal.dealType ?? "");
  const flavor = isRecurring ? "retainer" : "one-off";

  const card = {
    cardsV2: [
      {
        cardId: `am-head-assign-${deal.itemId}`,
        card: {
          header: {
            title: `🎯 New ${flavor} client — assign an AM`,
            subtitle: `${brand.business_name} · ${dealValueLine(deal)}${isRecurring ? "/mo" : ""}`,
          },
          sections: [
            {
              widgets: [
                {
                  decoratedText: {
                    topLabel: "Status",
                    text: `Client just submitted the intake form. ${AM_HEAD_NAME}, assign an AM in the brand editor — they'll be DM'd automatically to open the project request.`,
                  },
                },
                ...dealContextWidgets(deal),
                {
                  buttonList: {
                    buttons: [
                      { text: "Open brand → assign AM", onClick: { openLink: { url: brandUrl } } },
                      { text: "Open Monday deal", onClick: { openLink: { url: deal.url } } },
                    ],
                  },
                },
              ].filter(Boolean),
            },
          ],
        },
      },
    ],
  };
  await postCard(webhook, card, "AM Head assign");
}

// ────────────────────────────────────────────────────────────────────────────
// Step 3 — Justin assigned an AM to a deal-sourced brand → DM that AM with
//          deal context + project-request deeplink.
// ────────────────────────────────────────────────────────────────────────────

export type AmAssignedInput = {
  brand: BrandLite;
  deal: DealSnapshot;
  appUrl: string;
  briefToolUrl: string;
};

export async function notifyAmAssigned(input: AmAssignedInput): Promise<void> {
  const webhook =
    process.env.GOOGLE_CHAT_AMS_WEBHOOK_URL || process.env.GOOGLE_CHAT_INTAKE_WEBHOOK_URL;

  const { brand, deal, appUrl, briefToolUrl } = input;
  const am = brand.account_manager?.trim();
  if (!am) return; // shouldn't be called with empty AM, but bail just in case

  const brandUrl = brandUrlFor(appUrl, brand.id);
  const projectUrl = projectRequestLink(briefToolUrl, brand.business_name);

  const card = {
    cardsV2: [
      {
        cardId: `am-assigned-${deal.itemId}-${brand.id}`,
        card: {
          header: {
            title: `👋 You're up — new client assigned`,
            subtitle: `${brand.business_name} · AM: ${am}`,
          },
          sections: [
            {
              widgets: [
                {
                  decoratedText: {
                    topLabel: "Next step",
                    text: `${am} — open a project request in Brief Tool to put this on the schedule. Full deal details below so you can fill it out in one go.`,
                  },
                },
                { decoratedText: { topLabel: "Deal", text: deal.itemName } },
                ...dealContextWidgets(deal),
                {
                  buttonList: {
                    buttons: [
                      { text: "Open project request →", onClick: { openLink: { url: projectUrl } } },
                      { text: "Open brand", onClick: { openLink: { url: brandUrl } } },
                      { text: "Open Monday deal", onClick: { openLink: { url: deal.url } } },
                    ],
                  },
                },
              ].filter(Boolean),
            },
          ],
        },
      },
    ],
  };
  await postCard(webhook, card, "AM assigned");
}
