import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CATEGORY_USER_EMAILS, PROJECT_STEERING_CONFIG } from "@/lib/project-plan";
import { amsterdamDateKey, reportCutoffEnd, resolveReportAsOf } from "@/lib/reporting-control";
import { parseProjectDateInput, validateHourEntryDraft, validateUserTherapistPairing } from "@/lib/hour-entry-validation";
import { assertNoDirectIdentifiers, PrivacyTextError } from "@/lib/privacy-text";
import {
  buildHistoricalReconstructionEntryId,
  buildHistoricalReconstructionRequestFingerprint,
  HistoricalReconstructionIntegrityError,
  parseHistoricalReconstructionProvenance,
} from "@/lib/historical-reconstruction-integrity";
import {
  HISTORICAL_RECONSTRUCTION_CREATE_ACTION,
  validateHistoricalReconstructionTargetsForScopes,
} from "@/lib/historical-reconstruction-db";

class ProposalMaterializationError extends Error {}
class ProposalMaterializationConflict extends Error {}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_FIELDS = new Set([
  "requestId", "userId", "therapistId", "date", "hours", "description",
  "sourceReference", "performedConfirmation",
]);

const CATEGORY_BY_BUDGET_LINE: Record<string, string> = {
  PRACTICE_PROJECT_MANAGEMENT: "Praktijkmanager",
  PRACTICE_IMPLEMENTATION: "Praktijkmanager",
  PHYSIOTHERAPIST_IMPLEMENTATION: "Fysiotherapeuten",
  FRONT_BACKOFFICE_IMPLEMENTATION: "Front/backoffice",
  EXTERNAL_PROJECT_MANAGEMENT: "Extern adviseur",
  WEBSITE_BUILDER: "Websitebouwer",
  INTERNAL_TRAINER: "Praktijkmanager",
};

function parseBody(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ProposalMaterializationError("Het verzoek moet een object zijn.");
  }
  const row = value as Record<string, unknown>;
  const unknown = Object.keys(row).filter((key) => !ALLOWED_FIELDS.has(key));
  if (unknown.length) throw new ProposalMaterializationError(`Onbekend veld: ${unknown.join(", ")}.`);
  const text = (key: string, min: number, max: number) => {
    if (typeof row[key] !== "string") throw new ProposalMaterializationError(`${key} moet tekst zijn.`);
    const normalized = row[key].trim();
    if (normalized.length < min || normalized.length > max) {
      throw new ProposalMaterializationError(`${key} heeft een ongeldige lengte.`);
    }
    return normalized;
  };
  const requestId = text("requestId", 1, 100).toLowerCase();
  if (!UUID_PATTERN.test(requestId)) throw new ProposalMaterializationError("Request-id moet een geldige UUID zijn.");
  const therapistId = row.therapistId === null || row.therapistId === undefined
    ? null
    : text("therapistId", 1, 200);
  const hours = Number(row.hours);
  if (!Number.isFinite(hours) || hours <= 0 || !Number.isInteger(hours * 4)) {
    throw new ProposalMaterializationError("Uren moeten positief zijn en op kwartieren uitkomen.");
  }
  if (row.performedConfirmation !== true) {
    throw new ProposalMaterializationError("Bevestig eerst dat de werkzaamheden werkelijk zijn uitgevoerd.");
  }
  return {
    requestId,
    userId: text("userId", 1, 200),
    therapistId,
    date: text("date", 10, 10),
    hours,
    description: text("description", 10, 1000),
    sourceReference: text("sourceReference", 20, 2000),
    performedConfirmation: true as const,
  };
}

function jsonError(error: unknown) {
  if (error instanceof ProposalMaterializationConflict ||
    (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034")) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "De urenstand is gewijzigd. Vernieuw de pagina." }, { status: 409 });
  }
  if (error instanceof ProposalMaterializationError || error instanceof HistoricalReconstructionIntegrityError || error instanceof PrivacyTextError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  console.error("Interim proposal materialization error:", error);
  return NextResponse.json({ error: "De conceptregistratie kon niet worden aangemaakt." }, { status: 500 });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ proposalId: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Alleen een beheerder kan een aanvulling verwerken" }, { status: 403 });
  }

  try {
    let raw: unknown;
    try { raw = await request.json(); } catch { throw new ProposalMaterializationError("Het verzoek bevat geen geldige JSON."); }
    const body = parseBody(raw);
    assertNoDirectIdentifiers(body.description, "omschrijving");
    assertNoDirectIdentifiers(body.sourceReference, "brononderbouwing");
    const { proposalId } = await params;
    const entryId = buildHistoricalReconstructionEntryId(session.user.id, body.requestId);

    const materialize = () => prisma.$transaction(async (tx) => {
      const proposal = await tx.interimHourProposal.findUnique({
        where: { id: proposalId },
        include: {
          proposalSet: { select: { asOf: true, sourceReference: true } },
          activity: { select: { id: true, workPackageId: true } },
        },
      });
      if (!proposal) throw new ProposalMaterializationError("Het aanvulvoorstel bestaat niet.");
      if (proposal.activity.workPackageId !== proposal.workPackageId) {
        throw new ProposalMaterializationError("De activiteit hoort niet bij het opgeslagen werkpakket.");
      }
      const expectedCategory = CATEGORY_BY_BUDGET_LINE[proposal.budgetLineKey];
      if (!expectedCategory) throw new ProposalMaterializationError("De functie van dit voorstel is onbekend.");
      const proposalAsOf = proposal.proposalSet.asOf.toISOString().slice(0, 10);
      const targetHours = proposal.targetQuarters / 4;
      const historicalPayload = (confirmedTargetHours: number) => ({
        requestId: body.requestId,
        asOf: proposalAsOf,
        date: body.date,
        hours: body.hours,
        description: body.description,
        userId: body.userId,
        therapistId: body.therapistId,
        workPackageId: proposal.workPackageId,
        activityId: proposal.activityId,
        targetHours: confirmedTargetHours,
        sourceType: "PROJECT_OWNER_RECONSTRUCTION" as const,
        sourceReference: body.sourceReference,
        performedConfirmation: true as const,
      });

      const [existing, priorCreationAudit] = await Promise.all([
        tx.hourEntry.findUnique({ where: { id: entryId } }),
        tx.auditEvent.findFirst({
          where: {
            entityType: "HourEntry",
            entityId: entryId,
            action: HISTORICAL_RECONSTRUCTION_CREATE_ACTION,
          },
          orderBy: { createdAt: "asc" },
          select: { reason: true, beforeData: true, afterData: true },
        }),
      ]);
      if (!existing && priorCreationAudit) {
        throw new ProposalMaterializationConflict(
          "Deze request-id hoort bij een verwijderde conceptregel en kan niet opnieuw worden gebruikt.",
        );
      }
      if (existing) {
        if (existing.historicalProposalId !== proposal.id) {
          throw new ProposalMaterializationConflict("Deze request-id is al voor een andere aanvulling gebruikt.");
        }
        if (!priorCreationAudit) throw new ProposalMaterializationConflict("De bestaande conceptregel mist geldige provenance.");
        const provenance = parseHistoricalReconstructionProvenance(priorCreationAudit);
        const requestFingerprint = buildHistoricalReconstructionRequestFingerprint(
          historicalPayload(provenance.confirmedTargetHours),
        );
        if (provenance.requestFingerprint !== requestFingerprint) {
          throw new ProposalMaterializationConflict(
            "Deze request-id is al met andere conceptgegevens gebruikt.",
          );
        }
        const replayAllocations = await tx.budgetAllocation.findMany({
          where: { category: expectedCategory, userId: { not: null } },
          select: { userId: true },
        });
        const replayRoleUserIds = Array.from(new Set(
          replayAllocations.flatMap((row) => row.userId || []),
        ));
        if (!replayRoleUserIds.includes(existing.userId)) replayRoleUserIds.push(existing.userId);
        const replayAggregate = await tx.hourEntry.aggregate({
          where: {
            userId: { in: replayRoleUserIds },
            workPackageId: proposal.workPackageId,
            date: { lte: reportCutoffEnd(proposalAsOf) },
          },
          _sum: { hours: true },
        });
        const replayRegisteredHours = replayAggregate._sum.hours || 0;
        return {
          entry: existing,
          remainingHours: Math.round(Math.max(0, targetHours - replayRegisteredHours) * 100) / 100,
          idempotent: true as const,
        };
      }

      const [user, therapist, allocations] = await Promise.all([
        tx.user.findFirst({
          where: { id: body.userId, active: true },
          select: { id: true, role: true, email: true, budgetAllocations: { select: { category: true } } },
        }),
        body.therapistId
          ? tx.therapist.findFirst({ where: { id: body.therapistId, active: true }, select: { id: true } })
          : Promise.resolve(null),
        tx.budgetAllocation.findMany({
          where: { category: expectedCategory, userId: { not: null } },
          select: { userId: true },
        }),
      ]);
      if (!user) throw new ProposalMaterializationError("Uitvoerder niet gevonden of niet actief.");
      if (body.therapistId && !therapist) throw new ProposalMaterializationError("Fysiotherapeut niet gevonden of niet actief.");
      validateUserTherapistPairing(user.role, body.therapistId);
      const mappedCategory = user.budgetAllocations.some((row) => row.category === expectedCategory) ||
        CATEGORY_USER_EMAILS[expectedCategory]?.toLowerCase() === user.email.toLowerCase();
      if (!mappedCategory) throw new ProposalMaterializationError("De uitvoerder hoort niet bij de functie van dit voorstel.");

      const currentAsOf = resolveReportAsOf({ today: amsterdamDateKey(), periodEnd: PROJECT_STEERING_CONFIG.reportPeriodEnd });
      const { date, dateKey } = parseProjectDateInput(body.date);
      validateHourEntryDraft({
        dateKey,
        now: new Date(),
        hours: body.hours,
        workPackageId: proposal.workPackageId,
        activityWorkPackageId: proposal.activity.workPackageId,
      });
      if (dateKey > proposalAsOf || dateKey > currentAsOf) {
        throw new ProposalMaterializationError("De uitvoeringsdatum ligt na de peildatum van het voorstel.");
      }

      const roleUserIds = Array.from(new Set(allocations.flatMap((row) => row.userId || [])));
      if (!roleUserIds.includes(user.id)) roleUserIds.push(user.id);
      const proposalAggregate = await tx.hourEntry.aggregate({
        where: {
          userId: { in: roleUserIds },
          workPackageId: proposal.workPackageId,
          date: { lte: reportCutoffEnd(proposalAsOf) },
        },
        _sum: { hours: true },
      });
      const proposalRegisteredHours = proposalAggregate._sum.hours || 0;
      const remainingBefore = Math.round((targetHours - proposalRegisteredHours) * 100) / 100;
      if (remainingBefore <= 0) throw new ProposalMaterializationConflict("Dit voorstel is al volledig verwerkt.");
      if (body.hours > remainingBefore) throw new ProposalMaterializationConflict("De conceptregel is groter dan het actuele resterende voorstel.");

      const actorAggregate = await tx.hourEntry.aggregate({
        where: {
          userId: body.userId,
          therapistId: body.therapistId,
          workPackageId: proposal.workPackageId,
          activityId: proposal.activityId,
          date: { lte: reportCutoffEnd(proposalAsOf) },
        },
        _sum: { hours: true },
      });
      const registeredHours = actorAggregate._sum.hours || 0;
      const confirmedTargetHours = Math.round((registeredHours + remainingBefore) * 100) / 100;
      const requestFingerprint = buildHistoricalReconstructionRequestFingerprint(
        historicalPayload(confirmedTargetHours),
      );

      const entry = await tx.hourEntry.create({
        data: {
          id: entryId,
          date,
          hours: body.hours,
          description: body.description,
          userId: body.userId,
          therapistId: body.therapistId,
          workPackageId: proposal.workPackageId,
          activityId: proposal.activityId,
          historicalProposalId: proposal.id,
          status: "DRAFT",
        },
        select: { id: true, hours: true, status: true },
      });
      const remainingHours = Math.round((remainingBefore - body.hours) * 100) / 100;
      await tx.auditEvent.create({
        data: {
          entityType: "HourEntry",
          entityId: entry.id,
          action: HISTORICAL_RECONSTRUCTION_CREATE_ACTION,
          reason: body.sourceReference,
          beforeData: {
            asOf: proposalAsOf,
            registeredHours,
            confirmedTargetHours,
            missingHoursBefore: body.hours,
            sourceType: "PROJECT_OWNER_RECONSTRUCTION",
            performedConfirmation: true,
            historicalProposalId: proposal.id,
            proposalRegisteredHours,
            proposalTargetHours: targetHours,
            proposalMissingHoursBefore: remainingBefore,
          },
          afterData: {
            requestId: body.requestId,
            requestFingerprint,
            date: dateKey,
            hours: body.hours,
            description: body.description,
            status: "DRAFT",
            userId: body.userId,
            therapistId: body.therapistId,
            workPackageId: proposal.workPackageId,
            activityId: proposal.activityId,
            historicalProposalId: proposal.id,
            missingHoursAfter: 0,
            proposalMissingHoursAfter: remainingHours,
          },
          actorUserId: session.user.id,
        },
      });
      await validateHistoricalReconstructionTargetsForScopes(tx, [{
        userId: body.userId,
        therapistId: body.therapistId,
        workPackageId: proposal.workPackageId,
        activityId: proposal.activityId,
      }]);
      return { entry, remainingHours, idempotent: false as const };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    try {
      const result = await materialize();
      return NextResponse.json(result, { status: result.idempotent ? 200 : 201 });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === "P2002" || error.code === "P2034")
      ) {
        const result = await materialize();
        return NextResponse.json(result, { status: result.idempotent ? 200 : 201 });
      }
      throw error;
    }
  } catch (error) {
    return jsonError(error);
  }
}
