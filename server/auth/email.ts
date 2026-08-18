import { Resend } from "resend";
import { authConfig } from "../lib/authConfig";

const resendClient = authConfig.resendApiKey ? new Resend(authConfig.resendApiKey) : null;

async function sendEmail(to: string, subject: string, html: string) {
  if (!resendClient || !authConfig.resendFrom) {
    console.warn("[auth] Resend not configured; skipping email for", to);
    return;
  }

  await resendClient.emails.send({
    from: authConfig.resendFrom,
    to,
    subject,
    html,
  });
}

export async function sendVerifyEmail(email: string, code: string) {
  await sendEmail(
    email,
    "Verify your finances account",
    `<p>Your verification code is:</p><p style=\"font-size:28px;font-weight:700;letter-spacing:0.18em;\">${code}</p><p>Enter this code in the app within 30 minutes.</p>`
  );
}

export async function sendPasswordResetEmail(email: string, code: string) {
  await sendEmail(
    email,
    "Reset your finances password",
    `<p>Your password reset code is:</p><p style=\"font-size:28px;font-weight:700;letter-spacing:0.18em;\">${code}</p><p>Enter this code in the app within 30 minutes.</p>`
  );
}
