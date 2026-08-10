import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { isEmailConfigured, sendMagicLink } from "@/lib/email";
import { resolveAppBaseUrl } from "@/lib/auth-policy";
import { prisma } from "@/lib/prisma";
import { hashAuthToken } from "@/lib/auth-token";

const genericMessage = "Als dit e-mailadres bekend is, ontvang je een loginlink.";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = String(body?.email || "").toLowerCase().trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Vul een geldig e-mailadres in" }, { status: 400 });
    }

    if (!isEmailConfigured()) {
      return NextResponse.json(
        { error: "Inloggen per e-mail is tijdelijk niet beschikbaar" },
        { status: 503 },
      );
    }

    const user = await prisma.user.findFirst({ where: { email, active: true } });
    if (!user) return NextResponse.json({ ok: true, message: genericMessage });

    const baseUrl = resolveAppBaseUrl({
      nodeEnv: process.env.NODE_ENV,
      configuredBaseUrl: process.env.APP_BASE_URL,
      requestUrl: request.url,
    });
    const token = randomUUID();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    const verifyUrl = `${baseUrl}/auth/verify?token=${encodeURIComponent(token)}`;

    let link: { id: string } | null | undefined;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        link = await prisma.$transaction(async (tx) => {
          const recentLink = await tx.magicLink.findFirst({
            where: {
              userId: user.id,
              used: false,
              createdAt: { gte: new Date(Date.now() - 2 * 60 * 1000) },
            },
            select: { id: true },
          });
          if (recentLink) return null;
          return tx.magicLink.create({
            data: { userId: user.id, token: hashAuthToken(token), expiresAt },
            select: { id: true },
          });
        }, { isolationLevel: "Serializable" });
        break;
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034" && attempt === 0) {
          continue;
        }
        throw error;
      }
    }
    if (!link) return NextResponse.json({ ok: true, message: genericMessage });

    try {
      const sent = await sendMagicLink(user.email, verifyUrl);
      if (!sent) throw new Error("SMTP_NOT_CONFIGURED");
    } catch (error) {
      await prisma.magicLink.deleteMany({ where: { id: link.id, used: false } });
      console.error("Magic-link delivery failed:", error instanceof Error ? error.message : "Unknown");
      return NextResponse.json(
        { error: "De loginlink kon niet worden verzonden. Probeer het later opnieuw." },
        { status: 503 },
      );
    }

    return NextResponse.json({ ok: true, message: genericMessage });
  } catch (error: unknown) {
    console.error("Login error:", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "Interne fout" }, { status: 500 });
  }
}
