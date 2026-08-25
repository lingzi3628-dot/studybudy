/**
 * Notifications lib — Phase 22c
 *
 * Creates notification log entries when an admin unlocks a subject.
 * Notifications are stored in NotificationLog — they're NOT sent yet.
 *
 * Later, when we wire up a real WhatsApp/SMS/email gateway, we'll:
 *   1. Query NotificationLog WHERE status='pending'
 *   2. Send each via the gateway
 *   3. Update status to 'sent' (or 'failed')
 *
 * For now, the admin can see the pending notifications in the admin panel
 * — that way they know who would be notified when a subject unlocks.
 */
import { db } from "./db";

/**
 * Creates NotificationLog entries for all users who have the given subject's
 * grade set as their `grade` field.
 *
 * Each user gets up to 3 notification rows:
 *   - WhatsApp (if they have a phone number)
 *   - SMS (if they have a phone number — same as WhatsApp for now)
 *   - Email (if they have an email)
 *
 * Returns the total number of notifications created.
 */
export async function createNotificationsForSubjectUnlock(
  subjectId: string
): Promise<number> {
  const subject = await db.curriculumSubject.findUnique({
    where: { id: subjectId },
    include: { grade: { select: { name: true } } },
  });
  if (!subject || !subject.grade) return 0;

  // Find all users with this grade
  const users = await db.user.findMany({
    where: {
      grade: { equals: subject.grade.name, mode: "insensitive" },
      banned: false,
    },
    select: { id: true, email: true, phoneNumber: true, name: true },
  });

  if (users.length === 0) return 0;

  const notifSubject = `📚 New subject unlocked: ${subject.name}`;
  const notifBody = `Hi{NAME}! Great news — ${subject.name} is now available for ${subject.grade.name} on StudyBuddy AI. Log in and start learning!`;

  const entries: Array<{
    userId: string;
    channel: string;
    recipient: string;
    subject: string;
    body: string;
  }> = [];

  for (const u of users) {
    const personalizedBody = notifBody.replace("{NAME}", u.name ? ` ${u.name.split(" ")[0]}` : "");

    if (u.phoneNumber) {
      entries.push({
        userId: u.id,
        channel: "whatsapp",
        recipient: u.phoneNumber,
        subject: notifSubject,
        body: personalizedBody,
      });
      entries.push({
        userId: u.id,
        channel: "sms",
        recipient: u.phoneNumber,
        subject: notifSubject,
        body: personalizedBody,
      });
    }
    if (u.email) {
      entries.push({
        userId: u.id,
        channel: "email",
        recipient: u.email,
        subject: notifSubject,
        body: personalizedBody,
      });
    }
  }

  // Bulk insert
  if (entries.length === 0) return 0;
  await db.notificationLog.createMany({ data: entries });
  return entries.length;
}
