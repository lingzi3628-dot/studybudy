/**
 * push.ts — Phase 52: Web Push notifications
 *
 * Server-side helper for sending Web Push notifications to a user's
 * registered browsers/devices (PWA push, works while the app is closed).
 *
 * Configuration (env vars — see .env.example):
 *   NEXT_PUBLIC_VAPID_PUBLIC_KEY  — public key (also needed client-side)
 *   VAPID_PRIVATE_KEY             — private key (server only)
 *   VAPID_SUBJECT                 — mailto: contact for the push service
 *
 * If keys are not configured, everything here no-ops gracefully so dev
 * environments and un-configured deployments are unaffected.
 *
 * Usage:
 *   await sendPushToUser(userId, {
 *     title: "🔥 Streak reminder",
 *     body: "Don't lose your 5-day streak — study 10 minutes today!",
 *     url: "/",
 *     tag: "streak",
 *   });
 */

import webpush from "web-push";
import { db } from "./db";

export type PushPayload = {
  title: string;
  body: string;
  /** Path to open when the notification is clicked (e.g. "/study-room/...") */
  url?: string;
  /** Dedup tag — same tag replaces the previous notification instead of stacking */
  tag?: string;
};

export function isPushConfigured(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
    process.env.VAPID_PRIVATE_KEY
  );
}

function getWebPush() {
  if (!isPushConfigured()) return null;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:admin@studybuddy.app",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );
  return webpush;
}

/**
 * Send a push notification to every device registered for the user.
 * Dead endpoints (uninstalled app, expired subscription → 404/410) are
 * pruned automatically.
 *
 * Returns { sent, pruned }. Never throws — push is best-effort and must
 * not break the calling route.
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload
): Promise<{ sent: number; pruned: number }> {
  try {
    const wp = getWebPush();
    if (!wp) return { sent: 0, pruned: 0 };

    const subs = await db.pushSubscription.findMany({
      where: { userId },
    });
    if (subs.length === 0) return { sent: 0, pruned: 0 };

    const json = JSON.stringify(payload);
    let sent = 0;
    const prunedIds: string[] = [];

    await Promise.all(
      subs.map(async (sub) => {
        try {
          await wp.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            json
          );
          sent++;
        } catch (e: any) {
          const status = e?.statusCode;
          if (status === 404 || status === 410) {
            prunedIds.push(sub.id);
          } else {
            console.warn("[push] send failed:", status ?? e?.message);
          }
        }
      })
    );

    if (prunedIds.length > 0) {
      await db.pushSubscription.deleteMany({
        where: { id: { in: prunedIds } },
      });
    }

    return { sent, pruned: prunedIds.length };
  } catch (e: any) {
    console.error("[push] sendPushToUser failed:", e?.message);
    return { sent: 0, pruned: 0 };
  }
}

/**
 * Send a push to many users at once (fan-out). Users with no subscriptions
 * are simply skipped. Failures never propagate.
 */
export async function sendPushToUsers(
  userIds: string[],
  payload: PushPayload
): Promise<{ sent: number; pruned: number }> {
  let sent = 0;
  let pruned = 0;
  for (const userId of userIds) {
    const r = await sendPushToUser(userId, payload);
    sent += r.sent;
    pruned += r.pruned;
  }
  return { sent, pruned };
}
