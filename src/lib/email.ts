import nodemailer from "nodemailer";

export interface TransactionalEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

function smtpPort() {
  const parsed = Number(process.env.SMTP_PORT || "587");
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 587;
}

export function isEmailConfigured() {
  return Boolean(
    process.env.SMTP_HOST &&
      process.env.SMTP_USER &&
      (process.env.SMTP_PASSWORD || process.env.SMTP_PASS) &&
      (process.env.SMTP_FROM || process.env.SMTP_USER),
  );
}

function createTransporter() {
  if (!isEmailConfigured()) {
    throw new Error("SMTP_NOT_CONFIGURED");
  }

  const port = smtpPort();
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD || process.env.SMTP_PASS,
    },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });
}

function fromAddress() {
  return process.env.SMTP_FROM || process.env.SMTP_USER || "";
}

export async function sendTransactionalEmail(message: TransactionalEmail) {
  const transporter = createTransporter();
  const result = await transporter.sendMail({
    from: `"STOZ Hybride Begrip · Fy-fit" <${fromAddress()}>`,
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });

  return {
    messageId: result.messageId || null,
    accepted: Array.isArray(result.accepted) ? result.accepted.map(String) : [],
    rejected: Array.isArray(result.rejected) ? result.rejected.map(String) : [],
  };
}

export async function sendMagicLink(email: string, verifyUrl: string) {
  if (!isEmailConfigured()) {
    console.log(`[DEV] Magic link aangemaakt voor ${email}; SMTP is niet geconfigureerd.`);
    return false;
  }

  await sendTransactionalEmail({
    to: email,
    subject: "Inloggen bij STOZ Projectadministratie",
    text: `Klik op deze link om in te loggen: ${verifyUrl}\n\nDeze link is 15 minuten geldig.\n\nAls je deze link niet hebt aangevraagd, kun je deze e-mail negeren.`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #122E54; padding: 20px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 22px;">STOZ Projectadministratie</h1>
          <p style="color: #e5e7eb; margin: 5px 0 0;">Hybride begrip - Fy-fit</p>
        </div>
        <div style="padding: 30px; background: #f9fafb;">
          <h2 style="color: #1f2937;">Inloggen</h2>
          <p style="color: #4b5563;">Klik op de knop hieronder om veilig in te loggen:</p>
          <a href="${verifyUrl}" style="display: inline-block; background: #122E54; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold; margin: 15px 0;">Inloggen</a>
          <p style="color: #6b7280; font-size: 13px;">Deze link is 15 minuten geldig.</p>
          <p style="color: #6b7280; font-size: 13px;">Als je deze link niet hebt aangevraagd, kun je deze e-mail negeren.</p>
        </div>
      </div>
    `,
  });
  return true;
}
