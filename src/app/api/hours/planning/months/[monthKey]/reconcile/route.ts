import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { databaseAmsterdamDateKey } from "@/lib/hour-entry-db";
import { HourInputError, validateUserTherapistPairing } from "@/lib/hour-entry-validation";
import {
  assertNoOrdinaryEntryOverlapsHistoricalReconstruction,
  partitionEntriesCoveredByHistoricalReconstruction,
  validateHistoricalReconstructionTargetsForScopes,
} from "@/lib/historical-reconstruction-db";
import { HistoricalReconstructionIntegrityError } from "@/lib/historical-reconstruction-integrity";
import { assertNoDirectIdentifiers, PrivacyTextError } from "@/lib/privacy-text";

class MonthReconciliationInputError extends Error {}
class MonthReconciliationConflictError extends Error {}

interface ReconciliationRow {
  forecastEntryId: string;
  userId: string;
  therapistId: string | null;
}

function monthRange(monthKey: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey)) {
    throw new MonthReconciliationInputError("De gekozen planmaand is ongeldig.");
  }
  const [year, month] = monthKey.split("-").map(Number);
  return {
    start: new Date(Date.UTC(year, month - 1, 1)),
    end: new Date(Date.UTC(year, month, 1)),
  };
}

function parseBody(value: unknown): {
  sourceReference: string | null;
  performedConfirmation: true;
  rows: ReconciliationRow[];
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new MonthReconciliationInputError("Het verzoek moet een object zijn.");
  }
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => !["sourceReference", "performedConfirmation", "rows"].includes(key))) {
    throw new MonthReconciliationInputError("Het verzoek bevat een onbekend veld.");
  }
  const sourceReference = typeof input.sourceReference === "string" && input.sourceReference.trim()
    ? input.sourceReference.trim()
    : null;
  if (sourceReference && (sourceReference.length < 20 || sourceReference.length > 2000)) {
    throw new MonthReconciliationInputError("Geef een bron of onderbouwing van 20 tot 2000 tekens.");
  }
  if (input.performedConfirmation !== true) {
    throw new MonthReconciliationInputError("Bevestig eerst dat alle werkzaamheden werkelijk zijn uitgevoerd.");
  }
  if (!Array.isArray(input.rows)) throw new MonthReconciliationInputError("Urenregels ontbreken.");
  const rows = input.rows.map((value): ReconciliationRow => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new MonthReconciliationInputError("Een urenregel is ongeldig.");
    }
    const row = value as Record<string, unknown>;
    if (Object.keys(row).some((key) => !["forecastEntryId", "userId", "therapistId"].includes(key))) {
      throw new MonthReconciliationInputError("Een urenregel bevat een onbekend veld.");
    }
    const forecastEntryId = typeof row.forecastEntryId === "string" ? row.forecastEntryId.trim() : "";
    const userId = typeof row.userId === "string" ? row.userId.trim() : "";
    const therapistId = row.therapistId === null
      ? null
      : typeof row.therapistId === "string"
        ? row.therapistId.trim()
        : "";
    if (!forecastEntryId || !userId || therapistId === "") {
      throw new MonthReconciliationInputError("Kies voor iedere regel een geldige uitvoerder.");
    }
    return { forecastEntryId, userId, therapistId };
  });
  if (new Set(rows.map((row) => row.forecastEntryId)).size !== rows.length) {
    throw new MonthReconciliationInputError("Een planregel staat meer dan één keer in het verzoek.");
  }
  return { sourceReference, performedConfirmation: true, rows };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ monthKey: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Alleen een beheerder kan een planmaand als werkelijk uitgevoerd goedkeuren." }, { status: 403 });
  }

  try {
    let raw: unknown;
    try { raw = await request.json(); } catch { throw new MonthReconciliationInputError("Het verzoek bevat geen geldige JSON."); }
    const body = parseBody(raw);
    if (body.sourceReference) assertNoDirectIdentifiers(body.sourceReference, "brononderbouwing");
    const { monthKey } = await params;
    const range = monthRange(monthKey);

    const result = await prisma.$transaction(async (tx) => {
      const activeVersion = await tx.planningVersion.findFirst({
        where: { status: "CONCEPT" },
        orderBy: { revision: "desc" },
        select: { id: true, revision: true },
      });
      if (!activeVersion) {
        throw new MonthReconciliationConflictError("Er is geen actieve conceptplanning gevonden.");
      }
      const forecasts = await tx.forecastEntry.findMany({
        where: {
          plannedDate: { gte: range.start, lt: range.end },
          allocation: {
            reviewState: "REVIEWED",
            planningVersionId: activeVersion.id,
          },
        },
        orderBy: [{ plannedDate: "asc" }, { executorName: "asc" }],
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
      if (forecasts.length === 0) throw new MonthReconciliationConflictError("Deze maand heeft geen openstaande goedgekeurde planning.");

      const forecastIds = forecasts.map((forecast) => forecast.id);
      const [existingEntries, priorDecisions, users, therapists, databaseToday] = await Promise.all([
        tx.hourEntry.findMany({
          where: { sourceForecastEntryId: { in: forecastIds } },
          select: { id: true, sourceForecastEntryId: true, status: true, hours: true },
        }),
        tx.auditEvent.findMany({
          where: {
            entityType: "ForecastEntry",
            entityId: { in: forecastIds },
            action: { in: [
              "MATERIALIZED_REVIEWED_FORECAST",
              "CONFIRMED_REVIEWED_FORECAST_IN_HISTORICAL_RECONSTRUCTION",
            ] },
          },
          select: { entityId: true, action: true, beforeData: true, afterData: true },
        }),
        tx.user.findMany({
          where: { id: { in: Array.from(new Set(body.rows.map((row) => row.userId))) }, active: true },
          select: { id: true, role: true, active: true },
        }),
        tx.therapist.findMany({
          where: {
            id: { in: Array.from(new Set(body.rows.flatMap((row) => row.therapistId || []))) },
            active: true,
          },
          select: { id: true },
        }),
        databaseAmsterdamDateKey(tx),
      ]);
      if (monthKey >= databaseToday.slice(0, 7)) {
        throw new MonthReconciliationInputError("Alleen volledig afgesloten maanden kunnen in één keer worden goedgekeurd.");
      }
      const sourceReference = body.sourceReference ||
        `Maandcontrole ${monthKey} door beheerder ${session.user.id} op ${databaseToday}: uitvoering per planregel expliciet bevestigd.`;
      const existingByForecastId = new Map(existingEntries.map((entry) => [entry.sourceForecastEntryId, entry]));
      if (existingEntries.some((entry) => entry.status !== "APPROVED")) {
        throw new MonthReconciliationConflictError(
          "Deze maand bevat al concept- of ingediende planninguren. Rond die regels eerst afzonderlijk af.",
        );
      }
      const materializedDecisionIds = new Set(priorDecisions
        .filter((audit) => audit.action === "MATERIALIZED_REVIEWED_FORECAST")
        .map((audit) => audit.entityId));
      const historicallyCoveredDecisionIds = new Set(priorDecisions
        .filter((audit) => audit.action === "CONFIRMED_REVIEWED_FORECAST_IN_HISTORICAL_RECONSTRUCTION")
        .map((audit) => audit.entityId));
      if (Array.from(materializedDecisionIds).some((id) => !existingByForecastId.has(id))) {
        throw new MonthReconciliationConflictError("Een eerder verwerkte planregel mist zijn gekoppelde urenregistratie.");
      }
      if (existingEntries.some((entry) => !entry.sourceForecastEntryId || !materializedDecisionIds.has(entry.sourceForecastEntryId))) {
        throw new MonthReconciliationConflictError("Een gekoppeld planninguur mist zijn verplichte forecastaudit.");
      }
      const forecastById = new Map(forecasts.map((forecast) => [forecast.id, forecast]));
      const previouslyCoveredCandidates = priorDecisions
        .filter((audit) => audit.action === "CONFIRMED_REVIEWED_FORECAST_IN_HISTORICAL_RECONSTRUCTION")
        .map((audit) => {
          const forecast = forecastById.get(audit.entityId);
          const beforeData = audit.beforeData;
          const data = audit.afterData;
          if (
            !forecast ||
            !beforeData || typeof beforeData !== "object" || Array.isArray(beforeData) ||
            !data || typeof data !== "object" || Array.isArray(data)
          ) {
            throw new HistoricalReconstructionIntegrityError("Een eerdere historische forecastbevestiging is niet volledig herleidbaar.");
          }
          const before = beforeData as Record<string, unknown>;
          const row = data as Record<string, unknown>;
          if (
            before.plannedDate !== forecast.plannedDate.toISOString().slice(0, 10) ||
            before.plannedExecutorName !== forecast.executorName ||
            before.plannedHours !== forecast.plannedHours ||
            typeof row.userId !== "string" ||
            (row.therapistId !== null && typeof row.therapistId !== "string") ||
            row.workPackageId !== forecast.allocation.workPackageId ||
            row.activityId !== forecast.allocation.activityId ||
            row.plannedHours !== forecast.plannedHours
          ) {
            throw new HistoricalReconstructionIntegrityError("Een eerdere historische forecastbevestiging wijkt af van de actieve planning.");
          }
          return {
            id: forecast.id,
            userId: row.userId,
            therapistId: row.therapistId as string | null,
            workPackageId: forecast.allocation.workPackageId,
            activityId: forecast.allocation.activityId,
            date: forecast.plannedDate,
            hours: forecast.plannedHours,
          };
        });
      if (previouslyCoveredCandidates.length > 0) {
        const revalidated = await partitionEntriesCoveredByHistoricalReconstruction(
          tx,
          previouslyCoveredCandidates,
          { excludeForecastIds: previouslyCoveredCandidates.map((candidate) => candidate.id) },
        );
        if (revalidated.coveredIds.size !== previouslyCoveredCandidates.length) {
          throw new HistoricalReconstructionIntegrityError("Een eerdere historische forecastbevestiging wordt niet meer door de reconstructie afgedekt.");
        }
      }

      const openForecasts = forecasts.filter((forecast) =>
        !existingByForecastId.has(forecast.id) && !historicallyCoveredDecisionIds.has(forecast.id));
      if (openForecasts.length === 0) {
        throw new MonthReconciliationConflictError("Alle planninguren van deze maand zijn al goedgekeurd.");
      }
      const requestedIds = [...body.rows.map((row) => row.forecastEntryId)].sort();
      const expectedIds = openForecasts.map((forecast) => forecast.id).sort();
      if (requestedIds.length !== expectedIds.length || requestedIds.some((id, index) => id !== expectedIds[index])) {
        throw new MonthReconciliationConflictError("Beoordeel alle openstaande regels van de maand tegelijk. Vernieuw de pagina.");
      }

      const userById = new Map(users.map((user) => [user.id, user]));
      const therapistIds = new Set(therapists.map((therapist) => therapist.id));
      for (const row of body.rows) {
        const user = userById.get(row.userId);
        if (!user || (row.therapistId && !therapistIds.has(row.therapistId))) {
          throw new MonthReconciliationInputError("Een gekozen uitvoerder bestaat niet of is niet meer actief.");
        }
        validateUserTherapistPairing(user.role, row.therapistId);
      }

      const rowByForecastId = new Map(body.rows.map((row) => [row.forecastEntryId, row]));
      const protectedEntries = openForecasts.map((forecast) => {
        const row = rowByForecastId.get(forecast.id)!;
        return {
          userId: row.userId,
          therapistId: row.therapistId,
          workPackageId: forecast.allocation.workPackageId,
          activityId: forecast.allocation.activityId,
          id: forecast.id,
          date: forecast.plannedDate,
          hours: forecast.plannedHours,
        };
      });
      const historicalCoverage = await partitionEntriesCoveredByHistoricalReconstruction(tx, protectedEntries);
      const historicallyCoveredForecasts = openForecasts.filter((forecast) => historicalCoverage.coveredIds.has(forecast.id));
      const uncoveredForecasts = openForecasts.filter((forecast) => !historicalCoverage.coveredIds.has(forecast.id));
      const uncoveredEntries = protectedEntries.filter((entry) => !historicalCoverage.coveredIds.has(entry.id));
      await assertNoOrdinaryEntryOverlapsHistoricalReconstruction(tx, uncoveredEntries);
      for (const forecast of historicallyCoveredForecasts) {
        await tx.auditEvent.create({
          data: {
            entityType: "ForecastEntry",
            entityId: forecast.id,
            action: "CONFIRMED_REVIEWED_FORECAST_IN_HISTORICAL_RECONSTRUCTION",
            reason: sourceReference,
            beforeData: {
              plannedDate: forecast.plannedDate.toISOString().slice(0, 10),
              plannedExecutorName: forecast.executorName,
              plannedHours: forecast.plannedHours,
            },
            afterData: {
              performedConfirmation: true,
              historicallyCovered: true,
              status: "APPROVED",
              userId: rowByForecastId.get(forecast.id)!.userId,
              therapistId: rowByForecastId.get(forecast.id)!.therapistId,
              workPackageId: forecast.allocation.workPackageId,
              activityId: forecast.allocation.activityId,
              plannedHours: forecast.plannedHours,
            },
            actorUserId: session.user.id,
          },
        });
      }
      const approvedAt = new Date();
      let approvedHours = 0;
      for (const forecast of uncoveredForecasts) {
        const row = rowByForecastId.get(forecast.id)!;
        const dateKey = forecast.plannedDate.toISOString().slice(0, 10);
        if (dateKey > databaseToday) {
          throw new MonthReconciliationInputError("Deze maand bevat toekomstige werkzaamheden en kan nog niet volledig worden verwerkt.");
        }
        if (forecast.allocation.activity.workPackageId !== forecast.allocation.workPackageId) {
          throw new MonthReconciliationConflictError("Een geplande activiteit hoort niet bij het gekoppelde werkpakket.");
        }
        const description = forecast.note?.trim() || `${forecast.allocation.activity.name} uitgevoerd volgens goedgekeurde planning.`;
        assertNoDirectIdentifiers(description, "omschrijving");

        const entry = await tx.hourEntry.create({
          data: {
            date: forecast.plannedDate,
            hours: forecast.plannedHours,
            description,
            userId: row.userId,
            therapistId: row.therapistId,
            workPackageId: forecast.allocation.workPackageId,
            activityId: forecast.allocation.activityId,
            sourceForecastEntryId: forecast.id,
            status: "DRAFT",
          },
        });
        const sourceSnapshot = {
          sourceForecastEntryId: forecast.id,
          planningVersionId: forecast.allocation.planningVersion.id,
          planningRevision: forecast.allocation.planningVersion.revision,
          plannedDate: dateKey,
          plannedExecutorName: forecast.executorName,
          plannedHours: forecast.plannedHours,
          plannedNote: forecast.note,
          workPackageCode: forecast.allocation.workPackage.code,
          activityCode: forecast.allocation.activity.code,
        };
        await tx.auditEvent.create({
          data: {
            entityType: "HourEntry",
            entityId: entry.id,
            action: "MATERIALIZED_REVIEWED_FORECAST",
            reason: sourceReference,
            beforeData: sourceSnapshot,
            afterData: {
              actualDate: dateKey,
              actualHours: forecast.plannedHours,
              userId: row.userId,
              therapistId: row.therapistId,
              description,
              status: "DRAFT",
              sourceReference,
              performedConfirmation: true,
            },
            actorUserId: session.user.id,
          },
        });
        const submitted = await tx.hourEntry.updateMany({
          where: { id: entry.id, status: "DRAFT", sourceForecastEntryId: forecast.id },
          data: { status: "SUBMITTED" },
        });
        if (submitted.count !== 1) {
          throw new MonthReconciliationConflictError("Een planninguur is gelijktijdig gewijzigd tijdens het indienen.");
        }
        await tx.auditEvent.create({
          data: {
            entityType: "HourEntry",
            entityId: entry.id,
            action: "SUBMITTED_REVIEWED_FORECAST_HOUR",
            reason: "Maandgewijs ingediend na controle van planning, bron en feitelijke uitvoering.",
            beforeData: { status: "DRAFT", sourceReference, performedConfirmation: true },
            afterData: { status: "SUBMITTED", sourceReference, performedConfirmation: true },
            actorUserId: session.user.id,
          },
        });
        const approved = await tx.hourEntry.updateMany({
          where: { id: entry.id, status: "SUBMITTED", sourceForecastEntryId: forecast.id },
          data: { status: "APPROVED", approvedAt, approvedBy: session.user.id },
        });
        if (approved.count !== 1) {
          throw new MonthReconciliationConflictError("Een planninguur is gelijktijdig gewijzigd tijdens het goedkeuren.");
        }
        await tx.auditEvent.create({
          data: {
            entityType: "HourEntry",
            entityId: entry.id,
            action: "APPROVED_REVIEWED_FORECAST_HOUR",
            reason: "Maandgewijs goedgekeurd na expliciete beoordeling van bron en werkelijke uitvoering.",
            beforeData: { status: "SUBMITTED", sourceReference, performedConfirmation: true },
            afterData: { status: "APPROVED", sourceReference, performedConfirmation: true },
            actorUserId: session.user.id,
          },
        });
        await tx.auditEvent.create({
          data: {
            entityType: "ForecastEntry",
            entityId: forecast.id,
            action: "MATERIALIZED_REVIEWED_FORECAST",
            reason: sourceReference,
            beforeData: { materializedHourEntryId: null },
            afterData: { materializedHourEntryId: entry.id, performedConfirmation: true, status: "APPROVED" },
            actorUserId: session.user.id,
          },
        });
        approvedHours += forecast.plannedHours;
      }

      await validateHistoricalReconstructionTargetsForScopes(tx, uncoveredEntries);

      const totalApprovedHours = Math.round((
        existingEntries.reduce((sum, entry) => sum + entry.hours, 0) + approvedHours
      ) * 100) / 100;

      await tx.auditEvent.create({
        data: {
          entityType: "PlanningMonth",
          entityId: `${forecasts[0].allocation.planningVersion.id}:${monthKey}:actuals`,
          action: "APPROVED_MONTHLY_FORECAST_AS_ACTUALS",
          reason: sourceReference,
          beforeData: {
            monthKey,
            alreadyApprovedCount: existingEntries.length,
            openForecastCount: openForecasts.length,
            plannedHours: forecasts.reduce((sum, forecast) => sum + forecast.plannedHours, 0),
          },
          afterData: {
            monthKey,
            approvedCount: forecasts.length,
            approvedHours: totalApprovedHours,
            historicallyCoveredForecastHours: historicallyCoveredForecasts.reduce((sum, forecast) => sum + forecast.plannedHours, 0),
            performedConfirmation: true,
          },
          actorUserId: session.user.id,
        },
      });
      return { monthKey, approvedCount: openForecasts.length, approvedHours: Math.round(approvedHours * 100) / 100 };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof MonthReconciliationConflictError || error instanceof HistoricalReconstructionIntegrityError ||
      (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2002" || error.code === "P2034"))) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "De maand is gelijktijdig gewijzigd." }, { status: 409 });
    }
    if (error instanceof MonthReconciliationInputError || error instanceof HourInputError || error instanceof PrivacyTextError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Planning month reconciliation error:", error);
    return NextResponse.json({ error: "De planmaand kon niet als werkelijk uitgevoerd worden goedgekeurd." }, { status: 500 });
  }
}
