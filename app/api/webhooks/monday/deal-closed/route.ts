// Monday → Brand Hub webhook for the Closed Won handoff.
//
// Fires on either:
//   • An item moving into the Closed Won group (group_mkv5cdzh), OR
//   • The Stage column flipping to "Closed Won".
//
// Dispatches by scenario:
//   - same_deal        : webhook re-fired (already dispatched), do nothing
//   - new_client       : DM BD with pre-stamped intake link + CFO + credit
//   - returning_client : DM matched AM with project-request deeplink + CFO + credit
//
// No brand records are created here. No briefs are seeded. No Dropbox folders
// are created. Those happen via:
//   • Intake form submission (creates brand + Dropbox parent folder)
//   • Brief Tool Project Request modal (creates brief + Monday All Projects item)
//
// The webhook just figures out who should act next and pings them.

import { NextResponse } from "next/server";
import {
  classifyClosedWonDeal,
  recordClosedWonDispatch,
} from "@/lib/brands/create-from-deal";
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
    const result = await classifyClosedWonDeal(pulseId);

    if (result.kind === "same_deal") {
      return NextResponse.json({
        ok: true,
        kind: "same_deal",
        note: "already dispatched — no action",
      });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
    const briefToolUrl =
      process.env.NEXT_PUBLIC_BRIEF_TOOL_URL || "https://sg-brief-tool-nu.vercel.app";

    await dispatchClosedWonNotifications({ result, appUrl, briefToolUrl });

    // Record that we dispatched — subsequent webhook firings for the same
    // deal will short-circuit to same_deal.
    await recordClosedWonDispatch({
      monday_deal_id: pulseId,
      brand_id: result.kind === "returning_client" ? result.brand.id : null,
      kind: result.kind,
    });

    return NextResponse.json({
      ok: true,
      kind: result.kind,
      deal_name: result.deal.itemName,
      brand_id: result.kind === "returning_client" ? result.brand.id : null,
      services: result.deal.services,
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
