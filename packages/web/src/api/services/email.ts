import { Resend } from "resend";

/**
 * Transactional email.
 *
 * Resend is used when `RESEND_API_KEY` is present. Without a key we do not throw
 * — the message is logged to the server console instead, so local development
 * and preview environments still work end-to-end (the reset link is readable in
 * the dev log). Set the key in `.env` to send real mail.
 */
const apiKey = process.env.RESEND_API_KEY;
const resend = apiKey ? new Resend(apiKey) : null;

const FROM = process.env.EMAIL_FROM ?? "OrbitL <onboarding@resend.dev>";

export interface SendEmailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export async function sendEmail({ to, subject, text, html }: SendEmailOptions) {
  if (!resend) {
    console.info(
      `[email:dev] no RESEND_API_KEY set — email not sent.\n  to: ${to}\n  subject: ${subject}\n  body: ${text}`,
    );
    return { id: "dev-noop" };
  }
  const { data, error } = await resend.emails.send({
    from: FROM,
    to: [to],
    subject,
    text,
    ...(html ? { html } : {}),
  });
  if (error) throw new Error(`Email failed: ${error.message}`);
  return data;
}

/** Shared shell so every OrbitL email looks like the product. */
function layout(heading: string, body: string, cta?: { label: string; url: string }) {
  return `<!doctype html><html><body style="margin:0;padding:32px 16px;background:#080B1A;font-family:Inter,Segoe UI,Helvetica,Arial,sans-serif;color:#F9FAFB">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="100%" style="max-width:520px;background:#141A33;border:1px solid rgba(150,160,220,.18);border-radius:16px;padding:32px">
      <tr><td style="font-size:18px;font-weight:700;padding-bottom:24px">OrbitL</td></tr>
      <tr><td style="font-size:22px;font-weight:700;padding-bottom:12px">${heading}</td></tr>
      <tr><td style="font-size:14px;line-height:22px;color:#98A2C0">${body}</td></tr>
      ${
        cta
          ? `<tr><td style="padding-top:24px"><a href="${cta.url}" style="display:inline-block;background:#2563EB;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 20px;border-radius:12px">${cta.label}</a></td></tr>
             <tr><td style="padding-top:20px;font-size:12px;color:#98A2C0;word-break:break-all">Or paste this link into your browser:<br>${cta.url}</td></tr>`
          : ""
      }
      <tr><td style="padding-top:28px;border-top:1px solid rgba(150,160,220,.14);font-size:12px;color:#98A2C0">You're receiving this because someone used this address on OrbitL. If it wasn't you, you can safely ignore it.</td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

export async function sendPasswordResetEmail(to: string, name: string | null, url: string) {
  const who = name ? name.split(" ")[0] : "there";
  return sendEmail({
    to,
    subject: "Reset your OrbitL password",
    text: `Hi ${who},\n\nSomeone asked to reset the password for your OrbitL account. Open the link below to choose a new one. It expires in 1 hour.\n\n${url}\n\nIf you didn't request this, ignore this email — your password won't change.`,
    html: layout(
      `Reset your password`,
      `Hi ${who}, someone asked to reset the password for your OrbitL account. Choose a new one with the button below — the link expires in <strong style="color:#F9FAFB">1 hour</strong>. If you didn't request this, nothing happens if you ignore it.`,
      { label: "Choose a new password", url },
    ),
  });
}

export async function sendVerificationEmail(to: string, name: string | null, url: string) {
  const who = name ? name.split(" ")[0] : "there";
  return sendEmail({
    to,
    subject: "Confirm your email for OrbitL",
    text: `Hi ${who},\n\nConfirm this email address so we can keep your OrbitL account secure and send you password resets and streak reminders.\n\n${url}\n\nThe link expires in 24 hours.`,
    html: layout(
      "Confirm your email",
      `Hi ${who}, confirm this address so we can secure your OrbitL account and send you password resets and streak reminders. The link expires in <strong style="color:#F9FAFB">24 hours</strong>.`,
      { label: "Confirm my email", url },
    ),
  });
}

export async function sendWelcomeEmail(to: string, name: string | null, appUrl: string) {
  const who = name ? name.split(" ")[0] : "there";
  return sendEmail({
    to,
    subject: "Welcome to OrbitL",
    text: `Hi ${who},\n\nWelcome to OrbitL. Three things worth doing first:\n\n1. Add a subject and a few concepts — that becomes your knowledge graph.\n2. Run one focus session. Study is the only thing that moves your streak.\n3. Open Smart Insights and run the coach — it tells you the highest-leverage thing to study next.\n\n${appUrl}\n\nHappy studying.`,
    html: layout(
      `Welcome to OrbitL, ${who}`,
      `Your workspace starts empty on purpose — everything you see will be your own work. Three things worth doing first:
       <br><br>
       <strong style="color:#F9FAFB">1.</strong> Add a subject and a few concepts — that becomes your knowledge graph.<br>
       <strong style="color:#F9FAFB">2.</strong> Run one focus session. Logged study is the only thing that moves your streak.<br>
       <strong style="color:#F9FAFB">3.</strong> Open Smart Insights and run the coach — it tells you the highest-leverage thing to study next.`,
      { label: "Open OrbitL", url: appUrl },
    ),
  });
}

export async function sendStreakReminderEmail(
  to: string,
  name: string | null,
  streak: number,
  appUrl: string,
) {
  const who = name ? name.split(" ")[0] : "there";
  const day = streak === 1 ? "1 day" : `${streak} days`;
  return sendEmail({
    to,
    subject: `Keep your ${day} streak alive`,
    text: `Hi ${who},\n\nYou haven't logged any study today and your ${day} streak resets at midnight. A single focus session keeps it.\n\n${appUrl}/focus\n\nTurn these off any time in Settings.`,
    html: layout(
      `Your ${day} streak resets at midnight`,
      `Hi ${who}, you haven't logged any study today. One focus session — even a short one — keeps the streak alive. Quizzes, flashcard reviews and notes count too.`,
      { label: "Start a focus session", url: `${appUrl}/focus` },
    ),
  });
}
