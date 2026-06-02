// Monday → Brand Hub webhook for the Closed Won handoff.
//
// Fires on either:
//   • An item moving into the Closed Won group (group_mkv5cdzh), OR
//   • The Stage column flipping to "Closed Won".
//
// Dispatches by scenario:
//   - same_deal     : webhook re-fired, do nothing
//   - new_client    : brand row + parent Dropbox + per-service projects +
//                     AM Head + CFO + Team broadcast + Credit DM
//   - existing_client : per-service projects + existing-AM DM + CFO + Credit DM
//
// All long-running side effects (Dropbox, brief seeding) run in-process before
// we respond; notifications are awaited so Vercel's function shutdown can't
// cancel in-flight fetches.

import { NextResponse } from "next/server";
import { processClosedWonDeal } from "@/lib/brands/create-from-deal";
import { dispatchClosedWonNotifications } from "@/lib/notifications/handoff";
import { alertError } from "@/lib/notifications/alert";

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

const CLOSED_WON_GROUP_ID = "group_mkv5cdzh";
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
    const result = await processClosedWonDeal(pulseId);

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
    const brandUrl = `${appUrl}/brand/${result.brand.id}`;

    await dispatchClosedWonNotifications({ result, brandUrl });

    return NextResponse.json({
      ok: true,
      kind: result.kind,
      brand_id: result.brand.id,
      business_name: result.brand.business_name,
      project_count: result.projects.length,
      service_types: result.projects.map((p) => p.service_type),
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
