import { describe, expect, it } from "vitest";
import {
  buildInterimHoursSteering,
  INTERIM_HOUR_TARGETS,
  INTERIM_TARGET_TOTAL_HOURS,
} from "@/lib/interim-hour-steering";

const currentRegistration = [
  { budgetCategory: "Praktijkmanager", workPackageCode: "WP1", activityCode: "A1.1", hours: 172 },
  { budgetCategory: "Praktijkmanager", workPackageCode: "WP2", activityCode: "A2.2", hours: 8 },
  { budgetCategory: "Praktijkmanager", workPackageCode: "WP3", activityCode: "A3.1", hours: 2 },
  { budgetCategory: "Extern adviseur", workPackageCode: "WP1", activityCode: "A1.1", hours: 97 },
  { budgetCategory: "Extern adviseur", workPackageCode: "WP2", activityCode: "A2.2", hours: 120.5 },
  { budgetCategory: "Fysiotherapeuten", workPackageCode: "WP2", activityCode: "A2.2", hours: 68 },
  { budgetCategory: "Fysiotherapeuten", workPackageCode: "WP3", activityCode: "A3.1", hours: 28 },
  { budgetCategory: "Websitebouwer", workPackageCode: "WP2", activityCode: "A2.1", hours: 56 },
];

describe("realistische STOZ-tussenstand", () => {
  it("legt een niet-lineaire doelstand van 450 uur vast: net onder de helft van 920 uur", () => {
    expect(INTERIM_TARGET_TOTAL_HOURS).toBe(450);
    expect(INTERIM_HOUR_TARGETS.reduce((sum, row) => sum + row.targetHours, 0)).toBe(450);
    expect(INTERIM_TARGET_TOTAL_HOURS / 920).toBeCloseTo(0.489, 3);
    expect(new Set(INTERIM_HOUR_TARGETS.map((row) => row.targetHours)).size).toBeGreaterThan(5);
  });

  it("vergelijkt dezelfde registratie apart per functie/titel en per werkpakket", () => {
    const steering = buildInterimHoursSteering(currentRegistration);

    expect(steering.totals).toMatchObject({
      budgetHours: 920,
      targetHours: 450,
      currentHours: 551.5,
      netVarianceHours: 101.5,
      missingAcrossScopesHours: 45,
      aboveAcrossScopesHours: 146.5,
    });
    expect(steering.titles.find((row) => row.key === "PRACTICE_IMPLEMENTATION")).toMatchObject({
      budgetHours: 145,
      targetHours: 35,
      currentHours: 8,
      differenceHours: 27,
      state: "TO_ADD",
    });
    expect(steering.titles.find((row) => row.key === "INTERNAL_TRAINER")).toMatchObject({
      budgetHours: 20,
      targetHours: 20,
      currentHours: 2,
      differenceHours: 18,
      state: "TO_ADD",
    });
    expect(steering.titles.find((row) => row.key === "PHYSIOTHERAPIST_IMPLEMENTATION")).toMatchObject({
      budgetHours: 60,
      targetHours: 40,
      currentHours: 96,
      differenceHours: -56,
      state: "ABOVE_TARGET",
    });
    expect(steering.titles.find((row) => row.key === "WEBSITE_BUILDER")).toMatchObject({
      budgetHours: 25,
      targetHours: 40,
      currentHours: 56,
      differenceHours: -16,
      state: "ABOVE_TARGET",
    });
    expect(steering.workPackages.find((row) => row.code === "WP5")).toMatchObject({
      targetHours: 8,
      currentHours: 0,
      differenceHours: 8,
    });
    expect(steering.workPackages.find((row) => row.code === "WP6")).toMatchObject({
      targetHours: 12,
      currentHours: 0,
      differenceHours: 12,
    });
  });

  it("maakt alleen ontbrekende rol/WP-scopes klaar en laat overschrijdingen niet compenseren", () => {
    const steering = buildInterimHoursSteering(currentRegistration);

    expect(steering.proposals.map((row) => [row.budgetLineKey, row.workPackageCode, row.proposedHours])).toEqual([
      ["PRACTICE_IMPLEMENTATION", "WP2", 7],
      ["PRACTICE_IMPLEMENTATION", "WP5", 8],
      ["PRACTICE_IMPLEMENTATION", "WP6", 12],
      ["INTERNAL_TRAINER", "WP3", 18],
    ]);
    expect(steering.proposals.reduce((sum, row) => sum + row.proposedHours, 0)).toBe(45);
  });

  it("telt uren binnen dezelfde functie en hetzelfde werkpakket mee, ongeacht de activiteit", () => {
    const steering = buildInterimHoursSteering([
      { budgetCategory: "Praktijkmanager", workPackageCode: "WP2", activityCode: "A2.1", hours: 15 },
    ]);

    expect(steering.proposals.find((row) =>
      row.budgetLineKey === "PRACTICE_IMPLEMENTATION" && row.workPackageCode === "WP2"
    )).toBeUndefined();
  });
});
