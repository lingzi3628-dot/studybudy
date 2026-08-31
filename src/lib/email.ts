/**
 * Email service — Phase 23
 *
 * Sends beautiful HTML emails via Gmail SMTP (Google App Password).
 *
 * Used for:
 *   - Forgot password reset links
 *   - Email verification OTP on signup
 *   - Family mode child confirmation OTP
 *   - Admin notifications (new user, new family registration, etc.)
 *
 * SMTP credentials are stored in env vars:
 *   - SMTP_HOST (default: smtp.gmail.com)
 *   - SMTP_PORT (default: 587)
 *   - SMTP_USER (the Gmail address)
 *   - SMTP_PASS (the Google App Password)
 *   - SMTP_FROM_NAME (default: StudyBuddy AI)
 *   - SMTP_FROM_EMAIL (default: same as SMTP_USER)
 */
import nodemailer from "nodemailer";

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = Number(process.env.SMTP_PORT) || 587;
  const user = process.env.SMTP_USER || "";
  // Strip spaces from the Google App Password (they're display-only)
  // SECURITY: credentials must come from env vars only — never hardcode them here.
  const pass = (process.env.SMTP_PASS || "").replace(/\s/g, "");

  if (!user || !pass) {
    console.warn("[email] SMTP_USER / SMTP_PASS not set — emails will not be sent");
    return null;
  }

  console.log("[email] Creating transporter:", { host, port, user, passLength: pass.length });

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // true for 465, false for 587
    auth: { user, pass },
    connectionTimeout: 10000,  // 10 seconds
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });

  return transporter;
}

type EmailResult = { ok: boolean; error?: string; messageId?: string };

/**
 * Where admin-facing notification emails (new signups, family registrations,
 * user management actions) are sent. Set ADMIN_NOTIFY_EMAIL to override;
 * falls back to the SMTP sender address. Never hardcode a personal address here.
 */
export function adminNotifyEmail(): string {
  return process.env.ADMIN_NOTIFY_EMAIL || process.env.SMTP_USER || "";
}

/**
 * Sends an HTML email. Returns { ok, error? }.
 */
export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text?: string; // plain text fallback
}): Promise<EmailResult> {
  const t = getTransporter();
  if (!t) {
    console.warn("[email] No transporter — skipping email to", opts.to);
    return { ok: false, error: "SMTP not configured" };
  }

  const fromName = process.env.SMTP_FROM_NAME || "StudyBuddy AI";
  const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || "noreply@studybuddy.app";

  try {
    console.log("[email] Attempting to send to:", opts.to, "subject:", opts.subject);
    const info = await t.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text ?? opts.html.replace(/<[^>]*>/g, ""),
    });
    console.log("[email] ✅ Sent:", info.messageId, "to", opts.to);
    return { ok: true, messageId: info.messageId };
  } catch (e: any) {
    console.error("[email] ❌ Send failed:", e?.message, "code:", e?.code, "to:", opts.to);
    return { ok: false, error: e?.message ?? String(e) };
  }
}

// ---------------------------------------------------------------------
// Email templates — beautiful HTML designs
// ---------------------------------------------------------------------

function emailShell(opts: {
  title: string;
  greeting: string;
  bodyHtml: string;
  buttonText?: string;
  buttonUrl?: string;
  footer?: string;
}): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://studybudy-chi.vercel.app";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${opts.title}</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:24px 0;">
    <tr>
      <td align="center">
        <table width="480" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#4F46E5,#7C3AED);padding:32px 24px;text-align:center;">
              <div style="width:56px;height:56px;background:rgba(255,255,255,0.15);border-radius:16px;margin:0 auto 12px;display:flex;align-items:center;justify-content:center;">
                <span style="font-size:28px;font-weight:bold;color:#ffffff;">S</span>
              </div>
              <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:bold;">StudyBuddy AI</h1>
              <p style="margin:4px 0 0;color:rgba(255,255,255,0.8);font-size:13px;">Your AI study companion</p>
            </td>
          </tr>
          <!-- App screenshot banner -->
          <tr>
            <td style="padding:0;">
              <img src="${appUrl}/icon-512.png" alt="StudyBuddy AI" style="width:100%;display:block;max-height:120px;object-fit:cover;" />
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px 24px;">
              <p style="margin:0 0 16px;font-size:16px;color:#1f2937;font-weight:600;">${opts.greeting}</p>
              <div style="font-size:14px;color:#4b5563;line-height:1.6;">
                ${opts.bodyHtml}
              </div>
              ${opts.buttonText && opts.buttonUrl ? `
              <div style="margin:28px 0;text-align:center;">
                <a href="${opts.buttonUrl}" style="display:inline-block;padding:14px 36px;background:linear-gradient(135deg,#4F46E5,#7C3AED);color:#ffffff;text-decoration:none;border-radius:50px;font-size:14px;font-weight:bold;box-shadow:0 4px 12px rgba(79,70,229,0.3);">
                  ${opts.buttonText}
                </a>
              </div>` : ""}
              ${opts.footer ? `<div style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af;line-height:1.5;">${opts.footer}</div>` : ""}
            </td>
          </tr>
        </table>
        <p style="margin:16px 0 0;color:#9ca3af;font-size:11px;">© 2026 StudyBuddy AI · Nairobi, Kenya</p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Forgot password email — contains a reset link.
 */
export function forgotPasswordEmail(opts: {
  name: string | null;
  email: string;
  resetUrl: string;
}): { subject: string; html: string } {
  return {
    subject: "🔐 Reset your StudyBuddy AI password",
    html: emailShell({
      title: "Reset Password",
      greeting: `Hi ${opts.name || "there"}!`,
      bodyHtml: `
        <p>We received a request to reset your password for your StudyBuddy AI account.</p>
        <p>Click the button below to set a new password. This link will expire in <strong>1 hour</strong>.</p>
        <p style="background:#FEF3C7;border:1px solid #FCD34D;border-radius:12px;padding:12px;font-size:13px;color:#92400E;margin:16px 0;">
          🔒 If you didn't request this, you can safely ignore this email — your password won't change.
        </p>
      `,
      buttonText: "Reset my password",
      buttonUrl: opts.resetUrl,
      footer: `This email was sent to ${opts.email} because a password reset was requested.`,
    }),
  };
}

/**
 * Email verification OTP — sent on signup.
 */
export function emailVerificationOtp(opts: {
  name: string | null;
  email: string;
  otp: string;
}): { subject: string; html: string } {
  return {
    subject: "✅ Verify your StudyBuddy AI email",
    html: emailShell({
      title: "Verify Email",
      greeting: `Welcome${opts.name ? `, ${opts.name}` : ""}! 🎉`,
      bodyHtml: `
        <p>Thank you for joining StudyBuddy AI! Please verify your email address to complete your registration.</p>
        <div style="text-align:center;margin:24px 0;">
          <div style="display:inline-block;background:linear-gradient(135deg,#4F46E5,#7C3AED);padding:20px 40px;border-radius:16px;">
            <span style="font-size:32px;font-weight:bold;color:#ffffff;letter-spacing:8px;font-family:'Courier New',monospace;">${opts.otp}</span>
          </div>
        </div>
        <p>Enter this 6-digit code in the app to verify your email. This code expires in <strong>10 minutes</strong>.</p>
      `,
      footer: `This email was sent to ${opts.email}. If you didn't create an account, please ignore this email.`,
    }),
  };
}

/**
 * Family mode child confirmation OTP — sent to parent when they register children.
 */
export function familyChildConfirmationOtp(opts: {
  parentName: string | null;
  parentEmail: string;
  childName: string;
  otp: string;
}): { subject: string; html: string } {
  return {
    subject: `👶 Confirm ${opts.childName}'s StudyBuddy account`,
    html: emailShell({
      title: "Confirm Child Account",
      greeting: `Hello${opts.parentName ? `, ${opts.parentName}` : ""}!`,
      bodyHtml: `
        <p>You're setting up a StudyBuddy AI account for your child <strong>${opts.childName}</strong>.</p>
        <p>To confirm that you are the parent/guardian and authorize this account, please enter the code below:</p>
        <div style="text-align:center;margin:24px 0;">
          <div style="display:inline-block;background:linear-gradient(135deg,#7C3AED,#4F46E5);padding:20px 40px;border-radius:16px;">
            <span style="font-size:32px;font-weight:bold;color:#ffffff;letter-spacing:8px;font-family:'Courier New',monospace;">${opts.otp}</span>
          </div>
        </div>
        <p>This code expires in <strong>10 minutes</strong>. Enter it in the app to confirm ${opts.childName}'s account.</p>
        <p style="background:#DBEAFE;border:1px solid #93C5FD;border-radius:12px;padding:12px;font-size:13px;color:#1E40AF;margin:16px 0;">
          👨‍👩‍👧‍👦 Once confirmed, ${opts.childName} will have their own private learning room with their own progress, quizzes, and AI tutor — all managed by you.
        </p>
      `,
      footer: `This email was sent to ${opts.parentEmail}. If you didn't request this, please ignore this email.`,
    }),
  };
}

/**
 * Admin notification — new user registered.
 */
export function newUserNotification(opts: {
  userName: string | null;
  userEmail: string;
  userPhone: string | null;
  grade: string | null;
  role: string;
}): { subject: string; html: string } {
  return {
    subject: `👤 New user registered: ${opts.userEmail}`,
    html: emailShell({
      title: "New User",
      greeting: "Admin notification",
      bodyHtml: `
        <p>A new user has registered on StudyBuddy AI:</p>
        <table style="width:100%;font-size:14px;color:#4b5563;margin:16px 0;">
          <tr><td style="padding:4px 0;font-weight:600;color:#1f2937;">Name:</td><td style="padding:4px 0;">${opts.userName ?? "—"}</td></tr>
          <tr><td style="padding:4px 0;font-weight:600;color:#1f2937;">Email:</td><td style="padding:4px 0;">${opts.userEmail}</td></tr>
          <tr><td style="padding:4px 0;font-weight:600;color:#1f2937;">Phone:</td><td style="padding:4px 0;">${opts.userPhone ?? "—"}</td></tr>
          <tr><td style="padding:4px 0;font-weight:600;color:#1f2937;">Grade:</td><td style="padding:4px 0;">${opts.grade ?? "—"}</td></tr>
          <tr><td style="padding:4px 0;font-weight:600;color:#1f2937;">Role:</td><td style="padding:4px 0;">${opts.role}</td></tr>
        </table>
      `,
      footer: "This is an automated notification from StudyBuddy AI.",
    }),
  };
}

/**
 * Admin notification — new family registered.
 */
export function newFamilyNotification(opts: {
  parentEmail: string;
  childCount: number;
  children: Array<{ name: string; username: string }>;
}): { subject: string; html: string } {
  const childRows = opts.children.map((c) => `
    <tr>
      <td style="padding:6px 0;font-weight:600;color:#1f2937;">${c.name}</td>
      <td style="padding:6px 0;color:#6b7280;">@${c.username}</td>
    </tr>
  `).join("");

  return {
    subject: `👨‍👩‍👧‍👦 New family registered: ${opts.childCount} children`,
    html: emailShell({
      title: "New Family",
      greeting: "Admin notification",
      bodyHtml: `
        <p>A new Family Mode account has been registered:</p>
        <table style="width:100%;font-size:14px;color:#4b5563;margin:16px 0;">
          <tr><td style="padding:4px 0;font-weight:600;color:#1f2937;">Parent email:</td><td style="padding:4px 0;">${opts.parentEmail}</td></tr>
          <tr><td style="padding:4px 0;font-weight:600;color:#1f2937;">Children:</td><td style="padding:4px 0;">${opts.childCount}</td></tr>
        </table>
        <p style="font-weight:600;color:#1f2937;margin:16px 0 8px;">Children:</p>
        <table style="width:100%;font-size:14px;color:#4b5563;">
          ${childRows}
        </table>
      `,
      footer: "This is an automated notification from StudyBuddy AI.",
    }),
  };
}
