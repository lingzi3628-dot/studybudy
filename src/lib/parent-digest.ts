/**
 * parent-digest.ts — Phase 52: Weekly parent progress emails
 *
 * For every registered Family, builds a weekly progress digest for each
 * child (attempts, accuracy, mastery, streak, weak areas) and emails the
 * parent via SMTP (nodemailer — see lib/email.ts).
 *
 * Triggered by:
 *   - Vercel Cron (vercel.json → /api/cron/parent-digest, Mondays 07:00 UTC)
 *   - Any external cron: curl -H "Authorization: Bearer $CRON_SECRET" \
 *       https://your-domain/api/cron/parent-digest
 *   - Admin panel button (future)
 *
 * Families are skipped gracefully when: parent has no email, parent disabled
 * notifications, or the child has no activity. SMTP not configured → the run
 * reports emails as skipped without failing.
 */

import { db } from "./db";
import { sendEmail } from "./email";

export type DigestChildStats = {
  displayName: string;
  username: string;
  avatarEmoji?: string | null;
  attemptsThisWeek: number;
  correctThisWeek: number;
  accuracyPct: number | null;
  xpTotal: number;
  streakDays: number;
  avgMastery: number | null;
  topSubject: string | null;
  weakTopics: string[];
  lastActivity: Date | null;
};

export type DigestResult = {
  families: number;
  emailsSent: number;
  skipped: number;
  errors: string[];
};

function weekStart(now = new Date()): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - 7);
  return d;
}

export async function collectChildStats(
  child: { displayName: string; username: string; avatarEmoji?: string | null; userId: string },
  since: Date
): Promise<DigestChildStats> {
  const uid = child.userId;

  const [attemptsThisWeek, userXp, allMastery] = await Promise.all([
    db.attempt.findMany({
      where: { userId: uid, createdAt: { gte: since } },
      select: { isCorrect: true, createdAt: true, card: { select: { subject: true, topic: true } } },
    }).catch(() => [] as any[]),
    db.userXp.findUnique({
      where: { userId: uid },
      select: { xpAmount: true, streakDays: true },
    }).catch(() => null),
    db.topicMastery.findMany({
      where: { userId: uid },
      select: { subject: true, topic: true, masteryLevel: true },
    }).catch(() => [] as any[]),
  ]);

  const correctThisWeek = attemptsThisWeek.filter((a) => a.isCorrect).length;
  const accuracyPct =
    attemptsThisWeek.length > 0
      ? Math.round((correctThisWeek / attemptsThisWeek.length) * 100)
      : null;

  // Avg mastery + per-subject averages
  const subjectMap = new Map<string, { sum: number; n: number }>();
  let masterySum = 0;
  for (const m of allMastery) {
    masterySum += m.masteryLevel;
    const s = subjectMap.get(m.subject) ?? { sum: 0, n: 0 };
    s.sum += m.masteryLevel;
    s.n += 1;
    subjectMap.set(m.subject, s);
  }
  const avgMastery = allMastery.length > 0 ? masterySum / allMastery.length : null;

  let topSubject: string | null = null;
  let bestAvg = -1;
  for (const [subject, v] of subjectMap) {
    const avg = v.sum / v.n;
    if (avg > bestAvg) {
      bestAvg = avg;
      topSubject = subject;
    }
  }

  // Weak topics — lowest mastery, at least 1 attempt
  const weakTopics = allMastery
    .filter((m) => m.masteryLevel < 0.5)
    .sort((a, b) => a.masteryLevel - b.masteryLevel)
    .slice(0, 3)
    .map((m) => m.topic);

  const lastActivity = attemptsThisWeek.length > 0
    ? attemptsThisWeek.map((a) => new Date(a.createdAt)).sort((a, b) => b.getTime() - a.getTime())[0]
    : null;

  return {
    displayName: child.displayName,
    username: child.username,
    avatarEmoji: child.avatarEmoji ?? null,
    attemptsThisWeek: attemptsThisWeek.length,
    correctThisWeek,
    accuracyPct,
    xpTotal: userXp?.xpAmount ?? 0,
    streakDays: userXp?.streakDays ?? 0,
    avgMastery,
    topSubject,
    weakTopics,
    lastActivity,
  };
}

function buildDigestHtml(
  familyName: string,
  children: DigestChildStats[],
  weekStart: Date
): { subject: string; html: string } {
  const fmtDate = (d: Date) =>
    d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const childCards = children
    .map((c) => {
      const emoji = c.avatarEmoji ?? "🧑‍🎓";
      const accuracyLine =
        c.accuracyPct !== null
          ? `<strong>${c.accuracyPct}%</strong> accuracy this week`
          : `No practice attempts this week`;
      const masteryLine =
        c.avgMastery !== null
          ? `Average mastery: <strong>${Math.round(c.avgMastery * 100)}%</strong>${c.topSubject ? ` — strongest in <strong>${c.topSubject}</strong>` : ""}`
          : `No mastery data yet`;
      const weakLine =
        c.weakTopics.length > 0
          ? `<div style="margin-top:8px;color:#b91c1c;font-size:13px;">Needs attention: ${c.weakTopics.map((t) => `<strong>${t}</strong>`).join(", ")}</div>`
          : "";
      const activityLine =
        c.lastActivity
          ? `Last active: ${new Date(c.lastActivity).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`
          : `Not active this week`;

      return `
      <div style="border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin-bottom:12px;">
        <div style="font-size:16px;font-weight:700;color:#111827;">${emoji} ${c.displayName} <span style="font-weight:400;color:#6b7280;">(@${c.username})</span></div>
        <div style="margin-top:8px;font-size:13px;color:#374151;line-height:1.7;">
          <div>📝 <strong>${c.attemptsThisWeek}</strong> practice attempts · ${accuracyLine}</div>
          <div>⭐ <strong>${c.xpTotal.toLocaleString()}</strong> XP · 🔥 <strong>${c.streakDays}-day</strong> streak</div>
          <div>📈 ${masteryLine}</div>
          <div style="color:#6b7280;">${activityLine}</div>
          ${weakLine}
        </div>
      </div>`;
    })
    .join("");

  const subject = `📊 Weekly StudyBuddy progress — ${children.length} ${children.length === 1 ? "child" : "children"}`;

  const html = `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;">
    <h2 style="margin:0 0 4px;color:#4f46e5;">StudyBuddy AI</h2>
    <p style="margin:0 0 16px;color:#6b7280;font-size:13px;">
      Weekly progress for ${familyName} — week of ${fmtDate(weekStart)}
    </p>
    ${childCards || `<p style="color:#6b7280;">No children in this family yet.</p>`}
    <p style="margin-top:20px;font-size:12px;color:#9ca3af;">
      You receive this email weekly because your family is registered on StudyBuddy AI.
      Log in to see detailed insights.
    </p>
  </div>`;

  return { subject, html };
}

/**
 * Run the weekly digest for ALL families. Returns a summary.
 */
export async function runWeeklyParentDigest(opts?: { force?: boolean }): Promise<DigestResult> {
  const since = weekStart();
  const result: DigestResult = { families: 0, emailsSent: 0, skipped: 0, errors: [] };

  const families = await db.family.findMany({
    include: {
      children: { select: { displayName: true, username: true, avatarEmoji: true, userId: true } },
    },
  });

  for (const family of families) {
    result.families++;
    try {
      const parent = await db.user.findUnique({
        where: { id: family.parentUserId },
        select: { email: true, notificationsEnabled: true },
      });

      if (!parent?.email) {
        result.skipped++;
        continue;
      }
      if (!parent.notificationsEnabled) {
        result.skipped++;
        continue;
      }

      // Collect stats for every child
      const childrenStats: DigestChildStats[] = [];
      for (const child of family.children) {
        const s = await collectChildStats(child, since);
        childrenStats.push(s);
      }

      // Skip families with zero activity ever (nothing to say)
      const totalAttempts = childrenStats.reduce((acc, c) => acc + c.attemptsThisWeek, 0);
      const hasAnyMastery = childrenStats.some((c) => c.avgMastery !== null);
      if (!opts?.force && totalAttempts === 0 && !hasAnyMastery) {
        result.skipped++;
        continue;
      }

      const familyName = family.displayName ?? `the ${family.parentEmail.split("@")[0]} family`;
      const { subject, html } = buildDigestHtml(familyName, childrenStats, since);

      const r = await sendEmail({
        to: parent.email,
        subject,
        html,
      });

      if (r.ok) result.emailsSent++;
      else result.errors.push(`${parent.email}: ${r.error ?? "send failed"}`);
    } catch (e: any) {
      result.errors.push(`family ${family.id}: ${e?.message ?? "unknown error"}`);
    }
  }

  return result;
}
