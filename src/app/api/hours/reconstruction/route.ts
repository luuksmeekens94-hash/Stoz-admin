import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  HourInputError,
  parseProjectDateInput,
  validateHourEntryDraft,
} from "@/lib/hour-entry-validation";
import {
  buildHistoricalReconstructionScope,
  HistoricalReconstructionError,
  validateHistoricalReconstructionDraft,
} from "@/lib/hour-reconstruction";
import { assertNoDirectIdentifiers, PrivacyTextError } from "@/lib/privacy-text";
import {
  amsterdamDateKey,
  reportCutoffEnd,
  resolveReportAsOf,
} from "@/lib/reporting-control";
import { PROJECT_STEERING_CONFIG } from "@/lib/project-plan";
import {
  buildHistoricalReconstructionEntryId,
  buildHistoricalReconstructionRequestFingerprint,
  HistoricalReconstructionIntegrityError,
  parseHistoricalReconstructionPayload,
  parseHistoricalReconstructionProvenance,
  validateHistoricalReconstructionIntegrity,
} from "@/lib/historical-reconstruction-integrity";
import {
  HISTORICAL_RECONSTRUCTION_CREATE_ACTION,
  validateHistoricalReconstructionTargetsForScopes,
} from "@/lib/historical-reconstruction-db";

class HistoricalReconstructionConflictError extends Error {}

function conflictResponse(message: string) {
  return NextResponse.json({ error: message }, { status: 409 });
}

function errorResponse(error: unknown) {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2034"
  ) {
    return conflictResponse(
      "De urenstand is gelijktijdig gewijzigd. Vernieuw de reconstructie en probeer opnieuw.",
    );
  }
  if (error instanceof HistoricalReconstructionConflictError) {
    return conflictResponse(error.message);
  }

  const isInputError =
    error instanceof HourInputError ||
    error instanceof HistoricalReconstructionError ||
    error instanceof HistoricalReconstructionIntegrityError ||
    error instanceof PrivacyTextError;
  if (isInputError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  console.error("Historical reconstruction error:", error);
  return NextResponse.json(
    { error: "Reconstructie opslaan mislukt. Probeer het opnieuw." },
    { status: 500 },
  );
}

async function readIdempotentResult(input: {
  entryId: string;
  requestFingerprint: string;
}) {
  return prisma.$transaction(async (tx) => {
    const [entry, audit] = await Promise.all([
      tx.hourEntry.findUnique({ where: { id: input.entryId } }),
      tx.auditEvent.findFirst({
        where: {
          entityType: "HourEntry",
          entityId: input.entryId,
          action: HISTORICAL_RECONSTRUCTION_CREATE_ACTION,
        },
        orderBy: { createdAt: "asc" },
        select: { reason: true, beforeData: true, afterData: true },
      }),
    ]);
    if (!entry) {
      if (audit) {
        throw new HistoricalReconstructionConflictError(
          "Deze idempotentiesleutel hoort bij een verwijderde reconstructieregel en kan niet opnieuw worden gebruikt.",
        );
      }
      return null;
    }
    if (!audit) {
      throw new HistoricalReconstructionConflictError(
        "De idempotentiesleutel hoort bij een registratie zonder geldige reconstructieprovenance.",
      );
    }
    const provenance = parseHistoricalReconstructionProvenance(audit);
    if (provenance.requestFingerprint !== input.requestFingerprint) {
      throw new HistoricalReconstructionConflictError(
        "Deze idempotentiesleutel is al met andere reconstructiegegevens gebruikt.",
      );
    }
    const aggregate = await tx.hourEntry.aggregate({
      where: buildHistoricalReconstructionScope({
        userId: entry.userId,
        therapistId: entry.therapistId,
        workPackageId: entry.workPackageId,
        activityId: entry.activityId,
        asOf: reportCutoffEnd(provenance.asOf),
      }),
      _sum: { hours: true },
    });
    const registeredHours = aggregate._sum.hours || 0;
    validateHistoricalReconstructionIntegrity({ entry, provenance, registeredHours });
    return {
      entry,
      registeredHoursBefore: Math.round((registeredHours - entry.hours) * 100) / 100,
      confirmedTargetHours: provenance.confirmedTargetHours,
      missingHoursAfter:
        Math.round((provenance.confirmedTargetHours - registeredHours) * 100) / 100,
      idempotent: true as const,
    };
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  if (session.user.role !== "ADMIN") {
    return NextResponse.json(
      { error: "Alleen een beheerder kan historische uren reconstrueren" },
      { status: 403 },
    );
  }

  let entryId = "";
  let requestFingerprint = "";
  try {
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      throw new HistoricalReconstructionIntegrityError(
        "Het reconstructierequest bevat geen geldige JSON.",
      );
    }
    const body = parseHistoricalReconstructionPayload(rawBody);
    const now = new Date();
    const asOfKey = resolveReportAsOf({
      today: amsterdamDateKey(now),
      periodEnd: PROJECT_STEERING_CONFIG.reportPeriodEnd,
    });
    if (body.asOf !== asOfKey) {
      throw new HistoricalReconstructionConflictError(
        "De peildatum is gewijzigd. Vernieuw de reconstructiepagina en beoordeel de actuele urenstand opnieuw.",
      );
    }

    const { date, dateKey } = parseProjectDateInput(body.date);
    assertNoDirectIdentifiers(body.description, "omschrijving");
    assertNoDirectIdentifiers(body.sourceReference, "brononderbouwing");
    entryId = buildHistoricalReconstructionEntryId(session.user.id, body.requestId);
    requestFingerprint = buildHistoricalReconstructionRequestFingerprint(body);

    const result = await prisma.$transaction(
      async (tx) => {
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
          throw new HistoricalReconstructionConflictError(
            "Deze idempotentiesleutel hoort bij een verwijderde reconstructieregel en kan niet opnieuw worden gebruikt.",
          );
        }
        if (existing) {
          const audit = priorCreationAudit;
          if (!audit) {
            throw new HistoricalReconstructionConflictError(
              "De idempotentiesleutel hoort bij een registratie zonder geldige reconstructieprovenance.",
            );
          }
          const provenance = parseHistoricalReconstructionProvenance(audit);
          if (provenance.requestFingerprint !== requestFingerprint) {
            throw new HistoricalReconstructionConflictError(
              "Deze idempotentiesleutel is al met andere reconstructiegegevens gebruikt.",
            );
          }
          const existingAggregate = await tx.hourEntry.aggregate({
            where: buildHistoricalReconstructionScope({
              userId: existing.userId,
              therapistId: existing.therapistId,
              workPackageId: existing.workPackageId,
              activityId: existing.activityId,
              asOf: reportCutoffEnd(provenance.asOf),
            }),
            _sum: { hours: true },
          });
          const registeredHours = existingAggregate._sum.hours || 0;
          validateHistoricalReconstructionIntegrity({
            entry: existing,
            provenance,
            registeredHours,
          });
          return {
            entry: existing,
            registeredHoursBefore:
              Math.round((registeredHours - existing.hours) * 100) / 100,
            confirmedTargetHours: provenance.confirmedTargetHours,
            missingHoursAfter:
              Math.round((provenance.confirmedTargetHours - registeredHours) * 100) / 100,
            idempotent: true as const,
          };
        }

        const [user, activity, therapist] = await Promise.all([
          tx.user.findFirst({
            where: { id: body.userId, active: true },
            select: { id: true, role: true },
          }),
          tx.activity.findUnique({
            where: { id: body.activityId },
            select: { id: true, workPackageId: true },
          }),
          body.therapistId
            ? tx.therapist.findFirst({
                where: { id: body.therapistId, active: true },
                select: { id: true },
              })
            : Promise.resolve(null),
        ]);

        if (!user) throw new HourInputError("Uitvoerder niet gevonden of niet actief.");
        if (!activity) throw new HourInputError("Activiteit niet gevonden.");
        if (activity.workPackageId !== body.workPackageId) {
          throw new HourInputError("De activiteit hoort niet bij het gekozen werkpakket.");
        }
        if (user.role === "TEAM" && !body.therapistId) {
          throw new HourInputError("Kies bij het teamaccount een concrete fysiotherapeut.");
        }
        if (user.role !== "TEAM" && body.therapistId) {
          throw new HourInputError(
            "Een fysiotherapeut kan alleen via het teamaccount worden geregistreerd.",
          );
        }
        if (body.therapistId && !therapist) {
          throw new HourInputError("Fysiotherapeut niet gevonden of niet actief.");
        }

        validateHourEntryDraft({
          dateKey,
          now,
          hours: body.hours,
          workPackageId: body.workPackageId,
          activityWorkPackageId: activity.workPackageId,
        });
        if (dateKey > asOfKey) {
          throw new HourInputError(
            "De uitvoeringsdatum mag niet na de bevestigde rapportagepeildatum liggen.",
          );
        }

        const aggregate = await tx.hourEntry.aggregate({
          where: buildHistoricalReconstructionScope({
            userId: body.userId,
            therapistId: body.therapistId,
            workPackageId: body.workPackageId,
            activityId: body.activityId,
            asOf: reportCutoffEnd(asOfKey),
          }),
          _sum: { hours: true },
        });
        const registeredHours = aggregate._sum.hours || 0;
        const reconstruction = validateHistoricalReconstructionDraft({
          registeredHours,
          targetHours: body.targetHours,
          entryHours: body.hours,
          description: body.description,
          sourceType: body.sourceType,
          sourceReference: body.sourceReference,
          performedConfirmation: body.performedConfirmation,
        });

        const entry = await tx.hourEntry.create({
          data: {
            id: entryId,
            date,
            hours: body.hours,
            description: reconstruction.description,
            userId: body.userId,
            workPackageId: body.workPackageId,
            activityId: body.activityId,
            therapistId: body.therapistId,
            status: "DRAFT",
          },
          select: {
            id: true,
            date: true,
            hours: true,
            description: true,
            status: true,
            userId: true,
            workPackageId: true,
            activityId: true,
            therapistId: true,
            createdAt: true,
            updatedAt: true,
            approvedAt: true,
            approvedBy: true,
          },
        });

        await tx.auditEvent.create({
          data: {
            entityType: "HourEntry",
            entityId: entry.id,
            action: HISTORICAL_RECONSTRUCTION_CREATE_ACTION,
            reason: reconstruction.sourceReference,
            beforeData: {
              asOf: asOfKey,
              registeredHours,
              confirmedTargetHours: body.targetHours,
              missingHoursBefore: reconstruction.comparison.differenceHours,
              sourceType: reconstruction.sourceType,
              performedConfirmation: true,
            },
            afterData: {
              requestId: body.requestId,
              requestFingerprint,
              date: dateKey,
              hours: body.hours,
              description: reconstruction.description,
              status: "DRAFT",
              userId: body.userId,
              therapistId: body.therapistId,
              workPackageId: body.workPackageId,
              activityId: body.activityId,
              missingHoursAfter:
                Math.round((reconstruction.comparison.differenceHours - body.hours) * 100) /
                100,
            },
            actorUserId: session.user.id,
          },
        });

        await validateHistoricalReconstructionTargetsForScopes(tx, [
          {
            userId: body.userId,
            therapistId: body.therapistId,
            workPackageId: body.workPackageId,
            activityId: body.activityId,
          },
        ]);

        return {
          entry,
          registeredHoursBefore: registeredHours,
          confirmedTargetHours: body.targetHours,
          missingHoursAfter:
            Math.round((reconstruction.comparison.differenceHours - body.hours) * 100) / 100,
          idempotent: false as const,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    return NextResponse.json(result, { status: result.idempotent ? 200 : 201 });
  } catch (error: unknown) {
    if (
      entryId &&
      requestFingerprint &&
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2002" || error.code === "P2034")
    ) {
      try {
        const idempotent = await readIdempotentResult({ entryId, requestFingerprint });
        if (idempotent) return NextResponse.json(idempotent, { status: 200 });
      } catch (idempotentError) {
        return errorResponse(idempotentError);
      }
    }
    return errorResponse(error);
  }
}
