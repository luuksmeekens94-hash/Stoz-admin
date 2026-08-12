import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { requireAdmin } from "@/lib/auth";
import {
  buildForecastEntrySuggestions,
  buildForecastExecutorCatalog,
  buildRebalancedFutureMonthlyPlan,
  type ForecastExecutorCatalog,
} from "@/lib/monthly-hour-planning";
import { prisma } from "@/lib/prisma";
import { assertNoDirectIdentifiers, PrivacyTextError } from "@/lib/privacy-text";

const REBALANCE_KEY = "future-rebalance-2026-08-v2";
const FUTURE_START = new Date("2026-09-01T00:00:00.000Z");
const FUTURE_END = new Date("2027-08-01T00:00:00.000Z");

function isoMonth(date: Date) {
  return date.toISOString().slice(0, 7);
}

function fingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function auditString(value: Prisma.JsonValue | null | undefined, key: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value[key];
  return typeof candidate === "string" ? candidate : null;
}

function semanticAllocationSnapshot(allocations: Array<{
  monthStart: Date;
  budgetLineKey?: string;
  roleCategory?: string;
  label?: string;
  workPackageId?: string;
  activityId?: string;
  plannedHours: number;
  rationale?: string;
  sourceState?: string;
  reviewState: string;
  forecastEntries: Array<{ plannedDate?: Date; executorName?: string; plannedHours: number; note?: string | null }>;
}>) {
  return allocations.map((allocation) => ({
    monthStart: allocation.monthStart.toISOString().slice(0, 10),
    budgetLineKey: allocation.budgetLineKey,
    roleCategory: allocation.roleCategory,
    label: allocation.label,
    workPackageId: allocation.workPackageId,
    activityId: allocation.activityId,
    plannedHours: allocation.plannedHours,
    rationale: allocation.rationale,
    sourceState: allocation.sourceState,
    reviewState: allocation.reviewState,
    forecastEntries: allocation.forecastEntries.map((entry) => ({
      plannedDate: entry.plannedDate?.toISOString().slice(0, 10),
      executorName: entry.executorName,
      plannedHours: entry.plannedHours,
      note: entry.note,
    })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b), "nl")),
  })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b), "nl"));
}

function auditableAllocationSnapshot(allocations: Array<{
  id: string;
  monthStart: Date;
  budgetLineKey: string;
  roleCategory: string;
  label: string;
  workPackageId: string;
  activityId: string;
  plannedHours: number;
  rationale: string;
  sourceState: string;
  reviewState: string;
  forecastEntries: Array<{
    id: string;
    plannedDate: Date;
    executorName: string;
    plannedHours: number;
    note: string | null;
    materializedHourEntry: { id: string } | null;
  }>;
}>) {
  return allocations.map((allocation) => ({
    id: allocation.id,
    monthStart: allocation.monthStart.toISOString().slice(0, 10),
    budgetLineKey: allocation.budgetLineKey,
    roleCategory: allocation.roleCategory,
    label: allocation.label,
    workPackageId: allocation.workPackageId,
    activityId: allocation.activityId,
    plannedHours: allocation.plannedHours,
    rationale: allocation.rationale,
    sourceState: allocation.sourceState,
    reviewState: allocation.reviewState,
    forecastEntries: allocation.forecastEntries.map((entry) => ({
      id: entry.id,
      plannedDate: entry.plannedDate.toISOString().slice(0, 10),
      executorName: entry.executorName,
      plannedHours: entry.plannedHours,
      note: entry.note,
      materializedHourEntryId: entry.materializedHourEntry?.id ?? null,
    })).sort((a, b) => a.id.localeCompare(b.id, "nl")),
  })).sort((a, b) => a.id.localeCompare(b.id, "nl"));
}

export async function POST(request: Request) {
  try {
    const session = await requireAdmin();
    let input: unknown;
    try {
      input = await request.json();
    } catch {
      return NextResponse.json({ error: "Ongeldige JSON-aanvraag." }, { status: 400 });
    }
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      return NextResponse.json({ error: "De aanvraag moet een object zijn." }, { status: 400 });
    }
    const body = input as Record<string, unknown>;
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (Object.keys(body).some((key) => key !== "reason") || reason.length < 10 || reason.length > 500) {
      return NextResponse.json({ error: "Geef een concrete herijkingsreden van 10 tot 500 tekens." }, { status: 400 });
    }
    assertNoDirectIdentifiers(reason, "herijkingsreden");

    const plan = buildRebalancedFutureMonthlyPlan();
    const suggestions = plan.flatMap((month) => month.suggestions);
    const workPackageCodes = Array.from(new Set(suggestions.map((row) => row.workPackageCode)));
    const activityCodes = Array.from(new Set(suggestions.map((row) => row.activityCode)));
    const [workPackages, activities, budgetRows, contributionRows] = await Promise.all([
      prisma.workPackage.findMany({
        where: { code: { in: workPackageCodes } },
        select: { id: true, code: true },
      }),
      prisma.activity.findMany({
        where: { code: { in: activityCodes } },
        select: { id: true, code: true, workPackage: { select: { code: true } } },
      }),
      prisma.budgetAllocation.findMany({
        where: { userId: { not: null } },
        select: { category: true, user: { select: { id: true, name: true, active: true } } },
      }),
      prisma.hourEntry.findMany({
        where: { date: { lte: new Date() } },
        select: {
          userId: true,
          user: { select: { name: true } },
          therapist: { select: { name: true, active: true } },
          workPackage: { select: { code: true } },
        },
      }),
    ]);
    const workPackageByCode = new Map(workPackages.map((row) => [row.code, row.id]));
    const activityByCode = new Map(activities.map((row) => [row.code, row]));
    for (const suggestion of suggestions) {
      const activity = activityByCode.get(suggestion.activityCode);
      if (!workPackageByCode.has(suggestion.workPackageCode) || !activity) {
        return NextResponse.json(
          { error: `Configuratie ontbreekt voor ${suggestion.workPackageCode}/${suggestion.activityCode}.` },
          { status: 409 },
        );
      }
      if (activity.workPackage.code !== suggestion.workPackageCode) {
        return NextResponse.json(
          { error: `Activiteit ${suggestion.activityCode} hoort niet bij ${suggestion.workPackageCode}.` },
          { status: 409 },
        );
      }
    }
    const executorCatalog = buildForecastExecutorCatalog(budgetRows, contributionRows);

    const result = await prisma.$transaction(async (tx) => {
      const version = await tx.planningVersion.findFirst({
        where: { status: "CONCEPT" },
        orderBy: { revision: "desc" },
        select: {
          id: true,
          revision: true,
          allocations: {
            select: {
              id: true,
              monthStart: true,
              budgetLineKey: true,
              roleCategory: true,
              label: true,
              workPackageId: true,
              activityId: true,
              plannedHours: true,
              rationale: true,
              sourceState: true,
              reviewState: true,
              forecastEntries: {
                select: {
                  id: true,
                  plannedDate: true,
                  executorName: true,
                  plannedHours: true,
                  note: true,
                  materializedHourEntry: { select: { id: true } },
                },
              },
            },
          },
        },
      });
      if (!version) throw new Error("PLANNING_NOT_FOUND");

      const statesByMonth = new Map<string, Set<string>>();
      for (const allocation of version.allocations) {
        const key = isoMonth(allocation.monthStart);
        const states = statesByMonth.get(key) || new Set<string>();
        states.add(allocation.reviewState);
        statesByMonth.set(key, states);
      }
      if (Array.from(statesByMonth.values()).some((states) => states.size !== 1)) {
        throw new Error("MIXED_MONTH_REVIEW_STATE");
      }

      const draftAllocations = version.allocations.filter((allocation) =>
        allocation.monthStart >= FUTURE_START
        && allocation.monthStart <= FUTURE_END
        && allocation.reviewState === "DRAFT",
      );
      if (draftAllocations.some((allocation) => allocation.forecastEntries.some((entry) => entry.materializedHourEntry))) {
        throw new Error("DRAFT_FORECAST_ALREADY_MATERIALIZED");
      }
      if (draftAllocations.some((allocation) => {
        const detailTotal = allocation.forecastEntries.reduce((sum, entry) => sum + entry.plannedHours, 0);
        return Math.abs(detailTotal - allocation.plannedHours) > 0.001;
      })) {
        throw new Error("DRAFT_FORECAST_TOTAL_MISMATCH");
      }

      const draftMonths = new Set(draftAllocations.map((allocation) => isoMonth(allocation.monthStart)));
      const reviewedMonthsPreserved = Array.from(statesByMonth.entries())
        .filter(([, states]) => states.has("REVIEWED"))
        .map(([key]) => key)
        .sort();
      const replacementSuggestions = suggestions.filter((suggestion) => draftMonths.has(suggestion.monthKey));
      if (draftMonths.size === 0 || replacementSuggestions.length === 0) throw new Error("NO_DRAFT_FUTURE_MONTHS");

      const replacementPlans = replacementSuggestions.map((suggestion) => ({
        suggestion,
        forecastEntries: buildForecastEntrySuggestions(suggestion, executorCatalog),
      }));
      const targetStateFingerprint = fingerprint(semanticAllocationSnapshot(replacementPlans.map(({ suggestion, forecastEntries }) => ({
        monthStart: new Date(`${suggestion.monthKey}-01T00:00:00.000Z`),
        budgetLineKey: suggestion.budgetLineKey,
        roleCategory: suggestion.roleCategory,
        label: suggestion.label,
        workPackageId: workPackageByCode.get(suggestion.workPackageCode)!,
        activityId: activityByCode.get(suggestion.activityCode)!.id,
        plannedHours: suggestion.plannedHours,
        rationale: suggestion.rationale,
        sourceState: suggestion.sourceState,
        reviewState: "DRAFT",
        forecastEntries: forecastEntries.map((entry) => ({
          plannedDate: new Date(`${entry.plannedDate}T00:00:00.000Z`),
          executorName: entry.executorName,
          plannedHours: entry.plannedHours,
          note: entry.note,
        })),
      }))));
      const currentStateFingerprint = fingerprint(semanticAllocationSnapshot(draftAllocations));
      const requestFingerprint = fingerprint({ reason, targetStateFingerprint });
      const auditEntityId = `${version.id}:${REBALANCE_KEY}`;
      const existingAudit = await tx.auditEvent.findFirst({
        where: {
          entityType: "PlanningVersion",
          entityId: auditEntityId,
          action: "REBALANCED_FUTURE_OPERATIONAL_FORECAST",
        },
        orderBy: { createdAt: "desc" },
        select: { id: true, afterData: true },
      });
      if (
        existingAudit
        && auditString(existingAudit.afterData, "stateFingerprint") === currentStateFingerprint
        && auditString(existingAudit.afterData, "requestFingerprint") === requestFingerprint
      ) {
        return { revision: version.revision, idempotent: true, reviewedMonthsPreserved };
      }

      const deleted = await tx.monthlyPlanAllocation.deleteMany({
        where: {
          planningVersionId: version.id,
          reviewState: "DRAFT",
          monthStart: { gte: FUTURE_START, lte: FUTURE_END },
        },
      });
      if (deleted.count !== draftAllocations.length) throw new Error("PLANNING_CONCURRENT_CHANGE");

      for (const { suggestion, forecastEntries } of replacementPlans) {
        await tx.monthlyPlanAllocation.create({
          data: {
            planningVersionId: version.id,
            monthStart: new Date(`${suggestion.monthKey}-01T00:00:00.000Z`),
            budgetLineKey: suggestion.budgetLineKey,
            roleCategory: suggestion.roleCategory,
            label: suggestion.label,
            workPackageId: workPackageByCode.get(suggestion.workPackageCode)!,
            activityId: activityByCode.get(suggestion.activityCode)!.id,
            plannedHours: suggestion.plannedHours,
            rationale: suggestion.rationale,
            sourceState: suggestion.sourceState,
            reviewState: "DRAFT",
            forecastEntries: {
              create: forecastEntries.map((entry) => ({
                plannedDate: new Date(`${entry.plannedDate}T00:00:00.000Z`),
                executorName: entry.executorName,
                plannedHours: entry.plannedHours,
                note: entry.note,
              })),
            },
          },
        });
      }

      const beforeDraftHours = draftAllocations.reduce((sum, allocation) => sum + allocation.plannedHours, 0);
      const afterDraftHours = replacementSuggestions.reduce((sum, suggestion) => sum + suggestion.plannedHours, 0);
      await tx.auditEvent.create({
        data: {
          entityType: "PlanningVersion",
          entityId: auditEntityId,
          action: "REBALANCED_FUTURE_OPERATIONAL_FORECAST",
          reason,
          beforeData: {
            revision: version.revision,
            allocationCount: draftAllocations.length,
            totalHours: Math.round(beforeDraftHours * 100) / 100,
            months: Array.from(draftMonths).sort(),
            allocations: auditableAllocationSnapshot(draftAllocations),
          },
          afterData: {
            revision: version.revision,
            calculationVersion: REBALANCE_KEY,
            stateFingerprint: targetStateFingerprint,
            requestFingerprint,
            allocationCount: replacementSuggestions.length,
            totalHours: Math.round(afterDraftHours * 100) / 100,
            reviewedMonthsPreserved,
          },
          actorUserId: session.user.id,
        },
      });

      return {
        revision: version.revision,
        idempotent: false,
        reviewedMonthsPreserved,
        replacedAllocationCount: draftAllocations.length,
        createdAllocationCount: replacementSuggestions.length,
        beforeDraftHours: Math.round(beforeDraftHours * 100) / 100,
        afterDraftHours: Math.round(afterDraftHours * 100) / 100,
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof PrivacyTextError) return NextResponse.json({ error: error.message }, { status: 400 });
    const message = error instanceof Error ? error.message : "";
    if (message === "UNAUTHORIZED") return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
    if (message === "FORBIDDEN") return NextResponse.json({ error: "Alleen een beheerder kan de toekomstplanning herijken." }, { status: 403 });
    if (message === "PLANNING_NOT_FOUND") return NextResponse.json({ error: "Actieve conceptplanning niet gevonden." }, { status: 404 });
    if (message === "MIXED_MONTH_REVIEW_STATE") return NextResponse.json({ error: "Een planmaand bevat gemengde reviewstatussen; herijking is geblokkeerd." }, { status: 409 });
    if (message === "DRAFT_FORECAST_ALREADY_MATERIALIZED") return NextResponse.json({ error: "Een te vervangen conceptregel is al aan een urenregistratie gekoppeld." }, { status: 409 });
    if (message === "DRAFT_FORECAST_TOTAL_MISMATCH") return NextResponse.json({ error: "Forecastdetails sluiten niet aan op het maandtotaal; herijking is geblokkeerd." }, { status: 409 });
    if (message === "NO_DRAFT_FUTURE_MONTHS") return NextResponse.json({ error: "Er zijn geen toekomstige conceptmaanden om te herijken." }, { status: 409 });
    if (message.startsWith("Geen echte uitvoerder beschikbaar voor ")) {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    if (message === "PLANNING_CONCURRENT_CHANGE" || (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034")) {
      return NextResponse.json({ error: "De planning is gelijktijdig gewijzigd. Vernieuw de pagina." }, { status: 409 });
    }
    console.error("Future planning rebalance error:", error);
    return NextResponse.json({ error: "Toekomstplanning herijken mislukt." }, { status: 500 });
  }
}
