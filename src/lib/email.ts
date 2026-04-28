import nodemailer from "nodemailer";

function getTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || "localhost",
    port: parseInt(process.env.SMTP_PORT || "587"),
    secure: false,
    auth: {
      user: process.env.SMTP_USER || "",
      pass: process.env.SMTP_PASS || "",
    },
  });
}

export async function sendMagicLinkEmail(email: string, token: string) {
  const baseUrl = process.env.NEXTAUTH_URL || process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000";
  const magicUrl = `${baseUrl}/auth/verify?token=${token}`;

  if (process.env.DEV_MODE === "true") {
    console.log(`\n🔗 Magic link for ${email}:\n${magicUrl}\n`);
    return;
  }

  const transporter = getTransporter();
  await transporter.sendMail({
    from: process.env.SMTP_FROM || "noreply@stoz-admin.nl",
    to: email,
    subject: "Inloggen STOZ Administratie",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1e40af;">STOZ Projectadministratie</h2>
        <p>Klik op de onderstaande link om in te loggen:</p>
        <a href="${magicUrl}" style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin: 16px 0;">
          Inloggen
        </a>
        <p style="color: #6b7280; font-size: 14px;">
          Deze link is 15 minuten geldig en kan maar één keer gebruikt worden.
        </p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="color: #9ca3af; font-size: 12px;">
          Hybride Begrip - STOZ Projectadministratie
        </p>
      </div>
    `,
  });
}
