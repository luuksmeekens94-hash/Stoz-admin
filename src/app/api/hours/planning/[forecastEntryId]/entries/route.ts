import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { databaseAmsterdamDateKey } from "@/lib/hour-entry-db";
import {
  HourInputError,
  parseHourInput,
  parseProjectDateInput,
  validateHourEntryDraft,
  validateUserTherapistPairing,
} from "@/lib/hour-entry-validation";
import { assertNoDirectIdentifiers, PrivacyTextError } from "@/lib/privacy-text";

class PlanningMaterializationError extends Error {}
class PlanningMaterializationConflict extends Error {}

const ALLOWED_FIELDS = new Set([
  "userId", "therapistId", "date", "hours", "description", "sourceReference", "performedConfirmation",
]);

function parseBody(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new PlanningMaterializationError("Het verzoek moet een object zijn.");
  }
  const row = value as Record<string, unknown>;
  const unknown = Object.keys(row).filter((key) => !ALLOWED_FIELDS.has(key));
  if (unknown.length) throw new PlanningMaterializationError(`Onbekend veld: ${unknown.join(", ")}.`);
  const text = (key: string, min: number, max: number) => {
    if (typeof row[key] !== "string") throw new PlanningMaterializationError(`${key} moet tekst zijn.`);
    const normalized = row[key].trim();
    if (normalized.length < min || normalized.length > max) {
      throw new PlanningMaterializationError(`${key} heeft een ongeldige lengte.`);
    }
    return normalized;
  };
  if (row.performedConfirmation !== true) {
    throw new PlanningMaterializationError("Bevestig eerst dat deze werkzaamheden werkelijk zijn uitgevoerd.");
  }
  const therapistId = row.therapistId === null || row.therapistId === undefined
    ? null
    : text("therapistId", 1, 200);
  return {
    userId: text("userId", 1, 200),
    therapistId,
    date: text("date", 10, 10),
    hours: parseHourInput(row.hours),
    description: text("description", 10, 1000),
    sourceReference: text("sourceReference", 20, 2000),
    performedConfirmation: true as const,
  };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ forecastEntryId: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Alleen een beheerder kan goedgekeurde planning registreren." }, { status: 403 });
  }

  try {
    let raw: unknown;
    try { raw = await request.json(); } catch { throw new PlanningMaterializationError("Het verzoek bevat geen geldige JSON."); }
    const body = parseBody(raw);
    assertNoDirectIdentifiers(body.description, "omschrijving");
    assertNoDirectIdentifiers(body.sourceReference, "brononderbouwing");
    const { forecastEntryId } = await params;

    const result = await prisma.$transaction(async (tx) => {
      const forecast = await tx.forecastEntry.findUnique({
        where: { id: forecastEntryId },
        include: {
          allocation: {
            include: {
              workPackage: { select: { code: true } },
              activity: { select: { code: true, name: true, workPackageId: true } },
              planningVersion: { select: { id: true, revision: true, status: true } },
            },
          },
        },
      });
      if (!forecast) throw new PlanningMaterializationError("De geplande regel bestaat niet.");
      if (forecast.allocation.reviewState !== "REVIEWED" || forecast.allocation.planningVersion.status !== "CONCEPT") {
        throw new PlanningMaterializationConflict("Alleen een goedgekeurde regel uit de actieve planning kan worden geregistreerd.");
      }
      if (forecast.allocation.activity.workPackageId !== forecast.allocation.workPackageId) {
        throw new PlanningMaterializationConflict("De activiteit hoort niet bij het geplande werkpakket.");
      }

      const [existing, priorAudit, user, therapist, databaseToday] = await Promise.all([
        tx.hourEntry.findUnique({ where: { sourceForecastEntryId: forecast.id } }),
        tx.auditEvent.findFirst({
          where: { entityType: "ForecastEntry", entityId: forecast.id, action: "MATERIALIZED_REVIEWED_FORECAST" },
          select: { id: true },
        }),
        tx.user.findFirst({ where: { id: body.userId, active: true }, select: { id: true, role: true } }),
        body.therapistId
          ? tx.therapist.findFirst({ where: { id: body.therapistId, active: true }, select: { id: true } })
          : Promise.resolve(null),
        databaseAmsterdamDateKey(tx),
      ]);
      if (existing) throw new PlanningMaterializationConflict("Deze geplande regel is al als concept geregistreerd.");
      if (priorAudit) throw new PlanningMaterializationConflict("Deze geplande regel is eerder geregistreerd en kan niet opnieuw worden gebruikt.");
      if (!user) throw new PlanningMaterializationError("Uitvoerder niet gevonden of niet actief.");
      if (body.therapistId && !therapist) throw new PlanningMaterializationError("Fysiotherapeut niet gevonden of niet actief.");
      validateUserTherapistPairing(user.role, body.therapistId);

      const { date, dateKey } = parseProjectDateInput(body.date);
      validateHourEntryDraft({
        dateKey,
        now: new Date(`${databaseToday}T12:00:00.000Z`),
        hours: body.hours,
        workPackageId: forecast.allocation.workPackageId,
        activityWorkPackageId: forecast.allocation.activity.workPackageId,
      });
      if (dateKey > databaseToday) throw new PlanningMaterializationError("Toekomstige planning kan pas na uitvoering worden geregistreerd.");
      if (body.hours > 24) throw new PlanningMaterializationError("Uren moeten tussen 0 en 24 liggen.");

      const entry = await tx.hourEntry.create({
        data: {
          date,
          hours: body.hours,
          description: body.description,
          userId: body.userId,
          therapistId: body.therapistId,
          workPackageId: forecast.allocation.workPackageId,
          activityId: forecast.allocation.activityId,
          sourceForecastEntryId: forecast.id,
          status: "DRAFT",
        },
      });
      await tx.auditEvent.create({
        data: {
          entityType: "HourEntry",
          entityId: entry.id,
          action: "MATERIALIZED_REVIEWED_FORECAST",
          reason: body.sourceReference,
          beforeData: {
            sourceForecastEntryId: forecast.id,
            planningVersionId: forecast.allocation.planningVersion.id,
            planningRevision: forecast.allocation.planningVersion.revision,
            plannedDate: forecast.plannedDate.toISOString().slice(0, 10),
            plannedExecutorName: forecast.executorName,
            plannedHours: forecast.plannedHours,
            plannedNote: forecast.note,
            workPackageCode: forecast.allocation.workPackage.code,
            activityCode: forecast.allocation.activity.code,
          },
          afterData: {
            actualDate: dateKey,
            actualHours: body.hours,
            userId: body.userId,
            therapistId: body.therapistId,
            description: body.description,
            status: "DRAFT",
            performedConfirmation: true,
          },
          actorUserId: session.user.id,
        },
      });
      await tx.auditEvent.create({
        data: {
          entityType: "ForecastEntry",
          entityId: forecast.id,
          action: "MATERIALIZED_REVIEWED_FORECAST",
          reason: body.sourceReference,
          beforeData: { materializedHourEntryId: null },
          afterData: { materializedHourEntryId: entry.id, performedConfirmation: true },
          actorUserId: session.user.id,
        },
      });
      return entry;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return NextResponse.json({
      id: result.id,
      status: result.status,
      hours: result.hours,
      sourceForecastEntryId: forecastEntryId,
    }, { status: 201 });
  } catch (error) {
    if (error instanceof PlanningMaterializationConflict ||
      (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2002" || error.code === "P2034"))) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Deze geplande regel is al verwerkt." }, { status: 409 });
    }
    if (error instanceof PlanningMaterializationError || error instanceof HourInputError || error instanceof PrivacyTextError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Reviewed forecast materialization error:", error);
    return NextResponse.json({ error: "De geplande regel kon niet als concept worden geregistreerd." }, { status: 500 });
  }
}
