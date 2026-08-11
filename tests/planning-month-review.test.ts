import { describe, expect, it } from "vitest";
import { validatePlanningMonthForApproval } from "@/lib/planning-month-review";

const allocations = [
  {
    id: "allocation-a",
    plannedHours: 8,
    forecastEntries: [
      { plannedDate: "2026-09-10", executorName: "Fysiotherapieteam Fy-fit", plannedHours: 4 },
      { plannedDate: "2026-09-17", executorName: "Fysiotherapieteam Fy-fit", plannedHours: 4 },
    ],
  },
  {
    id: "allocation-b",
    plannedHours: 6,
    forecastEntries: [
      { plannedDate: "2026-09-10", executorName: "Praktijkmanagement Fy-fit", plannedHours: 6 },
    ],
  },
];

describe("validatePlanningMonthForApproval", () => {
  it("keurt een volledige maand met kloppende detailregels goed", () => {
    expect(validatePlanningMonthForApproval("2026-09", allocations)).toEqual({
      allocationCount: 2,
      detailCount: 3,
      totalHours: 14,
    });
  });

  it("blokkeert lege maanden, ongeldige maandtotalen en details buiten de maand", () => {
    expect(() => validatePlanningMonthForApproval("2026-09", [])).toThrow(/geen planregels/i);
    expect(() =>
      validatePlanningMonthForApproval("2026-09", [
        { ...allocations[0], plannedHours: 9 },
      ]),
    ).toThrow(/detailtotaal/i);
    expect(() =>
      validatePlanningMonthForApproval("2026-09", [
        {
          ...allocations[0],
          forecastEntries: [
            { plannedDate: "2026-10-01", executorName: "Team", plannedHours: 8 },
          ],
        },
      ]),
    ).toThrow(/gekozen maand/i);
  });

  it("handhaaft 24 uur per genormaliseerde uitvoerder en datum over allocaties heen", () => {
    expect(() =>
      validatePlanningMonthForApproval("2026-09", [
        {
          id: "a",
          plannedHours: 16,
          forecastEntries: [
            { plannedDate: "2026-09-10", executorName: " Team  Fy-fit ", plannedHours: 16 },
          ],
        },
        {
          id: "b",
          plannedHours: 9,
          forecastEntries: [
            { plannedDate: "2026-09-10", executorName: "team fy-FIT", plannedHours: 9 },
          ],
        },
      ]),
    ).toThrow(/24 uur/i);
  });
});
