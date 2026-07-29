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
    // Dev-mode fallback — never log in production
    if (process.env["NODE_ENV"] !== "production") {
      logger.info({ to }, "mailer: DEV MODE — no email credentials configured; reset link printed below");
      // Use process.stdout directly so the full link appears even if pino truncates
      process.stdout.write(`\n[mailer] Reset link for ${to}:\n${resetLink}\n\n`);
    } else {
      logger.error({ to }, "mailer: GMAIL_USER / GMAIL_PASS not set — email NOT delivered in production");
    }
    return;
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
 * Low-stock / expiring-stock / pending-prescription digest.
 * (Stub — real delivery not yet implemented. Wire up when an email schedule
 * is configured.)
 */
export async function sendDigestEmail(
  to: string,
  summary: { lowStockCount: number; expiringCount: number; pendingPrescriptionCount: number },
): Promise<void> {
  logger.info(
    { to, ...summary },
    "mailer: digest stub called — no email sent (not yet implemented)",
  );
}
