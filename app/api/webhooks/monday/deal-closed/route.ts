// Monday → Brand Hub webhook for the "Closed Won" handoff.
//
// Fires when a deal item moves into the Closed Won group (or its Stage column
// flips to Closed Won — both signals are handled). Pulls full deal context
// from Monday, creates a brand draft in Brand Hub pre-populated with the
// client info, then pings AM Head + CFO + the team via Google Chat so the
// post-close handoff happens automatically.
//
// Setup on the Monday side (one-time):
//   1. Open the Deals - new board (id 9889817939)
//   2. Integrations → Webhooks → "Add integration"
//   3. Trigger: "When an item is moved to a group" OR "When a status changes"
//   4. URL: https://sg-brand-hub.vercel.app/api/webhooks/monday/deal-closed
//   5. Monday issues a verification challenge on first connect; this handler
//      echoes it back to complete the handshake.
//
// Idempotency: createBrandFromDeal checks for an existing brand row keyed by
// source_deal_id before inserting. Safe to re-fire.

import { NextResponse } from "next/server";
import { createBrandFromDeal } from "@/lib/brands/create-from-deal";
import { notifyClosedWonHandoff } from "@/lib/notifications/handoff";
import { alertError } from "@/lib/notifications/alert";

// Monday's webhook payload shape — varies by trigger but always includes
// `event` for actual events and `challenge` for the initial handshake.
type MondayWebhook =
  | { challenge: string }
  | {
      event: {
        type: string;
        pulseId?: number | string;
        boardId?: number | string;
        groupId?: string;
        previousGroupId?: string;
        columnId?: string;
        value?: unknown;
        previousValue?: unknown;
      };
    };

const CLOSED_WON_GROUP_ID = "group_mkv5cdzh"; // verified via _explore-monday-deals.mjs
const CLOSED_WON_STATUS_LABELS = ["Closed Won", "Won", "Closed-Won"];

export async function POST(request: Request) {
  let body: MondayWebhook;
  try {
    body = (await request.json()) as MondayWebhook;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Verification handshake — Monday sends { "challenge": "abc" } on first
  // connect and expects the same string back.
  if ("challenge" in body && typeof body.challenge === "string") {
    return NextResponse.json({ challenge: body.challenge });
  }

  if (!("event" in body) || !body.event) {
    return NextResponse.json({ ok: true, note: "ignored — no event" });
  }
  const event = body.event;

  // We only care about two event shapes:
  //   1. move_pulse_into_group → groupId === CLOSED_WON_GROUP_ID
  //   2. update_column_value on the Stage status column where the new label
  //      is "Closed Won" (different teams may also move the row vs. flip the
  //      status — handle both)
  const isMoveToClosed =
    event.type === "move_pulse_into_group" && event.groupId === CLOSED_WON_GROUP_ID;

  const newStatus = extractStatusLabel(event.value);
  const isStatusFlipToClosed =
    (event.type === "update_column_value" || event.type === "change_column_value") &&
    !!newStatus &&
    CLOSED_WON_STATUS_LABELS.some((l) => l.toLowerCase() === newStatus.toLowerCase());

  if (!isMoveToClosed && !isStatusFlipToClosed) {
    return NextResponse.json({ ok: true, note: "ignored — not a Closed Won transition" });
  }

  const pulseId = event.pulseId != null ? String(event.pulseId) : null;
  if (!pulseId) {
    return NextResponse.json({ ok: true, note: "ignored — no pulseId on event" });
  }

  try {
    const result = await createBrandFromDeal(pulseId);

    // Skip pings if this was a duplicate event (brand already existed) so we
    // don't spam Google Chat every time Monday re-emits.
    if (!result.alreadyExisted) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
      const brandUrl = `${appUrl}/brand/${result.brandId}`;
      notifyClosedWonHandoff({
        brandId: result.brandId,
        businessName: result.businessName,
        brandUrl,
        deal: result.deal,
      });
    }

    return NextResponse.json({
      ok: true,
      brand_id: result.brandId,
      business_name: result.businessName,
      already_existed: result.alreadyExisted,
    });
  } catch (e) {
    alertError({
      flow: "webhooks.monday.deal_closed",
      error: e,
      extras: { pulseId, eventType: event.type },
    });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// Monday's `value` for a status column change has shape
// { label: { text: "Closed Won", ... }, ... } — defensively unwrap.
function extractStatusLabel(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.label === "string") return v.label;
  if (v.label && typeof v.label === "object") {
    const label = v.label as Record<string, unknown>;
    if (typeof label.text === "string") return label.text;
  }
  return null;
}
