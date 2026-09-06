/**
 * Slack integration adapter — Phase 71
 *
 * Implements Slack slash-command receiving + reply posting.
 *
 * Slack's slash-command flow:
 *   1. User types /ask-bot hello in a Slack channel
 *   2. Slack POSTs to our webhook URL with form-encoded data:
 *        token, team_id, channel_id, user_id, command=/<command>, text=hello
 *   3. We verify the signing signature (HMAC-SHA256 of timestamp + body
 *      using the signing secret), run the bot, and reply.
 *   4. We can reply immediately (in the same request, as JSON) for a
 *      fast response, or post asynchronously via chat.postMessage for
 *      long replies.
 *
 * Signature verification: Slack sends X-Slack-Signature + X-Slack-Request-Timestamp
 * headers. We compute v0 = HMAC-SHA256(signing_secret, "v0:<ts>:<body>")
 * and compare (constant-time) to the header. Rejects replay attacks
 * (timestamp must be within 5 min).
 */

import crypto from "crypto";

const SLACK_API = "https://slack.com/api";

/** Verify the Slack signing signature on an incoming webhook. */
export function verifySlackSignature(
  signingSecret: string,
  timestamp: string,
  body: string,
  signature: string,
): boolean {
  // Reject timestamps older than 5 min (replay protection).
  const age = Math.abs(Date.now() / 1000 - parseInt(timestamp, 10));
  if (isNaN(age) || age > 300) return false;

  const sigBase = `v0:${timestamp}:${body}`;
  const computed = "v0=" + crypto.createHmac("sha256", signingSecret).update(sigBase).digest("hex");

  // Constant-time comparison.
  if (computed.length !== signature.length) return false;
  return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(signature));
}

/** Post a message to a Slack channel via chat.postMessage. */
export async function postSlackMessage(
  botToken: string,
  channel: string,
  text: string,
): Promise<{ ok: boolean; error?: string }> {
  // Slack caps text at 40000 chars — plenty. But trim for cleanliness.
  const trimmed = text.slice(0, 3900);
  try {
    const r = await fetch(`${SLACK_API}/chat.postMessage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${botToken}`,
      },
      body: JSON.stringify({ channel, text: trimmed }),
    });
    const d = await r.json();
    if (!d.ok) return { ok: false, error: d.error };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message };
  }
}

// === Slash-command payload parsing ===

export type SlackSlashCommand = {
  token: string;
  teamId: string;
  channelId: string;
  userId: string;
  userName: string;
  command: string;
  text: string;
  responseUrl: string;
};

/** Parse a form-encoded Slack slash-command body. */
export function parseSlackSlashCommand(
  formData: URLSearchParams,
): SlackSlashCommand {
  return {
    token: formData.get("token") || "",
    teamId: formData.get("team_id") || "",
    channelId: formData.get("channel_id") || "",
    userId: formData.get("user_id") || "",
    userName: formData.get("user_name") || "",
    command: formData.get("command") || "",
    text: formData.get("text") || "",
    responseUrl: formData.get("response_url") || "",
  };
}

/** Format a bot reply for Slack — adds the source as a small annotation. */
export function formatSlackReply(
  reply: string,
  source: "retrieval" | "generative" | "fallback",
  confidence: number,
): string {
  const tag = source === "retrieval" ? "" :
              source === "generative" ? "_[generated]_ " :
              "_[fallback]_ ";
  const conf = source === "retrieval" ? ` _(${Math.round(confidence * 100)}% match)_` : "";
  return `${tag}${reply}${conf}`;
}
