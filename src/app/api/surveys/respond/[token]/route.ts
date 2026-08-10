import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getInvitationAccessStatus,
  hashSurveyToken,
  validateTherapistBaselineAnswers,
} from "@/lib/therapist-survey";

class SurveyResponseError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token || token.length < 40 || token.length > 100) {
    return NextResponse.json({ error: "Deze uitnodigingslink is ongeldig." }, { status: 404 });
  }

  const body = await request.json();
  const validation = validateTherapistBaselineAnswers(body?.answers);
  if (!validation.ok) {
    return NextResponse.json(
      {
        error: validation.privacyBlocked
          ? "Verwijder herleidbare patiëntinformatie."
          : "Controleer de gemarkeerde antwoorden.",
        errors: validation.errors,
      },
      { status: 400 },
    );
  }

  const tokenHash = hashSurveyToken(token);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await prisma.$transaction(async (tx) => {
        const invitation = await tx.surveyInvitation.findUnique({
          where: { tokenHash },
          include: { campaign: true, response: true },
        });
        if (!invitation) throw new SurveyResponseError("Deze uitnodigingslink is ongeldig.", 404);

        const access = getInvitationAccessStatus({
          campaignStatus: invitation.campaign.status,
          expiresAt: invitation.expiresAt,
          revokedAt: invitation.revokedAt,
          submittedAt: invitation.response?.submittedAt || null,
        });
        if (access !== "OPEN") {
          const status = access === "COMPLETED"
            ? 409
            : access === "EXPIRED" || access === "REVOKED"
              ? 410
              : 403;
          throw new SurveyResponseError(
            access === "COMPLETED"
              ? "Deze meting is al ingevuld."
              : "Deze uitnodiging is niet meer actief.",
            status,
          );
        }

        await tx.surveyResponse.create({
          data: { invitationId: invitation.id, answers: validation.normalized },
        });
      }, { isolationLevel: "Serializable" });
      return NextResponse.json({ ok: true }, { status: 201 });
    } catch (error) {
      if (error instanceof SurveyResponseError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return NextResponse.json({ error: "Deze meting is al ingevuld." }, { status: 409 });
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034" && attempt === 0) {
        continue;
      }
      console.error("Survey response create error:", error instanceof Error ? error.message : "unknown");
      return NextResponse.json({ error: "Antwoorden konden niet veilig worden opgeslagen." }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "Antwoorden konden niet veilig worden opgeslagen." }, { status: 500 });
}
