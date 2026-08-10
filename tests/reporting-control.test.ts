import { describe, expect, it } from "vitest";
import {
  buildMonthlyControl,
  isWithinReportCutoff,
  reportCutoffEnd,
  resolveReportAsOf,
  resolveReportExportAsOf,
} from "@/lib/reporting-control";

const actions = [
  {
    id: "test-content",
    title: "Materialen praktisch testen",
    periodStart: "2026-08-01",
    periodEnd: "2026-09-26",
    deliverable: "Testverslag",
    evidenceNeeded: ["publicatielinks", "testverslag"],
  },
];

describe("reporting control", () => {
  it("laat het eerste voortgangsdossier nooit voorbij 31 augustus 2026 schuiven", () => {
    expect(resolveReportAsOf({ today: "2026-08-10", periodEnd: "2026-08-31" })).toBe("2026-08-10");
    expect(resolveReportAsOf({ today: "2026-09-15", periodEnd: "2026-08-31" })).toBe("2026-08-31");
  });

  it("past dezelfde inclusieve peildatum toe op elke rapportagebron", () => {
    expect(reportCutoffEnd("2026-08-31").toISOString()).toBe("2026-08-31T23:59:59.999Z");
    expect(isWithinReportCutoff(new Date("2026-08-31T23:59:59.999Z"), "2026-08-31")).toBe(true);
    expect(isWithinReportCutoff(new Date("2026-09-01T00:00:00.000Z"), "2026-08-31")).toBe(false);
  });

  it("faalt gesloten op een ongeldige formele exportpeildatum en kapt een latere datum af", () => {
    expect(resolveReportExportAsOf({ requestedAsOf: null, today: "2026-08-10", periodEnd: "2026-08-31" })).toBe("2026-08-10");
    expect(resolveReportExportAsOf({ requestedAsOf: "2026-09-15", today: "2026-08-10", periodEnd: "2026-08-31" })).toBe("2026-08-10");
    expect(resolveReportExportAsOf({ requestedAsOf: "2026-08-05", today: "2026-08-10", periodEnd: "2026-08-31" })).toBe("2026-08-05");
    expect(() => resolveReportExportAsOf({ requestedAsOf: "31-08-2026", today: "2026-08-10", periodEnd: "2026-08-31" })).toThrow(/peildatum/i);
  });

  it("maakt voor de lopende maand een controlelijst zonder forecast als realisatie te behandelen", () => {
    const review = buildMonthlyControl({
      monthKey: "2026-08",
      currentMonth: "2026-08",
      asOfDate: "2026-08-10",
      plannedHours: 30,
      approvedActualHours: 8,
      actions,
    });

    expect(review.state).toBe("CURRENT");
    expect(review.varianceHours).toBe(-22);
    expect(review.guidance).toMatch(/bevestig.*uitgevoerd/i);
    expect(review.actions[0]).toMatchObject({ title: "Materialen praktisch testen", deliverable: "Testverslag" });
    expect(review.actions[0].evidenceNeeded).toContain("testverslag");
  });

  it("noemt een verschil in een afgesloten maand een verklaringspunt en nooit een backfillopdracht", () => {
    const review = buildMonthlyControl({
      monthKey: "2026-08",
      currentMonth: "2026-09",
      asOfDate: "2026-09-05",
      plannedHours: 30,
      approvedActualHours: 8,
      actions,
    });

    expect(review.state).toBe("PAST");
    expect(review.guidance).toMatch(/verklaar/i);
    expect(review.guidance).toMatch(/niet.*achteraf/i);
  });

  it("houdt toekomstige maanden volledig forecast en geeft alleen voorbereiding mee", () => {
    const review = buildMonthlyControl({
      monthKey: "2026-09",
      currentMonth: "2026-08",
      asOfDate: "2026-08-10",
      plannedHours: 42,
      approvedActualHours: 0,
      actions,
    });

    expect(review.state).toBe("FUTURE");
    expect(review.guidance).toMatch(/voorbereid/i);
  });
});
