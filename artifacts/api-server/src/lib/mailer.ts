/**
 * PharmaCore mailer — production-ready email delivery via Gmail SMTP (Nodemailer).
 *
 * Required environment variables for real delivery:
 *   GMAIL_USER   – the Gmail address used to send (e.g. noreply@yourpharmacy.com)
 *   GMAIL_PASS   – an App Password generated at https://myaccount.google.com/apppasswords
 *                  (NOT your regular Gmail password — 2-FA must be enabled on the account)
 *   APP_URL      – public base URL of the web front-end (e.g. https://pharmacore.example.com)
 *
 * When GMAIL_USER / GMAIL_PASS are absent (local dev), sending is skipped and
 * the link is printed to the server console so you can test the full reset flow
 * without any email credentials.
 *
 * Security contract:
 *   • Tokens and reset links are NEVER logged at INFO level or above.
 *   • Errors thrown by sendMail() propagate to the caller — the route catches
 *     them and continues so the HTTP response is always returned.
 *   • Credentials are read from env vars; never hard-coded.
 */

import nodemailer from "nodemailer";
import { logger } from "./logger.js";

// ── Transporter ───────────────────────────────────────────────────────────────

function createTransporter() {
  const user = process.env["GMAIL_USER"];
  const pass = process.env["GMAIL_PASS"];

  if (!user || !pass) {
    return null; // dev / unconfigured — caller falls back to console output
  }

  return nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });
}

// ── HTML template ─────────────────────────────────────────────────────────────

function buildResetHtml(resetLink: string): string {
  // Inline styles — required for broad email-client compatibility.
  // No external CSS or web fonts are used.
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Reset Your Password – PharmaCore</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
         style="background-color:#f1f5f9;padding:40px 16px;">
    <tr>
      <td align="center">

        <!-- Card -->
        <table width="600" cellpadding="0" cellspacing="0" role="presentation"
               style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;
                      overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.08);">

          <!-- ── Header ─────────────────────────────────────────────────── -->
          <tr>
            <td style="background-color:#0f766e;padding:36px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:700;
                         letter-spacing:-0.5px;line-height:1.2;">PharmaCore</h1>
              <p style="margin:8px 0 0;color:#99f6e4;font-size:13px;letter-spacing:0.3px;">
                Smart Pharmacy. Better Care.
              </p>
            </td>
          </tr>

          <!-- ── Body ──────────────────────────────────────────────────── -->
          <tr>
            <td style="padding:40px 40px 32px;">

              <h2 style="margin:0 0 20px;color:#0f172a;font-size:22px;font-weight:700;">
                Reset Your Password
              </h2>

              <p style="margin:0 0 10px;color:#334155;font-size:15px;line-height:1.65;">
                Hi there,
              </p>
              <p style="margin:0 0 28px;color:#334155;font-size:15px;line-height:1.65;">
                We received a request to reset the password for your PharmaCore account.
                Click the button below to choose a new password.
              </p>

              <!-- CTA button — uses a table so Outlook renders it correctly -->
              <table cellpadding="0" cellspacing="0" role="presentation"
                     style="margin:0 0 28px;">
                <tr>
                  <td style="background-color:#0f766e;border-radius:8px;">
                    <a href="${resetLink}"
                       style="display:inline-block;padding:15px 36px;color:#ffffff;
                              font-size:16px;font-weight:700;text-decoration:none;
                              border-radius:8px;letter-spacing:0.1px;">
                      Reset Password
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Plain-text link fallback -->
              <p style="margin:0 0 6px;color:#64748b;font-size:13px;">
                Or copy and paste this link into your browser:
              </p>
              <p style="margin:0 0 28px;word-break:break-all;">
                <a href="${resetLink}"
                   style="color:#0f766e;font-size:13px;text-decoration:underline;">
                  ${resetLink}
                </a>
              </p>

              <!-- Expiry warning -->
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
                     style="margin-bottom:24px;">
                <tr>
                  <td style="background-color:#fefce8;border:1px solid #fde68a;
                             border-radius:8px;padding:14px 18px;">
                    <p style="margin:0;color:#92400e;font-size:13px;line-height:1.55;">
                      ⏱ <strong>This link expires in 1 hour.</strong>
                      After that, you can request a new one from the login page.
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Security notice -->
              <p style="margin:0;color:#94a3b8;font-size:13px;line-height:1.6;">
                If you didn't request a password reset, you can safely ignore this email.
                Your password will remain unchanged and your account is secure.
              </p>

            </td>
          </tr>

          <!-- ── Footer ─────────────────────────────────────────────────── -->
          <tr>
            <td style="background-color:#f8fafc;padding:22px 40px;
                       border-top:1px solid #e2e8f0;text-align:center;">
              <p style="margin:0;color:#94a3b8;font-size:12px;">
                © PharmaCore. All rights reserved.
              </p>
              <p style="margin:6px 0 0;color:#cbd5e1;font-size:11px;">
                This is an automated message — please do not reply to this email.
              </p>
            </td>
          </tr>

        </table>
        <!-- /Card -->

      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ── Plain-text template ───────────────────────────────────────────────────────

function buildResetText(resetLink: string): string {
  return `Reset Your Password – PharmaCore
==========================================

Hi there,

We received a request to reset the password for your PharmaCore account.

Click the link below (or paste it into your browser) to set a new password:

${resetLink}

This link expires in 1 hour. After it expires you can request a new one
from the login page.

If you did not request a password reset, please ignore this email.
Your password will remain unchanged and your account is secure.

--
© PharmaCore. All rights reserved.
This is an automated message — please do not reply.
`;
}

// ── Digest templates ──────────────────────────────────────────────────────────

function buildDigestStatCell(count: number, label: string, color: string): string {
  return `
    <td width="33%" style="padding:8px;">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
             style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;">
        <tr>
          <td align="center" style="padding:14px 8px;">
            <p style="margin:0;font-size:32px;font-weight:800;line-height:1;color:${color};">${count}</p>
            <p style="margin:8px 0 0;color:#64748b;font-size:12px;line-height:1.35;">${label}</p>
          </td>
        </tr>
      </table>
    </td>`;
}

function buildDigestHtml(summary: {
  lowStockCount: number;
  expiringCount: number;
  pendingPrescriptionCount: number;
}): string {
  const day = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const attention = (n: number): string =>
    n === 0
      ? "Nothing needs your attention here."
      : `${n === 1 ? "An item" : `${n} items`} need${n === 1 ? "s" : ""} your attention.`;

  const dashboardLink = process.env["APP_URL"];

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>PharmaCore – Daily Operations Digest</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
         style="background-color:#f1f5f9;padding:40px 16px;">
    <tr>
      <td align="center">

        <!-- Card -->
        <table width="600" cellpadding="0" cellspacing="0" role="presentation"
               style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;
                      overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.08);">

          <!-- ── Header ─────────────────────────────────────────────────── -->
          <tr>
            <td style="background-color:#0f766e;padding:36px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:700;
                         letter-spacing:-0.5px;line-height:1.2;">PharmaCore</h1>
              <p style="margin:8px 0 0;color:#99f6e4;font-size:13px;letter-spacing:0.3px;">
                Smart Pharmacy. Better Care.
              </p>
            </td>
          </tr>

          <!-- ── Body ──────────────────────────────────────────────────── -->
          <tr>
            <td style="padding:40px 40px 32px;">

              <h2 style="margin:0 0 6px;color:#0f172a;font-size:22px;font-weight:700;">
                Daily Operations Digest – ${day}
              </h2>
              <p style="margin:0 0 28px;color:#64748b;font-size:13px;">
                Here's a snapshot of your pharmacy right now.
              </p>

              <!-- Stat tiles -->
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
                     style="margin-bottom:28px;">
                <tr>
                  ${buildDigestStatCell(summary.lowStockCount, "Low stock", "#d97706")}
                  ${buildDigestStatCell(summary.expiringCount, "Expiring ≤ 30 days", "#ea580c")}
                  ${buildDigestStatCell(summary.pendingPrescriptionCount, "Pending prescriptions", "#2563eb")}
                </tr>
              </table>

              <p style="margin:0 0 10px;color:#334155;font-size:15px;line-height:1.65;">
                ${attention(summary.lowStockCount)} Low stock: reorder before you run out.
              </p>
              <p style="margin:0 0 10px;color:#334155;font-size:15px;line-height:1.65;">
                ${attention(summary.expiringCount)} Expiring soon: plan markdowns or returns.
              </p>
              <p style="margin:0 0 28px;color:#334155;font-size:15px;line-height:1.65;">
                ${attention(summary.pendingPrescriptionCount)} Pending prescriptions: decide and notify patients.
              </p>

              ${
                dashboardLink
                  ? `<p style="margin:0 0 6px;color:#64748b;font-size:13px;">
                       Open the dashboard for details:
                     </p>
                     <p style="margin:0;">
                       <a href="${dashboardLink}" style="color:#0f766e;font-size:14px;font-weight:600;text-decoration:underline;">
                         ${dashboardLink}
                       </a>
                     </p>`
                  : ""
              }

            </td>
          </tr>

          <!-- ── Footer ─────────────────────────────────────────────────── -->
          <tr>
            <td style="background-color:#f8fafc;padding:22px 40px;
                       border-top:1px solid #e2e8f0;text-align:center;">
              <p style="margin:0;color:#94a3b8;font-size:12px;">
                © PharmaCore. All rights reserved.
              </p>
              <p style="margin:6px 0 0;color:#cbd5e1;font-size:11px;">
                This is an automated message — please do not reply to this email.
              </p>
            </td>
          </tr>

        </table>
        <!-- /Card -->

      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildDigestText(summary: {
  lowStockCount: number;
  expiringCount: number;
  pendingPrescriptionCount: number;
}): string {
  const day = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return `PharmaCore – Daily Operations Digest (${day})
==================================================

Here's a snapshot of your pharmacy right now:

  Low stock:               ${summary.lowStockCount}
  Expiring within 30 days: ${summary.expiringCount}
  Pending prescriptions:   ${summary.pendingPrescriptionCount}

${summary.lowStockCount === 0 ? "" : `Action: ${summary.lowStockCount} low-stock item(s) to reorder.\n`}${summary.expiringCount === 0 ? "" : `Action: ${summary.expiringCount} item(s) expiring soon — plan markdowns or returns.\n`}${summary.pendingPrescriptionCount === 0 ? "" : `Action: ${summary.pendingPrescriptionCount} pending prescription(s) to review.\n`}
--
© PharmaCore. All rights reserved.
This is an automated message — please do not reply.
`;
}

// ── Exported functions ────────────────────────────────────────────────────────

/**
 * Send a password-reset email to the given address.
 *
 * In production (GMAIL_USER + GMAIL_PASS set): delivers via Gmail SMTP.
 * In development (credentials absent): logs a notice to the console only —
 *   the reset link is printed so the flow can be tested without credentials.
 *
 * Throws if the SMTP send fails so callers can handle the error explicitly.
 * The reset link itself is only printed at debug level and only in non-production.
 */
export async function sendPasswordResetEmail(to: string, resetLink: string): Promise<void> {
  const transporter = createTransporter();

  if (!transporter) {
    // Credentials are not configured — this is always a hard error.
    // Set GMAIL_USER and GMAIL_PASS in your environment to enable delivery.
    throw new Error(
      "Email delivery is not configured: GMAIL_USER and GMAIL_PASS environment variables are required.",
    );
  }

  logger.info({ to }, "mailer: sending password-reset email");

  await transporter.sendMail({
    from: `"PharmaCore" <${process.env["GMAIL_USER"]}>`,
    to,
    subject: "Reset Your Password – PharmaCore",
    html: buildResetHtml(resetLink),
    text: buildResetText(resetLink),
  });

  logger.info({ to }, "mailer: password-reset email delivered");
}

/**
 * Send the daily operations digest (low stock / expiring stock / pending
 * prescriptions) to the given address via Gmail SMTP.
 *
 * In production (GMAIL_USER + GMAIL_PASS set): delivers via Gmail SMTP; the
 * digests can be triggered manually from the desktop dashboard or by an
 * external scheduler (e.g. a Vercel Cron) hitting POST /notifications/send-digest.
 *
 * In development (credentials absent): throws so callers know no real
 * delivery happened — the summary is logged at INFO so the flow can be
 * exercised without credentials.
 *
 * Throws if the SMTP send fails so callers can handle the error explicitly.
 */
export async function sendDigestEmail(
  to: string,
  summary: { lowStockCount: number; expiringCount: number; pendingPrescriptionCount: number },
): Promise<void> {
  const transporter = createTransporter();

  if (!transporter) {
    // Credentials are not configured — same contract as password-reset mail.
    throw new Error(
      "Email delivery is not configured: GMAIL_USER and GMAIL_PASS environment variables are required.",
    );
  }

  logger.info({ to, ...summary }, "mailer: sending operations digest");

  await transporter.sendMail({
    from: `"PharmaCore" <${process.env["GMAIL_USER"]}>`,
    to,
    subject: "PharmaCore – Daily Operations Digest",
    html: buildDigestHtml(summary),
    text: buildDigestText(summary),
  });

  logger.info({ to, ...summary }, "mailer: operations digest delivered");
}
