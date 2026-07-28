/**
 * No email provider is configured yet — sending currently just logs the
 * link to the server console, so password reset WORKS END-TO-END for
 * testing/local use, but nothing is actually emailed to the user yet.
 *
 * To wire up real delivery, replace the body of sendPasswordResetEmail with
 * a call to whichever provider you set up (Resend, SendGrid, AWS SES, plain
 * SMTP via nodemailer, etc.) using credentials from environment variables —
 * never hardcode API keys here. Example with Resend:
 *
 *   const resend = new Resend(process.env["RESEND_API_KEY"]);
 *   await resend.emails.send({
 *     from: "Pharmacy <no-reply@yourdomain.com>",
 *     to,
 *     subject: "Reset your password",
 *     html: `<p>Click to reset: <a href="${resetLink}">${resetLink}</a></p>`,
 *   });
 */
export async function sendPasswordResetEmail(to: string, resetLink: string): Promise<void> {
  console.log(`[mailer] Password reset requested for ${to}`);
  console.log(`[mailer] Reset link (would be emailed): ${resetLink}`);
}

/**
 * Low-stock / expiring-stock / pending-prescription digest — same "logs
 * instead of sending" situation as above until a real provider is wired up.
 */
export async function sendDigestEmail(to: string, summary: { lowStockCount: number; expiringCount: number; pendingPrescriptionCount: number }): Promise<void> {
  console.log(`[mailer] Digest requested for ${to}`);
  console.log(`[mailer] Would send: ${summary.lowStockCount} low-stock, ${summary.expiringCount} expiring, ${summary.pendingPrescriptionCount} prescriptions pending verification.`);
}
