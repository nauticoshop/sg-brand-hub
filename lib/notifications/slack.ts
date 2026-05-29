// Slack notifications. Currently used to alert the SG team when a public
// intake form is submitted and a brand needs review. Lightweight wrapper
// around a single incoming-webhook URL — no Slack SDK / OAuth needed.
//
// Setup:
//   1. In Slack: Apps → Incoming Webhooks → Add to workspace → pick a channel
//      (suggest #brand-intake or #new-brands)
//   2. Copy the webhook URL
//   3. Set SLACK_INTAKE_WEBHOOK_URL in Vercel env vars (production + preview)
//
// If the env var isn't set, this module silently no-ops — the intake flow
// still works, no errors raised. That way local dev / staging never
// accidentally pings the team Slack.

type IntakeNotificationInput = {
  brandId: string;
  businessName: string;
  submitterName: string;
  submitterEmail: string;
  vertical: string | null;
  hasLogos: boolean;
  hasColors: boolean;
  appUrl: string;
};

export async function notifyIntakeSubmission(input: IntakeNotificationInput): Promise<void> {
  const webhook = process.env.SLACK_INTAKE_WEBHOOK_URL;
  if (!webhook) return;

  const brandUrl = `${input.appUrl}/brand/${input.brandId}`;
  const completeness: string[] = [];
  if (input.hasLogos) completeness.push("logos");
  if (input.hasColors) completeness.push("colors");
  if (input.vertical) completeness.push("vertical");
  const completenessLine =
    completeness.length > 0
      ? `_Submitted with:_ ${completeness.join(", ")}`
      : "_No assets attached — may need follow-up._";

  const body = {
    text: `🌟 New brand intake: *${input.businessName}*`,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: `🌟 New brand intake: ${input.businessName}` },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Submitter:*\n${input.submitterName}` },
          { type: "mrkdwn", text: `*Email:*\n${input.submitterEmail}` },
          {
            type: "mrkdwn",
            text: `*Vertical:*\n${input.vertical ?? "—"}`,
          },
          { type: "mrkdwn", text: `*Status:*\nSubmitted, awaiting review` },
        ],
      },
      {
        type: "context",
        elements: [{ type: "mrkdwn", text: completenessLine }],
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "Review in Brand Hub →" },
            url: brandUrl,
            style: "primary",
          },
        ],
      },
    ],
  };

  // Best-effort. If Slack 5xxs or the webhook is dead, swallow the error so
  // the intake submission itself still succeeds — the user's form submit
  // shouldn't fail because of a notification problem.
  try {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.error(`Slack webhook returned ${res.status}: ${await res.text().catch(() => "")}`);
    }
  } catch (e) {
    console.error(`Slack webhook failed: ${(e as Error).message}`);
  }
}
