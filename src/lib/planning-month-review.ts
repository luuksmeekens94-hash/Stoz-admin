export interface PlanningMonthForecastDetail {
  plannedDate: string | Date;
  executorName: string;
  plannedHours: number;
}

export interface PlanningMonthAllocation {
  id: string;
  plannedHours: number;
  forecastEntries: PlanningMonthForecastDetail[];
}

export class PlanningMonthReviewError extends Error {}

function roundedHours(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function normalizePlanningExecutor(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("nl-NL");
}

function dateKey(value: string | Date) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value.slice(0, 10);
}

export function validatePlanningMonthForApproval(
  monthKey: string,
  allocations: PlanningMonthAllocation[],
) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey)) {
    throw new PlanningMonthReviewError("De gekozen planmaand is ongeldig.");
  }
  if (allocations.length === 0) {
    throw new PlanningMonthReviewError("Deze maand bevat geen planregels om goed te keuren.");
  }

  let detailCount = 0;
  let totalHours = 0;
  const dailyHours = new Map<string, number>();

  for (const allocation of allocations) {
    if (allocation.forecastEntries.length === 0) {
      throw new PlanningMonthReviewError("Iedere planregel moet concrete forecastdetails bevatten.");
    }
    if (
      !Number.isFinite(allocation.plannedHours) ||
      allocation.plannedHours <= 0 ||
      !Number.isInteger(allocation.plannedHours * 4)
    ) {
      throw new PlanningMonthReviewError("Het maandtotaal moet positief en in kwartieren zijn.");
    }

    let allocationDetailTotal = 0;
    for (const detail of allocation.forecastEntries) {
      const plannedDate = dateKey(detail.plannedDate);
      const executorKey = normalizePlanningExecutor(detail.executorName);
      if (!executorKey) {
        throw new PlanningMonthReviewError("Iedere forecastdetail vereist een uitvoerder.");
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(plannedDate) || plannedDate.slice(0, 7) !== monthKey) {
        throw new PlanningMonthReviewError("Iedere forecastdatum moet binnen de gekozen maand vallen.");
      }
      if (
        !Number.isFinite(detail.plannedHours) ||
        detail.plannedHours <= 0 ||
        detail.plannedHours > 24 ||
        !Number.isInteger(detail.plannedHours * 4)
      ) {
        throw new PlanningMonthReviewError("Forecasturen moeten positief, maximaal 24 en in kwartieren zijn.");
      }

      allocationDetailTotal += detail.plannedHours;
      detailCount += 1;
      const dailyKey = `${plannedDate}\u001f${executorKey}`;
      const dailyTotal = roundedHours((dailyHours.get(dailyKey) || 0) + detail.plannedHours);
      if (dailyTotal > 24) {
        throw new PlanningMonthReviewError(
          "Een uitvoerder mag over alle allocaties samen maximaal 24 uur op één datum hebben.",
        );
      }
      dailyHours.set(dailyKey, dailyTotal);
    }

    if (roundedHours(allocationDetailTotal) !== roundedHours(allocation.plannedHours)) {
      throw new PlanningMonthReviewError(
        "Het detailtotaal sluit niet aan op het maandtotaal van de planregel.",
      );
    }
    totalHours += allocation.plannedHours;
  }

  return {
    allocationCount: allocations.length,
    detailCount,
    totalHours: roundedHours(totalHours),
  };
}
