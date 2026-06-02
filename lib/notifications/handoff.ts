// Closed Won handoff notifications. Three audiences, each routed to its own
// Google Chat webhook so the noise stays organized:
//
//   • AM Head — needs to assign an AM (recurring → retainer AM, one-time
//     → project AM). Falls back to the intake webhook if not configured.
//   • CFO — needs to send the invoice via QuickBooks.
//   • Team broadcast — the general "Brand Hub Intakes" channel (intake
//     webhook). Same format as a public-form intake so everyone sees the
//     same shape.
//
// Each call is best-effort; failures are logged but never thrown.

import type { DealSnapshot } from "@/lib/monday/deals";

export type HandoffInput = {
  brandId: string;
  businessName: string;
  brandUrl: string;
  deal: DealSnapshot;
};

export async function notifyClosedWonHandoff(input: HandoffInput): Promise<void> {
  await Promise.allSettled([
    sendAmHeadCard(input),
    sendCfoCard(input),
    sendTeamCard(input),
  ]);
}

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

async function postCard(webhook: string, card: unknown, label: string): Promise<void> {
  try {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(card),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[handoff/${label}] webhook ${res.status}: ${body.slice(0, 400)}`);
    } else {
      console.log(`[handoff/${label}] posted ✓`);
    }
  } catch (e) {
    console.error(`[handoff/${label}] failed: ${(e as Error).message}`);
  }
}

// AM Head → "assign an AM"
async function sendAmHeadCard(input: HandoffInput): Promise<void> {
  const webhook =
    process.env.GOOGLE_CHAT_AM_HEAD_WEBHOOK_URL ||
    process.env.GOOGLE_CHAT_INTAKE_WEBHOOK_URL;
  if (!webhook) return;

  const { deal, businessName, brandUrl } = input;
  const card = {
    cardsV2: [
      {
        cardId: `am-head-${input.brandId}`,
        card: {
          header: {
            title: `🎯 Closed Won — assign an AM`,
            subtitle: businessName,
          },
          sections: [
            {
              widgets: [
                { decoratedText: { topLabel: "Routing", text: engagementLine(deal) } },
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
                      {
                        text: "Open brand draft →",
                        onClick: { openLink: { url: brandUrl } },
                      },
                      {
                        text: "Open Monday deal",
                        onClick: { openLink: { url: deal.url } },
                      },
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

// CFO → "invoice this client"
async function sendCfoCard(input: HandoffInput): Promise<void> {
  const webhook =
    process.env.GOOGLE_CHAT_CFO_WEBHOOK_URL ||
    process.env.GOOGLE_CHAT_INTAKE_WEBHOOK_URL;
  if (!webhook) return;

  const { deal, businessName } = input;
  const card = {
    cardsV2: [
      {
        cardId: `cfo-${input.brandId}`,
        card: {
          header: {
            title: `💰 Closed Won — invoice ready`,
            subtitle: businessName,
          },
          sections: [
            {
              widgets: [
                { decoratedText: { topLabel: "Deal value", text: dealValueLine(deal) } },
                { decoratedText: { topLabel: "Deal type", text: deal.dealType ?? "—" } },
                { decoratedText: { topLabel: "Close date", text: deal.closeDate ?? "—" } },
                { decoratedText: { topLabel: "Billing contact", text: billingContactLine(deal) } },
                deal.primaryContact && billingContactLine(deal) === "—"
                  ? { decoratedText: { topLabel: "Primary contact", text: primaryContactLine(deal) } }
                  : null,
                {
                  buttonList: {
                    buttons: [
                      {
                        text: "Open Monday deal",
                        onClick: { openLink: { url: deal.url } },
                      },
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

// Team broadcast — same general "new brand draft" notification the public
// intake form fires, so the channel stays a single source of truth.
async function sendTeamCard(input: HandoffInput): Promise<void> {
  const webhook = process.env.GOOGLE_CHAT_INTAKE_WEBHOOK_URL;
  if (!webhook) return;

  const { deal, businessName, brandUrl } = input;
  const card = {
    cardsV2: [
      {
        cardId: `team-${input.brandId}`,
        card: {
          header: {
            title: `🌟 New brand draft (from sales)`,
            subtitle: businessName,
          },
          sections: [
            {
              widgets: [
                { decoratedText: { topLabel: "Source", text: "Auto-created from Closed Won deal" } },
                { decoratedText: { topLabel: "Deal value", text: dealValueLine(deal) } },
                { decoratedText: { topLabel: "Routing", text: engagementLine(deal) } },
                { decoratedText: { topLabel: "BD", text: deal.bd ?? "—" } },
                {
                  buttonList: {
                    buttons: [
                      {
                        text: "Open brand draft →",
                        onClick: { openLink: { url: brandUrl } },
                      },
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
