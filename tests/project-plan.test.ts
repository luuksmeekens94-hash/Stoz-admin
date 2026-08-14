import { describe, expect, it } from "vitest";
import {
  APPROVED_BUDGET_LINES,
  NON_SUBSIDISED_HOUR_RULES,
  PROJECT_STEERING_CONFIG,
  WORK_PACKAGE_PHASES,
} from "@/lib/project-plan";

describe("STOZ Hybride Begrip bronconfiguratie", () => {
  it("houdt beschikking, feitelijke start en eerste verslagperiode uit elkaar", () => {
    expect(PROJECT_STEERING_CONFIG.formalStart).toBe("2025-09-01");
    expect(PROJECT_STEERING_CONFIG.actualStart).toBe("2026-03-01");
    expect(PROJECT_STEERING_CONFIG.reportPeriodStart).toBe("2025-09-01");
    expect(PROJECT_STEERING_CONFIG.reportPeriodEnd).toBe("2026-08-31");
    expect(PROJECT_STEERING_CONFIG.reportDate).toBe("2026-09-01");
    expect(PROJECT_STEERING_CONFIG.projectEnd).toBe("2027-09-01");
  });

  it("gebruikt de beschikking als goedgekeurde financiële bovenlaag", () => {
    expect(PROJECT_STEERING_CONFIG.approvedSubsidyEuros).toBe(39_410);
    expect(PROJECT_STEERING_CONFIG.approvedEligibleCostBaselineEuros).toBe(78_820);
    expect(PROJECT_STEERING_CONFIG.submittedProjectCostsEuros).toBe(80_160);
    expect(PROJECT_STEERING_CONFIG.submittedIndicativeSubsidyEuros).toBe(40_080);
    expect(PROJECT_STEERING_CONFIG.approvedBudgetSourceStatus).toBe(
      "OFFICIAL_DECISION_RECONCILED",
    );
  });

  it("reconstrueert de goedgekeurde begroting zonder huisartsdeelname", () => {
    expect(APPROVED_BUDGET_LINES.reduce((sum, line) => sum + line.budgetEuros, 0)).toBe(
      78_820,
    );
    expect(APPROVED_BUDGET_LINES.find((line) => line.id === "external-project-manager")).toMatchObject({
      budgetHours: 325,
      hourlyRate: 100,
      budgetEuros: 32_500,
    });
    expect(APPROVED_BUDGET_LINES.some((line) => line.label.toLowerCase().includes("huisarts"))).toBe(
      false,
    );
  });

  it("legt het interne scholingstarief en de uitgestelde websitefactuur als projectbesluit vast", () => {
    expect(NON_SUBSIDISED_HOUR_RULES).toContainEqual(
      expect.objectContaining({
        id: "physiotherapist-training-operational",
        category: "Fysiotherapeuten",
        eligibleWorkPackageCodes: ["WP3"],
        hourlyRate: 35,
      }),
    );
    expect(APPROVED_BUDGET_LINES.find((line) => line.id === "website-builder")).toMatchObject({
      uninvoicedCostTreatment: "DEFER_TO_LATER_REPORT",
    });
  });

  it("sluit per RVO-rubriek aan op Model B en de beschikkingcorrectie", () => {
    const bySection = Object.fromEntries(
      ["PROJECT_MANAGEMENT", "IMPLEMENTATION", "INVESTMENT", "TRAINING"].map((section) => [
        section,
        APPROVED_BUDGET_LINES.filter((line) => line.rvoSection === section).reduce(
          (sum, line) => sum + line.budgetEuros,
          0,
        ),
      ]),
    );

    expect(bySection).toEqual({
      PROJECT_MANAGEMENT: 18_687.5,
      IMPLEMENTATION: 47_937.5,
      INVESTMENT: 10_400,
      TRAINING: 1_795,
    });
    expect(APPROVED_BUDGET_LINES.filter((line) => line.category === "Praktijkmanager")).toHaveLength(3);
  });

  it("bewaart de oorspronkelijke fasering uit het activiteitenplan", () => {
    expect(WORK_PACKAGE_PHASES.find((row) => row.code === "WP4")).toMatchObject({
      start: "2026-09-01",
      end: "2027-02-28",
    });
    expect(WORK_PACKAGE_PHASES.find((row) => row.code === "WP5")?.start).toBe("2026-03-01");
    expect(WORK_PACKAGE_PHASES.find((row) => row.code === "WP6")?.start).toBe("2026-03-01");
  });
});
