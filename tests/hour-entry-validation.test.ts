import { describe, expect, it } from "vitest";
import {
  parseHourInput,
  parseProjectDateInput,
  validateOrdinaryApprovedCorrectionDateKey,
  validateOrdinaryHistoricalDraftEdit,
  validateOrdinaryHourCreationDate,
  validateUserTherapistPairing,
  validateHourEntryDraft,
} from "@/lib/hour-entry-validation";

const base = {
  dateKey: "2026-08-10",
  now: new Date("2026-08-10T12:00:00.000Z"),
  hours: 2,
  workPackageId: "wp4",
  activityWorkPackageId: "wp4",
};

describe("validateHourEntryDraft", () => {
  it("accepteert werkelijk werk op de peildatum in kwartieren", () => {
    expect(() => validateHourEntryDraft(base)).not.toThrow();
  });

  it("blokkeert toekomstige registraties", () => {
    expect(() =>
      validateHourEntryDraft({ ...base, dateKey: "2026-08-11" }),
    ).toThrow(/toekomst/i);
  });

  it("gebruikt de Nederlandse kalenderdag rond UTC-middernacht", () => {
    const shortlyAfterMidnightInAmsterdam = new Date("2026-08-10T22:30:00.000Z");

    expect(() =>
      validateHourEntryDraft({
        ...base,
        now: shortlyAfterMidnightInAmsterdam,
        dateKey: "2026-08-11",
      }),
    ).not.toThrow();
    expect(() =>
      validateHourEntryDraft({
        ...base,
        now: shortlyAfterMidnightInAmsterdam,
        dateKey: "2026-08-12",
      }),
    ).toThrow(/toekomst/i);
  });

  it("blokkeert een activiteit uit een ander werkpakket", () => {
    expect(() =>
      validateHourEntryDraft({ ...base, activityWorkPackageId: "wp3" }),
    ).toThrow(/werkpakket/i);
  });

  it("blokkeert uren buiten kwartierstappen", () => {
    expect(() => validateHourEntryDraft({ ...base, hours: 1.1 })).toThrow(/kwartier/i);
  });

  it("weigert genormaliseerde kalenderdatums en gedeeltelijke getallen", () => {
    expect(() => parseProjectDateInput("2026-02-30")).toThrow(/ongeldig/i);
    expect(() => parseProjectDateInput("2026-8-1")).toThrow(/formaat/i);
    expect(() => parseHourInput("2hours")).toThrow(/getal/i);
    expect(parseHourInput("2.25")).toBe(2.25);
  });

  it("staat gewone creatie alleen op de Amsterdamse registratiedag toe", () => {
    const now = new Date("2026-08-10T12:00:00.000Z");
    expect(() => validateOrdinaryHourCreationDate("2026-08-10", now)).not.toThrow();
    expect(() => validateOrdinaryHourCreationDate("2026-08-09", now)).toThrow(
      /historische reconstructie/i,
    );
  });

  it("vergrendelt inhoudelijke edits van een oud gewoon concept", () => {
    const now = new Date("2026-08-10T12:00:00.000Z");
    expect(() => validateOrdinaryHistoricalDraftEdit("2026-08-10", now)).not.toThrow();
    expect(() => validateOrdinaryHistoricalDraftEdit("2026-08-09", now)).toThrow(
      /historisch concept/i,
    );
  });

  it("blokkeert het verplaatsen van een gewone goedgekeurde regel naar een historische datum", () => {
    expect(() =>
      validateOrdinaryApprovedCorrectionDateKey("2026-08-10", "2026-08-09", "2026-08-10"),
    ).toThrow(/historische reconstructie/i);
    expect(() =>
      validateOrdinaryApprovedCorrectionDateKey("2026-08-09", "2026-08-09", "2026-08-10"),
    ).not.toThrow();
    expect(() =>
      validateOrdinaryApprovedCorrectionDateKey("2026-08-09", "2026-08-10", "2026-08-10"),
    ).not.toThrow();
  });

  it("dwingt de TEAM-therapeutkoppeling server-side af", () => {
    expect(() => validateUserTherapistPairing("TEAM", "therapist-1")).not.toThrow();
    expect(() => validateUserTherapistPairing("TEAM", null)).toThrow(/therapeut/i);
    expect(() => validateUserTherapistPairing("INTERNAL", null)).not.toThrow();
    expect(() => validateUserTherapistPairing("INTERNAL", "therapist-1")).toThrow(
      /alleen.*team/i,
    );
  });
});
