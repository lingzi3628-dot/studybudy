/**
 * notifications-send.ts — Phase 46
 *
 * Sends queued NotificationLog entries via real channels.
 *
 * Phase 45 left NotificationLog rows stuck in 'pending' state with the
 * comment "Later, when we wire up a real WhatsApp/SMS/email gateway".
 * This module wires up email sending via nodemailer (already a project
 * dependency). WhatsApp/SMS would require a paid gateway (Africa's
 * Talking / Twilio) — left as 'skipped' with a clear log message so
 * admins can see what's pending until a gateway is added.
 *
 * Configuration (all optional, read from env):
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
 *
 * If SMTP_HOST is not set, email sending is skipped (the row stays
 * 'pending') so the feature degrades gracefully in dev environments.
 */

import nodemailer from "nodemailer";
import { db } from "./db";

let _transporter: nodemailer.Transporter | null = null;
function getTransporter(): nodemailer.Transporter | null {
  if (_transporter !== null) return _transporter;
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  _transporter = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_PORT === "465",
    auth: process.env.SMTP_USER ? {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS ?? "",
    } : undefined,
  });
  return _transporter;
}

/**
 * Send a single NotificationLog entry. Updates the row's status to 'sent'
 * or 'failed' with a timestamp.
 */
export async function sendNotification(notificationId: string): Promise<{ ok: boolean; error?: string }> {
  const n = await db.notificationLog.findUnique({ where: { id: notificationId } });
  if (!n) return { ok: false, error: "not found" };
  if (n.status === "sent") return { ok: true };

  if (n.channel === "email") {
    const transporter = getTransporter();
    if (!transporter) {
      // No SMTP configured — leave as pending so a future run can pick it up
      return { ok: false, error: "SMTP not configured (SMTP_HOST env var missing)" };
    }
    try {
      await transporter.sendMail({
        from: process.env.SMTP_FROM ?? "StudyBuddy AI <no-reply@studybuddy.ai>",
        to: n.recipient,
        subject: n.subject,
        text: n.body,
      });
      await db.notificationLog.update({
        where: { id: notificationId },
        data: { status: "sent", sentAt: new Date() },
      });
      return { ok: true };
    } catch (e: any) {
      await db.notificationLog.update({
        where: { id: notificationId },
        data: { status: "failed" },
      });
      return { ok: false, error: e?.message ?? "send failed" };
    }
  }

  if (n.channel === "whatsapp" || n.channel === "sms") {
    // No paid gateway wired yet — leave as pending so admins can see the backlog
    return { ok: false, error: `${n.channel} gateway not configured` };
  }

  return { ok: false, error: `unknown channel: ${n.channel}` };
}

/**
 * Send all pending notifications for a user. Returns counts.
 * Used by the /api/notifications/send endpoint (admin/cron).
 */
export async function sendPendingNotificationsForUser(userId: string, limit = 50): Promise<{ sent: number; failed: number; skipped: number }> {
  const pending = await db.notificationLog.findMany({
    where: { userId, status: "pending" },
    take: limit,
    orderBy: { createdAt: "asc" },
  });
  let sent = 0, failed = 0, skipped = 0;
  for (const n of pending) {
    const r = await sendNotification(n.id);
    if (r.ok) sent++;
    else if (r.error?.includes("not configured")) skipped++;
    else failed++;
  }
  return { sent, failed, skipped };
}
