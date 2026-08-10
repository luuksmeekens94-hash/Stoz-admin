import { describe, expect, it } from "vitest";
import {
  assertAutomaticPlanningCreationAllowed,
  buildCorrectiveMonthlyPlan,
  comparePlanActual,
  findActualOnlyComparisons,
  findMonthlyPlan,
  resolvePlanActualRoleCategory,
  spreadPlannedHoursAcrossDates,
} from "@/lib/monthly-hour-planning";

describe("buildCorrectiveMonthlyPlan", () => {
  it("houdt actual-only dimensies expliciet zichtbaar voor de detailweergave", () => {
    const comparison = comparePlanActual([], [
      { monthKey: "2026-08", roleCategory: "Extern adviseur", workPackageCode: "WP2", activityCode: "A2.1", actualHours: 4 },
    ]);
    expect(findActualOnlyComparisons(comparison)).toEqual([
      expect.objectContaining({ monthKey: "2026-08", plannedHours: 0, actualHours: 4 }),
    ]);
  });
  it("splitst de broncategorie Praktijkmanager contextueel zonder andere forecastrollen te hernoemen", () => {
    expect(resolvePlanActualRoleCategory({ budgetCategory: "Praktijkmanager", workPackageCode: "WP3" })).toBe("Interne opleider");
    expect(resolvePlanActualRoleCategory({ budgetCategory: "Praktijkmanager", workPackageCode: "WP4" })).toBe("Praktijkmanagement");
    expect(resolvePlanActualRoleCategory({ budgetCategory: "Extern adviseur", workPackageCode: "WP6" })).toBe("Extern adviseur");
  });
  it("dekt uitsluitend augustus 2026 tot en met augustus 2027", () => {
    const plan = buildCorrectiveMonthlyPlan();

    expect(plan.map((month) => month.monthKey)).toEqual([
      "2026-08",
      "2026-09",
      "2026-10",
      "2026-11",
      "2026-12",
      "2027-01",
      "2027-02",
      "2027-03",
      "2027-04",
      "2027-05",
      "2027-06",
      "2027-07",
      "2027-08",
    ]);
  });

  it("bewaart per goedgekeurde begrotingsregel exact het restant in niet-lineaire kwartieren", () => {
    const approved = buildCorrectiveMonthlyPlan()
      .flatMap((month) => month.suggestions)
      .filter((suggestion) => suggestion.sourceState === "APPROVED_REMAINING");
    const expectedTotals = {
      "Praktijkmanager en praktijkhouders · projectmanagement": 153,
      "Praktijkmanager en praktijkhouders · implementatie": 137,
      "Externe project- en innovatiemanager": 107.5,
      "Fysiotherapeuten Fy-fit · implementatie": 60,
      "Front- en backoffice · implementatie": 20,
      "Praktijk Fy-fit / projectleider · opleider": 20,
    };
    const actualTotals = Object.fromEntries(
      Object.keys(expectedTotals).map((label) => [
        label,
        approved
          .filter((suggestion) => suggestion.label === label)
          .reduce((sum, suggestion) => sum + suggestion.plannedHours, 0),
      ]),
    );

    expect(new Set(approved.map((suggestion) => suggestion.label))).toEqual(
      new Set(Object.keys(expectedTotals)),
    );
    expect(actualTotals).toEqual(expectedTotals);
    expect(approved.every((suggestion) => Number.isInteger(suggestion.plannedHours * 4))).toBe(true);
    for (const label of Object.keys(expectedTotals)) {
      const monthlyHours = approved
        .filter((suggestion) => suggestion.label === label)
        .map((suggestion) => suggestion.plannedHours);
      expect(new Set(monthlyHours).size).toBeGreaterThan(1);
    }
  });

  it("gebruikt uitsluitend formele toekomstige WP-activiteitparen en volgt de fasering", () => {
    const approved = buildCorrectiveMonthlyPlan()
      .flatMap((month) => month.suggestions)
      .filter((suggestion) => suggestion.sourceState === "APPROVED_REMAINING");
    const allowedPairs = new Set([
      "WP1/A1.1",
      "WP3/A3.1",
      "WP3/A3.2",
      "WP4/A4.1",
      "WP4/A4.2",
      "WP5/A5.1",
      "WP5/A5.2",
      "WP6/A6.1",
      "WP6/A6.2",
    ]);

    expect(
      approved.every((suggestion) =>
        allowedPairs.has(`${suggestion.workPackageCode}/${suggestion.activityCode}`),
      ),
    ).toBe(true);
    expect(approved.some((suggestion) => suggestion.workPackageCode === "WP2")).toBe(false);

    const physiotherapists = approved.filter((suggestion) =>
      suggestion.label.startsWith("Fysiotherapeuten"),
    );
    expect(
      physiotherapists.every(
        (suggestion) =>
          suggestion.workPackageCode === "WP4" &&
          suggestion.monthKey >= "2026-09" &&
          suggestion.monthKey <= "2027-02",
      ),
    ).toBe(true);

    const trainer = approved.filter((suggestion) => suggestion.label.includes("opleider"));
    expect(
      trainer.every(
        (suggestion) =>
          suggestion.workPackageCode === "WP3" && suggestion.monthKey <= "2026-10",
      ),
    ).toBe(true);
    expect(
      approved
        .filter((suggestion) => suggestion.workPackageCode === "WP4")
        .every(
          (suggestion) => suggestion.monthKey >= "2026-09" && suggestion.monthKey <= "2027-02",
        ),
    ).toBe(true);
    expect(
      approved.some(
        (suggestion) =>
          suggestion.monthKey >= "2027-03" &&
          suggestion.monthKey <= "2027-05" &&
          suggestion.workPackageCode === "WP5",
      ),
    ).toBe(true);
    expect(
      approved.some(
        (suggestion) =>
          suggestion.monthKey >= "2027-06" &&
          suggestion.workPackageCode === "WP6" &&
          suggestion.activityCode === "A6.2",
      ),
    ).toBe(true);
  });

  it("blokkeert website-uren in augustus en september als expliciet besluitpunt", () => {
    const website = buildCorrectiveMonthlyPlan()
      .flatMap((month) => month.suggestions)
      .filter((suggestion) => suggestion.roleCategory === "Websitebouwer");

    expect(website.map((suggestion) => suggestion.monthKey)).toEqual(["2026-08", "2026-09"]);
    expect(
      website.every(
        (suggestion) =>
          suggestion.plannedHours === 0 &&
          suggestion.sourceState === "DECISION_REQUIRED" &&
          suggestion.canMaterialize === false,
      ),
    ).toBe(true);
    expect(
      website.every(
        (suggestion) =>
          suggestion.rationale.toLowerCase().includes("begrotingswijziging") &&
          suggestion.rationale.toLowerCase().includes("niet-subsidiabel"),
      ),
    ).toBe(true);
  });

  it("markeert alles expliciet als forecast met rationale en bronstatus", () => {
    const plan = buildCorrectiveMonthlyPlan();
    const suggestions = plan.flatMap((month) => month.suggestions);
    const validSourceStates = new Set([
      "APPROVED_REMAINING",
      "OUTSIDE_APPROVED_QUANTITY",
      "DECISION_REQUIRED",
    ]);

    expect(plan.every((month) => month.planningState === "OPERATIONAL_FORECAST")).toBe(true);
    expect(suggestions.every((suggestion) => suggestion.rationale.trim().length > 0)).toBe(true);
    expect(suggestions.every((suggestion) => validSourceStates.has(suggestion.sourceState))).toBe(true);
    expect(
      suggestions
        .filter((suggestion) => suggestion.sourceState === "APPROVED_REMAINING")
        .every(
          (suggestion) =>
            suggestion.canMaterialize === false &&
            suggestion.registrationPreparation === "PREFILL_ONLY_AFTER_EXECUTION",
        ),
    ).toBe(true);
    expect(
      suggestions.some((suggestion) => /bram|content|trainingsdeelnemer/i.test(suggestion.label)),
    ).toBe(false);
  });

  it("blokkeert automatische schijnrevisies zonder herijkte actualbaseline", () => {
    expect(() => assertAutomaticPlanningCreationAllowed(0)).not.toThrow();
    expect(() => assertAutomaticPlanningCreationAllowed(1)).toThrow(/baseline/i);
  });

  it("laat compensatiemismatches per rol, WP en activiteit niet verdwijnen in een gelijk maandtotaal", () => {
    const result = comparePlanActual(
      [
        { monthKey: "2026-09", roleCategory: "Praktijkmanagement", workPackageCode: "WP1", activityCode: "A1.1", plannedHours: 8 },
        { monthKey: "2026-09", roleCategory: "Praktijkmanagement", workPackageCode: "WP4", activityCode: "A4.1", plannedHours: 8 },
      ],
      [
        { monthKey: "2026-09", roleCategory: "Praktijkmanagement", workPackageCode: "WP1", activityCode: "A1.1", actualHours: 16 },
      ],
    );

    expect(result.reduce((sum, row) => sum + row.plannedHours, 0)).toBe(16);
    expect(result.reduce((sum, row) => sum + row.actualHours, 0)).toBe(16);
    expect(result.find((row) => row.workPackageCode === "WP1")?.varianceHours).toBe(8);
    expect(result.find((row) => row.workPackageCode === "WP4")?.varianceHours).toBe(-8);
    expect(result.every((row) => row.varianceHours === 0)).toBe(false);
  });

  it("verdeelt uitsluitend voorgestelde data over werkdagen met som- en dagmaximum", () => {
    const rows = spreadPlannedHoursAcrossDates("2026-09", 11.5, 4);

    expect(rows.reduce((sum, row) => sum + row.hours, 0)).toBe(11.5);
    expect(rows.every((row) => row.state === "PROPOSED_DATE")).toBe(true);
    expect(rows.every((row) => row.hours <= 4 && Number.isInteger(row.hours * 4))).toBe(true);
    expect(
      rows.every((row) => {
        const day = new Date(`${row.date}T00:00:00.000Z`).getUTCDay();
        return day !== 0 && day !== 6;
      }),
    ).toBe(true);
  });

  it("vindt een maand binnen de planperiode en niets erbuiten", () => {
    expect(findMonthlyPlan("2027-03")?.monthKey).toBe("2027-03");
    expect(findMonthlyPlan("2026-07")).toBeUndefined();
    expect(findMonthlyPlan("2027-09")).toBeUndefined();
  });
});
