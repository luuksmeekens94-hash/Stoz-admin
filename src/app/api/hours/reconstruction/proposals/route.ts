import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import {
  INTERIM_CALCULATION_VERSION,
  INTERIM_PROPOSAL_CREATE_ACTION,
  loadInterimHoursSteering,
  proposalHours,
} from "@/lib/interim-hour-steering-db";
import {
  buildInterimProposalRequestFingerprint,
  InterimProposalError,
  parseInterimProposalRequest,
  validateInterimProposalRequest,
} from "@/lib/interim-hour-proposals";
import { prisma } from "@/lib/prisma";
import { amsterdamDateKey, resolveReportAsOf } from "@/lib/reporting-control";
import { PROJECT_STEERING_CONFIG } from "@/lib/project-plan";

const SOURCE_REFERENCE =
  "Gedelegeerde projecteigenaar-inschatting 12 augustus 2026: 450 uur als niet-lineaire tussenstand; ontwikkeling voorbelast en implementatie, borging en evaluatie zwaarder in de tweede helft.";

function quarters(hours: number) {
  const value = hours * 4;
  if (!Number.isInteger(value)) throw new InterimProposalError("Voorsteluren moeten op kwartieren uitkomen.");
  return value;
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Alleen een beheerder kan aanvullingen klaarzetten" }, { status: 403 });
  }

  try {
    const parsed = parseInterimProposalRequest(await request.json());
    const requestFingerprint = buildInterimProposalRequestFingerprint(parsed);
    const asOf = resolveReportAsOf({
      today: amsterdamDateKey(),
      periodEnd: PROJECT_STEERING_CONFIG.reportPeriodEnd,
    });
    if (parsed.asOf !== asOf) {
      return NextResponse.json({ error: "De peildatum is gewijzigd. Vernieuw het dashboard." }, { status: 409 });
    }

    const createOrReadProposalSet = () => prisma.$transaction(async (tx) => {
      const existing = await tx.interimHourProposalSet.findUnique({
        where: {
          attestedById_requestKey: {
            attestedById: session.user.id,
            requestKey: parsed.requestId,
          },
        },
        include: { proposals: { select: { proposedQuarters: true } } },
      });
      if (existing) {
        if (existing.requestFingerprint !== requestFingerprint) {
          return { conflict: true as const };
        }
        return {
          proposalCount: existing.proposals.length,
          proposalHours: existing.proposals.reduce((sum, proposal) => sum + proposal.proposedQuarters, 0) / 4,
          idempotent: true,
        };
      }

      const existingCalculation = await tx.interimHourProposalSet.findFirst({
        where: {
          asOf: new Date(`${asOf}T00:00:00.000Z`),
          calculationVersion: INTERIM_CALCULATION_VERSION,
          requestFingerprint,
        },
        include: { proposals: { select: { proposedQuarters: true } } },
      });
      if (existingCalculation) {
        return {
          proposalCount: existingCalculation.proposals.length,
          proposalHours: existingCalculation.proposals.reduce(
            (sum, proposal) => sum + proposal.proposedQuarters,
            0,
          ) / 4,
          idempotent: true,
        };
      }

      const steering = await loadInterimHoursSteering(asOf, tx);
      const validated = validateInterimProposalRequest(parsed, steering);
      const activities = await tx.activity.findMany({
        where: { code: { in: validated.proposals.map((proposal) => proposal.activityCode) } },
        select: { id: true, code: true, workPackage: { select: { id: true, code: true } } },
      });
      const activityByCode = new Map(activities.map((row) => [row.code, row]));
      if (activityByCode.size !== new Set(validated.proposals.map((row) => row.activityCode)).size) {
        throw new InterimProposalError("Niet alle activiteiten konden eenduidig worden gekoppeld.");
      }
      if (validated.proposals.some((proposal) =>
        activityByCode.get(proposal.activityCode)?.workPackage.code !== proposal.workPackageCode
      )) {
        throw new InterimProposalError("Een activiteit hoort niet bij het gekozen werkpakket.");
      }

      const proposalSet = await tx.interimHourProposalSet.create({
        data: {
          requestKey: validated.requestId,
          requestFingerprint,
          asOf: new Date(`${asOf}T00:00:00.000Z`),
          calculationVersion: INTERIM_CALCULATION_VERSION,
          sourceReference: SOURCE_REFERENCE,
          attestedById: session.user.id,
          proposals: {
            create: validated.proposals.map((proposal) => ({
              activityId: activityByCode.get(proposal.activityCode)!.id,
              budgetLineKey: proposal.budgetLineKey,
              title: proposal.title,
              workPackageId: activityByCode.get(proposal.activityCode)!.workPackage.id,
              targetQuarters: quarters(proposal.targetHours),
              registeredBaselineQuarters: quarters(proposal.currentHours),
              proposedQuarters: quarters(proposal.proposedHours),
              rationale: proposal.rationale,
            })),
          },
        },
      });

      await tx.auditEvent.create({
        data: {
          entityType: "InterimHourProposalSet",
          entityId: proposalSet.id,
          action: INTERIM_PROPOSAL_CREATE_ACTION,
          reason: "Aanvulvoorstelset vastgelegd zonder urenboekingen aan te maken.",
          beforeData: {
            asOf,
            currentHours: steering.totals.currentHours,
            targetHours: steering.totals.targetHours,
          },
          afterData: {
            asOf,
            calculationVersion: INTERIM_CALCULATION_VERSION,
            sourceReference: SOURCE_REFERENCE,
            proposalHours: proposalHours(validated.proposals),
            proposals: validated.proposals,
            createsHourEntries: false,
          } as unknown as Prisma.InputJsonValue,
          actorUserId: session.user.id,
        },
      });

      return {
        proposalCount: validated.proposals.length,
        proposalHours: proposalHours(validated.proposals),
        idempotent: false,
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    let result;
    try {
      result = await createOrReadProposalSet();
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === "P2002" || error.code === "P2034")
      ) {
        result = await createOrReadProposalSet();
      } else {
        throw error;
      }
    }
    if ("conflict" in result) {
      return NextResponse.json(
        { error: "Deze request-id is al met een andere voorstelset gebruikt." },
        { status: 409 },
      );
    }
    return NextResponse.json(result, { status: result.idempotent ? 200 : 201 });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Het verzoek bevat geen geldige JSON." }, { status: 400 });
    }
    if (error instanceof InterimProposalError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2002" || error.code === "P2034")
    ) {
      return NextResponse.json({ error: "De voorstelstand is gelijktijdig gewijzigd. Vernieuw het dashboard." }, { status: 409 });
    }
    console.error("Interim catch-up proposal error:", error);
    return NextResponse.json({ error: "De aanvullingen konden niet worden klaargezet." }, { status: 500 });
  }
}
