import { prisma } from "@/lib/prisma";
import type { ReviewedPlanningHourRow } from "@/components/ReviewedPlanningHours";

interface ReviewedPlanningHoursClient {
  forecastEntry: Pick<typeof prisma.forecastEntry, "findMany">;
  auditEvent: Pick<typeof prisma.auditEvent, "findMany">;
}

export async function loadReviewedPlanningHours(
  client: ReviewedPlanningHoursClient = prisma,
): Promise<ReviewedPlanningHourRow[]> {
  const rows = await client.forecastEntry.findMany({
    where: {
      materializedHourEntry: { is: null },
      allocation: {
        reviewState: "REVIEWED",
        planningVersion: { status: "CONCEPT" },
      },
    },
    orderBy: [{ plannedDate: "desc" }, { executorName: "asc" }],
    select: {
      id: true,
      plannedDate: true,
      executorName: true,
      plannedHours: true,
      note: true,
      allocation: {
        select: {
          monthStart: true,
          workPackage: { select: { code: true } },
          activity: { select: { code: true, name: true } },
        },
      },
    },
  });
  if (rows.length === 0) return [];
  const historicalCoverageAudits = await client.auditEvent.findMany({
    where: {
      entityType: "ForecastEntry",
      entityId: { in: rows.map((row) => row.id) },
      action: "CONFIRMED_REVIEWED_FORECAST_IN_HISTORICAL_RECONSTRUCTION",
    },
    select: { entityId: true },
  });
  const historicallyCoveredIds = new Set(historicalCoverageAudits.map((audit) => audit.entityId));

  return rows.filter((row) => !historicallyCoveredIds.has(row.id)).map((row) => ({
    id: row.id,
    plannedDate: row.plannedDate.toISOString().slice(0, 10),
    executorName: row.executorName,
    plannedHours: row.plannedHours,
    note: row.note,
    workPackageCode: row.allocation.workPackage.code,
    activityCode: row.allocation.activity.code,
    activityName: row.allocation.activity.name,
    monthLabel: row.allocation.monthStart.toLocaleDateString("nl-NL", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }),
  }));
}
