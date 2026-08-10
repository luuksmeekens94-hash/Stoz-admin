import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

class CampaignStatusError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await getSession();
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Geen toegang" }, { status: 403 });
  }

  const body = await request.json();
  const status = body?.status;
  if (!(["ACTIVE", "CLOSED"] as const).includes(status)) {
    return NextResponse.json({ error: "Ongeldige campagnestatus." }, { status: 400 });
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const updated = await prisma.$transaction(async (tx) => {
        const campaign = await tx.surveyCampaign.findUnique({
          where: { id },
          include: { _count: { select: { invitations: true } } },
        });
        if (!campaign) throw new CampaignStatusError("Campagne niet gevonden.", 404);
        if (status === "ACTIVE" && (campaign._count.invitations === 0 || campaign.closesAt <= new Date())) {
          throw new CampaignStatusError(
            "Een actieve campagne vereist ontvangers en een toekomstige sluitingsdatum.",
            409,
          );
        }
        if (campaign.status === "CLOSED" && status !== "CLOSED") {
          throw new CampaignStatusError("Een gesloten campagne kan niet opnieuw worden geopend.", 409);
        }
        if (status === "CLOSED") {
          const activeDeliveryLocks = await tx.surveyInvitation.count({
            where: {
              campaignId: campaign.id,
              deliveryLockedAt: { gte: new Date(Date.now() - 5 * 60 * 1000) },
            },
          });
          if (activeDeliveryLocks > 0) {
            throw new CampaignStatusError(
              "Wacht tot de lopende uitnodigingsverzending is afgerond voordat je sluit.",
              409,
            );
          }
        }

        return tx.surveyCampaign.update({
          where: { id: campaign.id },
          data: { status },
        });
      }, { isolationLevel: "Serializable" });
      return NextResponse.json(updated);
    } catch (error) {
      if (error instanceof CampaignStatusError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034" && attempt === 0) {
        continue;
      }
      console.error("Survey campaign status error:", error instanceof Error ? error.message : "unknown");
      return NextResponse.json({ error: "Campagnestatus kon niet veilig worden aangepast." }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "Campagnestatus kon niet veilig worden aangepast." }, { status: 500 });
}
