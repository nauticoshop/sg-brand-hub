// Closed Won notification dispatcher. Different audiences see different cards
// depending on whether the deal closed for a new or returning client.
//
//   NEW client          → AM Head + CFO + Team broadcast (current handoff)
//   RETURNING client    → existing AM (DM via AMs channel) + CFO. NO AM Head,
//                         NO team broadcast.
//   Always (both)       → Credit DM to deal identifier(s) on the AMs channel.
//
// Channels (each falls back to GOOGLE_CHAT_INTAKE_WEBHOOK_URL if unset):
//   GOOGLE_CHAT_AM_HEAD_WEBHOOK_URL  — Justin Tarr / Sales Handoff space
//   GOOGLE_CHAT_CFO_WEBHOOK_URL      — CFO / Sales Handoff space
//   GOOGLE_CHAT_AMS_WEBHOOK_URL      — Account Manager Chat space
//   GOOGLE_CHAT_INTAKE_WEBHOOK_URL   — Brand Hub Intakes space (general team)
//
// Each post awaits its fetch so Vercel doesn't kill the function before the
// card lands. Per-post errors are logged but never thrown.

import type { DealSnapshot } from "@/lib/monday/deals";
import type { ClosedWonResult, ProjectOutcome, BrandLite } from "@/lib/brands/create-from-deal";
import { suggestFirstBillingDate } from "@/lib/brands/create-from-deal";
import { briefShareUrl } from "@/lib/brief-tool/seed-brief";

export type DispatchInput = {
  result: ClosedWonResult;
  brandUrl: string;
};

export async function dispatchClosedWonNotifications(input: DispatchInput): Promise<void> {
  if (input.result.kind === "same_deal") return; // dedup — nothing to do

  const { result, brandUrl } = input;
  const tasks: Array<Promise<void>> = [];

  if (result.kind === "new_client") {
    tasks.push(sendAmHeadCard({ result, brandUrl }));
    tasks.push(sendCfoCard({ result, brandUrl, newClient: true }));
    tasks.push(sendTeamBroadcast({ result, brandUrl }));
  } else if (result.kind === "existing_client") {
    tasks.push(sendReturningClientAmDm({ result, brandUrl }));
    tasks.push(sendCfoCard({ result, brandUrl, newClient: false }));
  }

  // Credit DM fires for both scenarios.
  tasks.push(sendCreditDm({ result }));

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

function engagementLine(deal: DealSnapshot): string {
  if (!deal.dealType) return "—";
  return /recurring/i.test(deal.dealType)
    ? `${deal.dealType} → Retainer AM`
    : `${deal.dealType} → Project AM`;
}

function servicesLine(deal: DealSnapshot): string {
  if (deal.services.length === 0) return "(none tagged — defaulted to Content)";
  return deal.services.join(", ");
}

function projectsList(projects: ProjectOutcome[]): string {
  return projects
    .map((p) => {
      const briefBit = p.brief_id ? ` · brief seeded` : "";
      const folderBit = p.dropbox_project_folder_url ? ` · folder created` : "";
      return `• ${p.service_type}: ${p.project_name}${briefBit}${folderBit}`;
    })
    .join("\n");
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
// New client — AM Head card
// ────────────────────────────────────────────────────────────────────────────

async function sendAmHeadCard(args: {
  result: Extract<ClosedWonResult, { kind: "new_client" }>;
  brandUrl: string;
}): Promise<void> {
  const webhook =
    process.env.GOOGLE_CHAT_AM_HEAD_WEBHOOK_URL || process.env.GOOGLE_CHAT_INTAKE_WEBHOOK_URL;
  const { result, brandUrl } = args;
  const deal = result.deal;

  const card = {
    cardsV2: [
      {
        cardId: `am-head-${result.brand.id}`,
        card: {
          header: {
            title: `🎯 Closed Won — assign an AM`,
            subtitle: result.brand.business_name,
          },
          sections: [
            {
              widgets: [
                { decoratedText: { topLabel: "Routing", text: engagementLine(deal) } },
                { decoratedText: { topLabel: "Services", text: servicesLine(deal) } },
                { decoratedText: { topLabel: "Deal value", text: dealValueLine(deal) } },
                { decoratedText: { topLabel: "BD", text: deal.bd ?? "—" } },
                deal.dealIdentifiers.length > 0
                  ? { decoratedText: { topLabel: "Credit", text: deal.dealIdentifiers.join(", ") } }
                  : null,
                { decoratedText: { topLabel: "Close date", text: deal.closeDate ?? "—" } },
                { decoratedText: { topLabel: "Primary contact", text: primaryContactLine(deal) } },
                {
                  buttonList: {
                    buttons: [
                      { text: "Open brand draft →", onClick: { openLink: { url: brandUrl } } },
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
  await postCard(webhook, card, "AM Head");
}

// ────────────────────────────────────────────────────────────────────────────
// CFO card (both new + returning, different copy)
// ────────────────────────────────────────────────────────────────────────────

async function sendCfoCard(args: {
  result: Extract<ClosedWonResult, { kind: "new_client" | "existing_client" }>;
  brandUrl: string;
  newClient: boolean;
}): Promise<void> {
  const webhook =
    process.env.GOOGLE_CHAT_CFO_WEBHOOK_URL || process.env.GOOGLE_CHAT_INTAKE_WEBHOOK_URL;
  const { result, brandUrl } = args;
  const deal = result.deal;
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

  const card = {
    cardsV2: [
      {
        cardId: `cfo-${result.brand.id}-${deal.itemId}`,
        card: {
          header: {
            title,
            subtitle: result.brand.business_name,
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
                  ? null
                  : {
                      decoratedText: {
                        topLabel: "Note",
                        text: "Existing client — see their brand record for billing history.",
                      },
                    },
                {
                  buttonList: {
                    buttons: [
                      { text: "Open Monday deal", onClick: { openLink: { url: deal.url } } },
                      { text: "Open brand", onClick: { openLink: { url: brandUrl } } },
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
  await postCard(webhook, card, "CFO");
}

// ────────────────────────────────────────────────────────────────────────────
// New client team broadcast
// ────────────────────────────────────────────────────────────────────────────

async function sendTeamBroadcast(args: {
  result: Extract<ClosedWonResult, { kind: "new_client" }>;
  brandUrl: string;
}): Promise<void> {
  const webhook = process.env.GOOGLE_CHAT_INTAKE_WEBHOOK_URL;
  const { result, brandUrl } = args;
  const card = {
    cardsV2: [
      {
        cardId: `team-${result.brand.id}`,
        card: {
          header: {
            title: `🌟 New brand draft (from sales)`,
            subtitle: result.brand.business_name,
          },
          sections: [
            {
              widgets: [
                { decoratedText: { topLabel: "Source", text: "Auto-created from Closed Won deal" } },
                { decoratedText: { topLabel: "Deal value", text: dealValueLine(result.deal) } },
                { decoratedText: { topLabel: "Services", text: servicesLine(result.deal) } },
                { decoratedText: { topLabel: "BD", text: result.deal.bd ?? "—" } },
                {
                  buttonList: {
                    buttons: [
                      { text: "Open brand draft →", onClick: { openLink: { url: brandUrl } } },
                    ],
                  },
                },
              ],
            },
          ],
        },
      },
    ],
  };
  await postCard(webhook, card, "Team broadcast");
}

// ────────────────────────────────────────────────────────────────────────────
// Returning client → existing AM DM (posted to AMs channel)
// ────────────────────────────────────────────────────────────────────────────

async function sendReturningClientAmDm(args: {
  result: Extract<ClosedWonResult, { kind: "existing_client" }>;
  brandUrl: string;
}): Promise<void> {
  const webhook =
    process.env.GOOGLE_CHAT_AMS_WEBHOOK_URL || process.env.GOOGLE_CHAT_INTAKE_WEBHOOK_URL;
  const { result, brandUrl } = args;
  const deal = result.deal;
  const am = result.brand.account_manager;

  // Build per-project links list — content projects have brief shortcuts.
  const projectLines = result.projects.map((p) => {
    if (p.brief_id) {
      return `• ${p.service_type}: ${p.project_name} — brief draft ready`;
    }
    return `• ${p.service_type}: ${p.project_name} — track in your usual workflow`;
  });

  const hasContent = result.projects.some((p) => p.service_type === "Content" && p.brief_id);
  const contentBrief = result.projects.find((p) => p.service_type === "Content" && p.brief_id);

  const card = {
    cardsV2: [
      {
        cardId: `returning-${result.brand.id}-${deal.itemId}`,
        card: {
          header: {
            title: `📦 Existing client — new deal closed`,
            subtitle: `${result.brand.business_name}${am ? ` · AM: ${am}` : ""}`,
          },
          sections: [
            {
              widgets: [
                { decoratedText: { topLabel: "Deal value", text: dealValueLine(deal) } },
                { decoratedText: { topLabel: "Services", text: servicesLine(deal) } },
                { decoratedText: { topLabel: "BD", text: deal.bd ?? "—" } },
                projectLines.length > 0
                  ? { decoratedText: { text: projectLines.join("\n") } }
                  : null,
                hasContent && contentBrief?.brief_id
                  ? {
                      buttonList: {
                        buttons: [
                          {
                            text: "Open brief draft →",
                            onClick: { openLink: { url: briefShareUrl(contentBrief.brief_id) } },
                          },
                          { text: "Open brand", onClick: { openLink: { url: brandUrl } } },
                          { text: "Open Monday deal", onClick: { openLink: { url: deal.url } } },
                        ],
                      },
                    }
                  : {
                      buttonList: {
                        buttons: [
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
  await postCard(webhook, card, "Returning client AM");
}

// ────────────────────────────────────────────────────────────────────────────
// Credit DM for deal identifiers (fires for both new + returning)
// ────────────────────────────────────────────────────────────────────────────

async function sendCreditDm(args: { result: ClosedWonResult }): Promise<void> {
  if (args.result.kind === "same_deal") return;
  const deal = (args.result as Extract<ClosedWonResult, { kind: "new_client" | "existing_client" }>).deal;
  const brand = args.result.brand as BrandLite;
  if (!deal.dealIdentifiers || deal.dealIdentifiers.length === 0) return;

  const webhook =
    process.env.GOOGLE_CHAT_AMS_WEBHOOK_URL || process.env.GOOGLE_CHAT_INTAKE_WEBHOOK_URL;

  const card = {
    cardsV2: [
      {
        cardId: `credit-${brand.id}-${deal.itemId}`,
        card: {
          header: {
            title: `🎉 Credit: deal closed`,
            subtitle: `${brand.business_name} — ${dealValueLine(deal)}`,
          },
          sections: [
            {
              widgets: [
                {
                  decoratedText: {
                    topLabel: "Closed at",
                    text: dealValueLine(deal),
                  },
                },
                {
                  decoratedText: {
                    topLabel: "Credit to",
                    text: deal.dealIdentifiers.join(", "),
                  },
                },
                deal.bd ? { decoratedText: { topLabel: "Run by (BD)", text: deal.bd } } : null,
                {
                  decoratedText: {
                    topLabel: "Deal",
                    text: deal.itemName,
                  },
                },
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
