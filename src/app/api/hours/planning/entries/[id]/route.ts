import { NextResponse } from "next/server";
import { HourStatus, Prisma } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { databaseAmsterdamDateKey } from "@/lib/hour-entry-db";
import { assertHourEntryCasUpdated, HourEntryConcurrencyError } from "@/lib/hour-entry-concurrency";
import {
  HourInputError,
  parseHourInput,
  parseProjectDateInput,
  validateHourEntryDraft,
  validateUserTherapistPairing,
} from "@/lib/hour-entry-validation";
import { assertNoDirectIdentifiers, PrivacyTextError } from "@/lib/privacy-text";
import { buildReviewedForecastHourReview } from "@/lib/planned-hour-integrity";

class PlanningHourInputError extends Error {}
class PlanningHourConflictError extends Error {}

type PlanningHourAction = "correct" | "submit" | "approve" | "return_to_draft";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requiredText(row: Record<string, unknown>, key: string, min: number, max: number) {
  if (typeof row[key] !== "string") throw new PlanningHourInputError(`${key} moet tekst zijn.`);
  const value = row[key].trim();
  if (value.length < min || value.length > max) {
    throw new PlanningHourInputError(`${key} heeft een ongeldige lengte.`);
  }
  return value;
}

function parseBody(value: unknown) {
  if (!isRecord(value)) throw new PlanningHourInputError("De aanvraag moet een object zijn.");
  const action = value.action;
  if (action !== "correct" && action !== "submit" && action !== "approve" && action !== "return_to_draft") {
    throw new PlanningHourInputError("Ongeldige planningurenactie.");
  }
  const allowed = action === "correct"
    ? new Set(["action", "date", "hours", "description", "userId", "therapistId", "sourceReference", "correctionReason", "performedConfirmation"])
    : new Set(["action", "reason", "reviewConfirmation"]);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length) throw new PlanningHourInputError(`Onbekend veld: ${unknown.join(", ")}.`);
  return { action: action as PlanningHourAction, row: value };
}

function lifecycleAuditAction(action: Exclude<PlanningHourAction, "correct">) {
  if (action === "submit") return "SUBMITTED_REVIEWED_FORECAST_HOUR";
  if (action === "approve") return "APPROVED_REVIEWED_FORECAST_HOUR";
  return "RETURNED_REVIEWED_FORECAST_HOUR_TO_DRAFT";
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Alleen een beheerder kan een planninguur corrigeren of beoordelen." }, { status: 403 });
  }

  try {
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      throw new PlanningHourInputError("Ongeldige JSON-aanvraag.");
    }
    const body = parseBody(raw);
    const { id } = await params;

    const result = await prisma.$transaction(async (tx) => {
      const entry = await tx.hourEntry.findUnique({
        where: { id },
        include: {
          sourceForecastEntry: {
            select: { id: true, plannedDate: true, executorName: true, plannedHours: true },
          },
        },
      });
      if (!entry?.sourceForecastEntryId) {
        throw new PlanningHourConflictError("Deze urenregel is niet gekoppeld aan goedgekeurde planning.");
      }
      const planningAudits = await tx.auditEvent.findMany({
        where: {
          entityType: "HourEntry",
          entityId: entry.id,
        },
        orderBy: { createdAt: "asc" },
        select: {
          action: true,
          reason: true,
          actorUserId: true,
          createdAt: true,
          beforeData: true,
          afterData: true,
        },
      });
      const planningReview = buildReviewedForecastHourReview({
        sourceForecastEntryId: entry.sourceForecastEntryId,
        sourceForecast: entry.sourceForecastEntry,
        audits: planningAudits,
        actorNameById: new Map(),
      });
      if (planningReview.integrity !== "VALID" || !planningReview.sourceReference) {
        throw new PlanningHourConflictError("De oorspronkelijke uitvoeringsbevestiging ontbreekt of is ongeldig.");
      }

      if (body.action === "correct") {
        if (entry.status !== "DRAFT" && entry.status !== "APPROVED") {
          throw new PlanningHourConflictError("Alleen een concept of goedgekeurd planninguur kan auditbaar worden gecorrigeerd.");
        }
        const userId = requiredText(body.row, "userId", 1, 200);
        const dateInput = requiredText(body.row, "date", 10, 10);
        const description = requiredText(body.row, "description", 10, 1000);
        const sourceReference = requiredText(body.row, "sourceReference", 20, 2000);
        const correctionReason = requiredText(body.row, "correctionReason", 15, 1000);
        if (body.row.performedConfirmation !== true) {
          throw new PlanningHourInputError("Bevestig opnieuw dat de gecorrigeerde werkzaamheden werkelijk zijn uitgevoerd.");
        }
        const therapistId = body.row.therapistId === null || body.row.therapistId === undefined
          ? null
          : requiredText(body.row, "therapistId", 1, 200);
        const hours = parseHourInput(body.row.hours);
        const { date, dateKey } = parseProjectDateInput(dateInput);
        assertNoDirectIdentifiers(description, "omschrijving");
        assertNoDirectIdentifiers(sourceReference, "brononderbouwing");
        assertNoDirectIdentifiers(correctionReason, "correctiereden");

        const [activity, user, therapist, databaseToday] = await Promise.all([
          tx.activity.findUnique({ where: { id: entry.activityId }, select: { workPackageId: true } }),
          tx.user.findFirst({ where: { id: userId, active: true }, select: { id: true, role: true } }),
          therapistId
            ? tx.therapist.findFirst({ where: { id: therapistId, active: true }, select: { id: true } })
            : Promise.resolve(null),
          databaseAmsterdamDateKey(tx),
        ]);
        if (!activity || activity.workPackageId !== entry.workPackageId) {
          throw new PlanningHourConflictError("De bronactiviteit hoort niet meer bij het gekoppelde werkpakket.");
        }
        if (!user) throw new PlanningHourInputError("Uitvoerder niet gevonden of niet actief.");
        if (therapistId && !therapist) throw new PlanningHourInputError("Fysiotherapeut niet gevonden of niet actief.");
        validateUserTherapistPairing(user.role, therapistId);
        validateHourEntryDraft({
          dateKey,
          now: new Date(`${databaseToday}T12:00:00.000Z`),
          hours,
          workPackageId: entry.workPackageId,
          activityWorkPackageId: activity.workPackageId,
        });
        if (dateKey > databaseToday) throw new PlanningHourInputError("Toekomstige werkzaamheden kunnen niet als uitgevoerd worden gecorrigeerd.");

        const mutation = await tx.hourEntry.updateMany({
          where: {
            id: entry.id,
            status: entry.status,
            updatedAt: entry.updatedAt,
            sourceForecastEntryId: entry.sourceForecastEntryId,
          },
          data: { date, hours, description, userId, therapistId },
        });
        assertHourEntryCasUpdated(mutation.count);
        await tx.auditEvent.create({
          data: {
            entityType: "HourEntry",
            entityId: entry.id,
            action: entry.status === "APPROVED"
              ? "CORRECTED_APPROVED_REVIEWED_FORECAST_HOUR"
              : "CORRECTED_REVIEWED_FORECAST_HOUR",
            reason: correctionReason,
            beforeData: {
              date: entry.date.toISOString().slice(0, 10),
              hours: entry.hours,
              description: entry.description,
              userId: entry.userId,
              therapistId: entry.therapistId,
              sourceReference: planningReview.sourceReference,
              performedConfirmation: true,
              status: entry.status,
            },
            afterData: {
              date: dateKey,
              hours,
              description,
              userId,
              therapistId,
              sourceReference,
              performedConfirmation: true,
              status: entry.status,
              sourceForecastEntryId: entry.sourceForecastEntryId,
            },
            actorUserId: session.user.id,
          },
        });
        return tx.hourEntry.findUniqueOrThrow({ where: { id: entry.id } });
      }

      const reason = requiredText(body.row, "reason", 15, 1000);
      assertNoDirectIdentifiers(reason, "statusreden");
      const transition: { before: HourStatus; after: HourStatus } = body.action === "submit"
        ? { before: "DRAFT", after: "SUBMITTED" }
        : body.action === "approve"
          ? { before: "SUBMITTED", after: "APPROVED" }
          : { before: "SUBMITTED", after: "DRAFT" };
      if (entry.status !== transition.before) {
        throw new PlanningHourConflictError("Deze statuswijziging past niet bij de actuele planningurenstatus.");
      }
      if (body.action === "approve" && body.row.reviewConfirmation !== true) {
        throw new PlanningHourInputError("Bevestig dat bron, uitvoering en auditgeschiedenis zijn beoordeeld.");
      }

      const [activity, user, therapist, databaseToday] = await Promise.all([
        tx.activity.findUnique({ where: { id: entry.activityId }, select: { workPackageId: true } }),
        tx.user.findFirst({ where: { id: entry.userId, active: true }, select: { id: true, role: true } }),
        entry.therapistId
          ? tx.therapist.findFirst({ where: { id: entry.therapistId, active: true }, select: { id: true } })
          : Promise.resolve(null),
        databaseAmsterdamDateKey(tx),
      ]);
      if (!activity || activity.workPackageId !== entry.workPackageId) {
        throw new PlanningHourConflictError("De bronactiviteit hoort niet meer bij het gekoppelde werkpakket.");
      }
      if (!user) throw new PlanningHourInputError("Uitvoerder niet gevonden of niet actief.");
      if (entry.therapistId && !therapist) throw new PlanningHourInputError("Fysiotherapeut niet gevonden of niet actief.");
      validateUserTherapistPairing(user.role, entry.therapistId);
      const dateKey = entry.date.toISOString().slice(0, 10);
      validateHourEntryDraft({
        dateKey,
        now: new Date(`${databaseToday}T12:00:00.000Z`),
        hours: entry.hours,
        workPackageId: entry.workPackageId,
        activityWorkPackageId: activity.workPackageId,
      });
      if (dateKey > databaseToday) throw new PlanningHourInputError("Toekomstige werkzaamheden kunnen niet worden ingediend of goedgekeurd.");

      const data: Prisma.HourEntryUpdateManyMutationInput = { status: transition.after };
      if (body.action === "approve") {
        data.approvedAt = new Date();
        data.approvedBy = session.user.id;
      } else if (body.action === "return_to_draft") {
        data.approvedAt = null;
        data.approvedBy = null;
      }
      const mutation = await tx.hourEntry.updateMany({
        where: {
          id: entry.id,
          status: entry.status,
          updatedAt: entry.updatedAt,
          sourceForecastEntryId: entry.sourceForecastEntryId,
        },
        data,
      });
      assertHourEntryCasUpdated(mutation.count);
      await tx.auditEvent.create({
        data: {
          entityType: "HourEntry",
          entityId: entry.id,
          action: lifecycleAuditAction(body.action),
          reason,
          beforeData: {
            status: transition.before,
            sourceForecastEntryId: entry.sourceForecastEntryId,
            sourceReference: planningReview.sourceReference,
            performedConfirmation: true,
          },
          afterData: {
            status: transition.after,
            sourceForecastEntryId: entry.sourceForecastEntryId,
            sourceReference: planningReview.sourceReference,
            performedConfirmation: true,
            ...(body.action === "approve" ? { reviewConfirmation: true } : {}),
          },
          actorUserId: session.user.id,
        },
      });
      return tx.hourEntry.findUniqueOrThrow({ where: { id: entry.id } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return NextResponse.json(result);
  } catch (error) {
    if (
      error instanceof PlanningHourConflictError ||
      error instanceof HourEntryConcurrencyError ||
      (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034")
    ) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof PlanningHourInputError || error instanceof HourInputError || error instanceof PrivacyTextError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Planning hour lifecycle error:", error);
    return NextResponse.json({ error: "Het planninguur kon niet auditbaar worden bijgewerkt." }, { status: 500 });
  }
}
