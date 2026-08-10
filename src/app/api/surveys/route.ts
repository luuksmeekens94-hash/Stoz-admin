import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function GET() {
  const session = await getSession();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  const campaigns = await prisma.surveyCampaign.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      invitations: {
        include: { response: true, deliveries: { orderBy: { attemptedAt: "desc" }, take: 1 } },
      },
    },
  });
  return NextResponse.json(campaigns);
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const closesAt = new Date(body?.closesAt);
    const rawRecipients = Array.isArray(body?.recipients) ? body.recipients : [];

    if (name.length < 3 || name.length > 120) {
      return NextResponse.json({ error: "Gebruik een campagnenaam van 3–120 tekens." }, { status: 400 });
    }
    if (Number.isNaN(closesAt.getTime()) || closesAt <= new Date()) {
      return NextResponse.json({ error: "Kies een toekomstige sluitingsdatum." }, { status: 400 });
    }
    if (rawRecipients.length < 1 || rawRecipients.length > 30) {
      return NextResponse.json({ error: "Voeg 1–30 ontvangers toe." }, { status: 400 });
    }

    const recipients = rawRecipients.map((recipient: unknown) => {
      const value = recipient && typeof recipient === "object" ? (recipient as Record<string, unknown>) : {};
      return {
        name: typeof value.name === "string" ? value.name.trim() : "",
        email: typeof value.email === "string" ? value.email.trim().toLowerCase() : "",
        therapistId: typeof value.therapistId === "string" && value.therapistId ? value.therapistId : null,
      };
    });
    if (recipients.some((recipient: { name: string; email: string }) => recipient.name.length < 2 || !emailPattern.test(recipient.email))) {
      return NextResponse.json({ error: "Controleer naam en e-mailadres van iedere ontvanger." }, { status: 400 });
    }
    if (new Set(recipients.map((recipient: { email: string }) => recipient.email)).size !== recipients.length) {
      return NextResponse.json({ error: "Een e-mailadres kan maar één keer in een campagne staan." }, { status: 400 });
    }

    const campaign = await prisma.surveyCampaign.create({
      data: {
        name,
        closesAt,
        createdById: session.user.id,
        invitations: {
          create: recipients.map((recipient: { name: string; email: string; therapistId: string | null }) => ({
            recipientName: recipient.name,
            recipientEmail: recipient.email,
            therapistId: recipient.therapistId,
            expiresAt: closesAt,
          })),
        },
      },
      include: { invitations: true },
    });

    return NextResponse.json(campaign, { status: 201 });
  } catch (error) {
    console.error("Survey campaign create error:", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Campagne kon niet worden aangemaakt." }, { status: 500 });
  }
}
