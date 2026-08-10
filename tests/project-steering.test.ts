import { describe, expect, it } from "vitest";
import { buildProjectSteeringModel, type SteeringInput } from "@/lib/project-steering";

const baseInput: SteeringInput = {
  asOf: "2026-08-09",
  reportDate: "2026-09-01",
  projectStart: "2025-09-01",
  projectEnd: "2027-09-01",
  reportReferenceShare: 0.5,
  budgets: [
    {
      id: "pm",
      category: "Praktijkmanager",
      label: "Marion",
      userId: "marion",
      budgetHours: 100,
      hourlyRate: 50,
      expectedWorkPackageCodes: ["WP1", "WP2"],
    },
    {
      id: "team",
      category: "Fysiotherapeuten",
      label: "Team",
      userId: "team",
      budgetHours: 60,
      hourlyRate: 50,
      expectedWorkPackageCodes: ["WP3", "WP4"],
    },
    {
      id: "web",
      category: "Websitebouwer",
      label: "Websitebouwer",
      budgetHours: 25,
      hourlyRate: 100,
      expectedWorkPackageCodes: ["WP2"],
    },
  ],
  categoryUserIds: { Websitebouwer: "lodewijk" },
  hours: [
    { id: "a", userId: "marion", actorName: "Marion", date: "2026-07-01", hours: 30, status: "APPROVED", workPackageCode: "WP1", activityCode: "A1.1", activityName: "Projectmanagement" },
    { id: "b", userId: "marion", actorName: "Marion", date: "2026-08-01", hours: 5, status: "DRAFT", workPackageCode: "WP1", activityCode: "A1.1", activityName: "Projectmanagement" },
    { id: "c", userId: "team", actorName: "Bram", date: "2026-07-15", hours: 20, status: "APPROVED", workPackageCode: "WP2", activityCode: "A2.1", activityName: "Technisch" },
    { id: "d", userId: "lodewijk", actorName: "Lodewijk", date: "2026-09-09", hours: 8, status: "APPROVED", workPackageCode: "WP2", activityCode: "A2.1", activityName: "Technisch" },
  ],
  workPackagePhases: [
    { code: "WP1", name: "Projectcoördinatie", start: "2025-09-01", end: "2027-09-01", filedWorkDescription: "Projectcoördinatie" },
    { code: "WP2", name: "Contentontwikkeling", start: "2025-10-01", end: "2026-05-31", filedWorkDescription: "Content en techniek" },
    { code: "WP6", name: "Monitoring", start: "2026-03-01", end: "2027-09-01", filedWorkDescription: "Monitoring en evaluatie" },
  ],
};

describe("buildProjectSteeringModel", () => {
  it("telt alleen goedgekeurde, niet-toekomstige uren als financieel rapporteerbaar", () => {
    const model = buildProjectSteeringModel(baseInput);

    expect(model.totals.reportableHours).toBe(50);
    expect(model.totals.unapprovedPastHours).toBe(5);
    expect(model.totals.futureHours).toBe(8);
    expect(model.dataQuality.futureEntryCount).toBe(1);
    expect(model.dataQuality.unapprovedPastEntryCount).toBe(1);
  });

  it("noemt de 50%-lijn expliciet een referentie en niet een formeel budgetdoel", () => {
    const model = buildProjectSteeringModel(baseInput);
    const marion = model.participants.find((row) => row.id === "pm");

    expect(model.totals.referenceHours).toBe(92.5);
    expect(marion?.referenceHours).toBe(50);
    expect(marion?.referenceVarianceHours).toBe(-20);
    expect(model.assumptions.linearReferenceIsApprovedTarget).toBe(false);
  });

  it("signaleert uren buiten de logische werkpakketverdeling per begrotingsrol", () => {
    const model = buildProjectSteeringModel(baseInput);
    const team = model.participants.find((row) => row.id === "team");
    const bram = model.actors.find((row) => row.name === "Bram");

    expect(team?.questionableWorkPackageHours).toBe(20);
    expect(team?.signal).toBe("CHECK_CLASSIFICATION");
    expect(bram?.budgetCategory).toBe("Fysiotherapeuten");
    expect(bram?.questionableWorkPackageHours).toBe(20);
  });

  it("houdt toekomstige regels buiten activiteiten- en werkpakketrealisatie", () => {
    const model = buildProjectSteeringModel(baseInput);
    const technical = model.activities.find((row) => row.code === "A2.1");
    const wp2 = model.workPackages.find((row) => row.code === "WP2");

    expect(technical).toMatchObject({ reportableHours: 20, futureHours: 8 });
    expect(wp2?.reportableHours).toBe(20);
    expect(wp2?.futureHours).toBe(8);
    expect(wp2?.outsidePhaseHours).toBe(20);
    expect(wp2?.signal).toBe("CHECK_CLASSIFICATION");
  });

  it("meldt actieve planonderdelen zonder registratie zonder inhoudelijke voortgang te verzinnen", () => {
    const model = buildProjectSteeringModel(baseInput);
    const wp6 = model.workPackages.find((row) => row.code === "WP6");

    expect(wp6?.signal).toBe("MISSING_REGISTRATION");
    expect(wp6?.reportableHours).toBe(0);
  });
});
