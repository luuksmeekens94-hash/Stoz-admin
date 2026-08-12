import { describe, expect, it, vi } from "vitest";
import { loadReviewedPlanningHours } from "@/lib/reviewed-planning-hours";

describe("loadReviewedPlanningHours", () => {
  it("laadt alleen goedgekeurde detailregels uit de nieuwste actieve planning en bewaart planstatus apart", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: "forecast-1",
        plannedDate: new Date("2026-08-10T00:00:00.000Z"),
        executorName: "Luuk Smeekens",
        plannedHours: 3,
        note: "Indicatoren en inrichting van de gebruiksmonitoring.",
        allocation: {
          monthStart: new Date("2026-08-01T00:00:00.000Z"),
          workPackage: { code: "WP6" },
          activity: { code: "A6.1", name: "Monitoring" },
        },
      },
    ]);

    await expect(loadReviewedPlanningHours({ forecastEntry: { findMany } } as never)).resolves.toEqual([
      {
        id: "forecast-1",
        plannedDate: "2026-08-10",
        executorName: "Luuk Smeekens",
        plannedHours: 3,
        note: "Indicatoren en inrichting van de gebruiksmonitoring.",
        workPackageCode: "WP6",
        activityCode: "A6.1",
        activityName: "Monitoring",
        monthLabel: "augustus 2026",
      },
    ]);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        materializedHourEntry: { is: null },
        allocation: {
          reviewState: "REVIEWED",
          planningVersion: { status: "CONCEPT" },
        },
      },
    }));
  });
});
