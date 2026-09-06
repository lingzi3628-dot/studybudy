/**
 * Telegram integration adapter — Phase 71
 *
 * Sends a reply message via the Telegram Bot API. Telegram's API is the
 * cleanest of the major chat platforms: one HTTP POST, no OAuth dance,
 * no signature verification needed (the webhook secret in the URL is enough).
 *
 * The webhook receiver is at /api/integrations/telegram/[botId]/webhook.
 * Telegram sends updates as POST { update_id, message: { chat: { id }, text } }.
 */

const TELEGRAM_API = "https://api.telegram.org";

export async function sendTelegramMessage(
  botToken: string,
  chatId: number | string,
  text: string,
): Promise<{ ok: boolean; error?: string }> {
  // Telegram caps messages at 4096 chars. Truncate gracefully.
  const trimmed = text.length > 4000 ? text.slice(0, 3990) + "…" : text;
  try {
    const r = await fetch(`${TELEGRAM_API}/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: trimmed,
        // Disable link previews — keeps the chat clean for Q&A bots.
        disable_web_page_preview: true,
      }),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      return { ok: false, error: d?.description || `HTTP ${r.status}` };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || "network error" };
  }
}

/** Set the Telegram webhook to point at our receiver. Called when the user
 *  connects a Telegram bot. Returns Telegram's confirmation. */
export async function setTelegramWebhook(
  botToken: string,
  webhookUrl: string,
  secret: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetch(`${TELEGRAM_API}/bot${botToken}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: webhookUrl,
        secret_token: secret,
        // Drop pending updates so the bot doesn't replay old messages.
        drop_pending_updates: true,
        allowed_updates: ["message"],
      }),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      return { ok: false, error: d?.description || `HTTP ${r.status}` };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || "network error" };
  }
}

/** Delete the webhook (called when the user disconnects the integration). */
export async function deleteTelegramWebhook(
  botToken: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetch(`${TELEGRAM_API}/bot${botToken}/deleteWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ drop_pending_updates: true }),
    });
    return { ok: r.ok };
  } catch {
    return { ok: false };
  }
}

/** Get the bot's username (for display in the UI). */
export async function getTelegramBotInfo(
  botToken: string,
): Promise<{ ok: boolean; username?: string; error?: string }> {
  try {
    const r = await fetch(`${TELEGRAM_API}/bot${botToken}/getMe`);
    const d = await r.json();
    if (!d.ok) return { ok: false, error: d.description };
    return { ok: true, username: d.result?.username };
  } catch (e: any) {
    return { ok: false, error: e?.message };
  }
}

// === Payload types (subset of Telegram's Update object) ===

export type TelegramUpdate = {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number; type: string };
    text?: string;
  };
};
