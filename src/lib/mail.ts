import nodemailer from "nodemailer";
import { PASSCODE_TTL_MIN } from "./auth";

/**
 * Passcodes go out over SMTP. Works with Gmail (App Password), Resend, Postmark,
 * SendGrid, or any other provider that offers SMTP credentials. See .env.example.
 */
export function mailConfigured(): boolean {
  return Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
}

export async function sendPasscode(to: string, code: string): Promise<void> {
  if (!mailConfigured()) {
    if (process.env.NODE_ENV === "production") throw new Error("Email is not configured (SMTP_USER / SMTP_PASS)");
    console.log(`\n[mRUST] Passcode for ${to}: ${code}\n`);
    return;
  }
  const port = Number(process.env.SMTP_PORT ?? 465);
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? "smtp.gmail.com",
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  await transport.sendMail({
    from: process.env.MAIL_FROM ?? `"mRUST Scorer" <${process.env.SMTP_USER}>`,
    to,
    subject: `${code} is your mRUST Scorer passcode`,
    text: `Your mRUST Scorer passcode is ${code}\n\nIt expires in ${PASSCODE_TTL_MIN} minutes. If you didn't request it, ignore this email.`,
    html: `<p style="font-family:system-ui,sans-serif">Your mRUST Scorer passcode is</p>
<p style="font-family:ui-monospace,monospace;font-size:28px;letter-spacing:6px;margin:8px 0 16px">${code}</p>
<p style="font-family:system-ui,sans-serif;color:#666">It expires in ${PASSCODE_TTL_MIN} minutes. If you didn't request it, ignore this email.</p>`,
  });
}
