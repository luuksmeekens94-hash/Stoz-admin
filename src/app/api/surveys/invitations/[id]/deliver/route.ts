import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { resolveAppBaseUrl } from "@/lib/auth-policy";
import { isEmailConfigured, sendTransactionalEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import {
  buildTherapistSurveyEmail,
  createSurveyToken,
  hashSurveyToken,
} from "@/lib/therapist-survey";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await getSession();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  let body: { action?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ongeldige JSON." }, { status: 400 });
  }
  const action = body?.action;
  if (action !== "PREPARE" && action !== "SEND") {
    return NextResponse.json({ error: "Kies link maken of e-mail verzenden." }, { status: 400 });
  }

  const invitation = await prisma.surveyInvitation.findUnique({
    where: { id },
    include: { campaign: true, response: true },
  });
  if (!invitation) return NextResponse.json({ error: "Uitnodiging niet gevonden." }, { status: 404 });
  if (invitation.campaign.status !== "ACTIVE") {
    return NextResponse.json({ error: "Activeer de campagne voordat je uitnodigt." }, { status: 409 });
  }
  if (invitation.response) {
    return NextResponse.json({ error: "Deze meting is al ingevuld." }, { status: 409 });
  }
  const now = new Date();
  if (invitation.revokedAt || invitation.expiresAt <= now) {
    return NextResponse.json({ error: "Deze uitnodiging is ingetrokken of verlopen." }, { status: 410 });
  }

  let baseUrl: string;
  try {
    baseUrl = resolveAppBaseUrl({
      nodeEnv: process.env.NODE_ENV,
      configuredBaseUrl: process.env.APP_BASE_URL,
      requestUrl: request.url,
    });
  } catch {
    return NextResponse.json({ error: "Stel een geldige APP_BASE_URL in voordat je uitnodigingslinks maakt." }, { status: 503 });
  }

  if (action === "SEND" && !isEmailConfigured()) {
    await prisma.surveyDelivery.create({
      data: {
        invitationId: invitation.id,
        status: "FAILED",
        provider: "SMTP",
        failureCode: "SMTP_NOT_CONFIGURED",
        failureMessage: "SMTP-configuratie ontbreekt; er is geen e-mail verzonden.",
      },
    });
    return NextResponse.json({ error: "E-mail is nog niet geconfigureerd; er is niets verzonden." }, { status: 503 });
  }

  const token = createSurveyToken();
  const tokenHash = hashSurveyToken(token);
  const lockAt = new Date();
  const staleBefore = new Date(lockAt.getTime() - 5 * 60 * 1000);
  const claimed = await prisma.surveyInvitation.updateMany({
    where: {
      id: invitation.id,
      revokedAt: null,
      expiresAt: { gt: lockAt },
      response: { is: null },
      campaign: { status: "ACTIVE" },
      OR: [{ deliveryLockedAt: null }, { deliveryLockedAt: { lt: staleBefore } }],
    },
    data: { deliveryLockedAt: lockAt },
  });
  if (claimed.count !== 1) {
    return NextResponse.json(
      { error: "Deze uitnodiging wordt al verwerkt of is intussen niet meer actief." },
      { status: 409 },
    );
  }

  const surveyUrl = `${baseUrl}/vragenlijst/${token}`;
  if (action === "PREPARE") {
    await prisma.$transaction([
      prisma.surveyInvitation.updateMany({
        where: { id: invitation.id, deliveryLockedAt: lockAt },
        data: { tokenHash, deliveryLockedAt: null },
      }),
      prisma.surveyDelivery.create({
        data: { invitationId: invitation.id, status: "PREPARED", provider: "MANUAL_LINK" },
      }),
    ]);
    return NextResponse.json({ ok: true, surveyUrl, status: "PREPARED" });
  }

  const message = buildTherapistSurveyEmail({
    recipientName: invitation.recipientName,
    campaignName: invitation.campaign.name,
    surveyUrl,
    expiresAt: invitation.expiresAt,
  });

  let result: Awaited<ReturnType<typeof sendTransactionalEmail>>;
  try {
    result = await sendTransactionalEmail({ to: invitation.recipientEmail, ...message });
    if (result.accepted.length === 0 || result.rejected.length > 0) {
      throw new Error("SMTP_RECIPIENT_NOT_ACCEPTED");
    }
  } catch (error) {
    const messageText = error instanceof Error ? error.message.slice(0, 500) : "Onbekende SMTP-fout";
    await prisma.$transaction([
      prisma.surveyInvitation.updateMany({
        where: { id: invitation.id, deliveryLockedAt: lockAt },
        data: { deliveryLockedAt: null },
      }),
      prisma.surveyDelivery.create({
        data: {
          invitationId: invitation.id,
          status: "FAILED",
          provider: "SMTP",
          failureCode: "SMTP_SEND_FAILED",
          failureMessage: messageText,
        },
      }),
    ]);
    console.error("Survey email failed:", messageText);
    return NextResponse.json({ error: "E-mail kon niet worden verzonden; de poging is als mislukt vastgelegd." }, { status: 502 });
  }

  const sentAt = new Date();
  try {
    await prisma.$transaction(async (tx) => {
      const finalized = await tx.surveyInvitation.updateMany({
        where: { id: invitation.id, deliveryLockedAt: lockAt },
        data: { tokenHash, sentAt, deliveryLockedAt: null },
      });
      if (finalized.count !== 1) throw new Error("DELIVERY_CLAIM_LOST");
      await tx.surveyDelivery.create({
        data: {
          invitationId: invitation.id,
          status: "SENT",
          provider: "SMTP",
          providerMessageId: result.messageId,
          sentAt,
        },
      });
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    console.error("Survey delivery confirmation failed:", error instanceof Error ? error.message : "unknown");
    return NextResponse.json(
      { error: "De provider accepteerde de e-mail, maar de afleverbevestiging kon niet veilig worden opgeslagen. Verzend niet opnieuw zonder controle." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, status: "SENT" });
}
