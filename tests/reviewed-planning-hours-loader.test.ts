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

    const findAudits = vi.fn().mockResolvedValue([]);
    await expect(loadReviewedPlanningHours({ forecastEntry: { findMany }, auditEvent: { findMany: findAudits } } as never)).resolves.toEqual([
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

  it("verbergt forecastregels die al door een goedgekeurde historische reconstructie zijn afgedekt", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: "forecast-covered",
        plannedDate: new Date("2026-08-10T00:00:00.000Z"),
        executorName: "Luuk Smeekens",
        plannedHours: 3,
        note: "Projectsturing uitgevoerd.",
        allocation: {
          monthStart: new Date("2026-08-01T00:00:00.000Z"),
          workPackage: { code: "WP1" },
          activity: { code: "A1.1", name: "Projectmanagement" },
        },
      },
    ]);
    const findAudits = vi.fn().mockResolvedValue([{ entityId: "forecast-covered" }]);

    await expect(loadReviewedPlanningHours({
      forecastEntry: { findMany },
      auditEvent: { findMany: findAudits },
    } as never)).resolves.toEqual([]);
  });
});
