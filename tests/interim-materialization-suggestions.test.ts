import { describe, expect, it } from "vitest";
import { buildInterimMaterializationSuggestions } from "@/lib/interim-materialization-suggestions";

const actors = [
  { key: "user:heidi", userId: "heidi", therapistId: null, name: "Heidi Staring", roleLabel: "Praktijkmanager" },
  { key: "user:marion", userId: "marion", therapistId: null, name: "Marion Brouwer", roleLabel: "Praktijkmanager" },
  { key: "user:sjoerd", userId: "sjoerd", therapistId: null, name: "Sjoerd Hendriks", roleLabel: "Praktijkmanager" },
];

describe("interim materialization suggestions", () => {
  it("verdeelt resterende uren over echte bijdragers op ma/do en incidenteel wo", () => {
    const rows = buildInterimMaterializationSuggestions({
      proposalId: "proposal-1",
      workPackageCode: "WP4",
      activityCode: "A4.1",
      activityName: "Pilot en eerste implementatie",
      remainingHours: 20,
      asOf: "2026-08-12",
      actors,
      priorContributors: ["user:heidi", "user:marion", "user:sjoerd"],
    });

    expect(rows.reduce((sum, row) => sum + row.hours, 0)).toBe(20);
    expect(new Set(rows.map((row) => row.actorKey))).toEqual(new Set(["user:heidi", "user:marion", "user:sjoerd"]));
    expect(rows.every((row) => [1, 3, 4].includes(new Date(`${row.date}T00:00:00.000Z`).getUTCDay()))).toBe(true);
    expect(rows.filter((row) => new Date(`${row.date}T00:00:00.000Z`).getUTCDay() === 3).length).toBeLessThanOrEqual(1);
    expect(rows.every((row) => row.hours > 0 && row.hours <= 4 && Number.isInteger(row.hours * 4))).toBe(true);
    expect(rows.every((row) => row.description.length >= 20 && /implement/i.test(row.description))).toBe(true);
  });

  it("maakt activiteitsspecifieke werkzaamheden en gebruikt alleen deelnemers uit de voorstelcategorie", () => {
    const rows = buildInterimMaterializationSuggestions({
      proposalId: "proposal-2",
      workPackageCode: "WP3",
      activityCode: "A3.1",
      activityName: "Training communicatie",
      remainingHours: 7,
      asOf: "2026-08-12",
      actors,
      priorContributors: ["user:marion"],
    });

    expect(new Set(rows.map((row) => row.actorKey))).toEqual(new Set(["user:marion"]));
    expect(rows.reduce((sum, row) => sum + row.hours, 0)).toBe(7);
    expect(rows.every((row) => /training|communicatie/i.test(row.description))).toBe(true);
  });

  it("maakt geen persoonsvoorstel als er geen aantoonbare bijdrager in de categorie is", () => {
    expect(buildInterimMaterializationSuggestions({
      proposalId: "proposal-3",
      workPackageCode: "WP2",
      activityCode: "A2.2",
      activityName: "Teksten",
      remainingHours: 7,
      asOf: "2026-08-12",
      actors,
      priorContributors: [],
    })).toEqual([]);
  });
});
