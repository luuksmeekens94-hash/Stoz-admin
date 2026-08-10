import { describe, expect, it } from "vitest";
import { buildApprovedHourCorrection } from "@/lib/hour-corrections";

const current = {
  id: "hour-1",
  date: new Date("2026-09-09T00:00:00.000Z"),
  hours: 4,
  description: "WP2 werkzaamheden",
  workPackageId: "wp2",
  activityId: "a21",
  therapistId: "bram",
};

describe("buildApprovedHourCorrection", () => {
  it("maakt een auditbaar voor/na-object voor een echte datumcorrectie", () => {
    const result = buildApprovedHourCorrection(current, {
      date: "2026-08-09",
      correctionReason: "De registratie stond door een invoerfout één maand te laat.",
    });

    expect(result.before.date).toBe("2026-09-09");
    expect(result.after.date).toBe("2026-08-09");
    expect(result.changedFields).toEqual(["date"]);
    expect(result.reason).toContain("invoerfout");
  });

  it("weigert een wijziging zonder concrete reden", () => {
    expect(() =>
      buildApprovedHourCorrection(current, {
        date: "2026-08-09",
        correctionReason: "fout",
      })
    ).toThrow(/reden/i);
  });

  it("weigert ongeldige uren en datums buiten de projectperiode", () => {
    expect(() =>
      buildApprovedHourCorrection(current, {
        hours: 0,
        correctionReason: "Correctie op basis van de onderliggende urenstaat.",
      })
    ).toThrow(/uren/i);

    expect(() =>
      buildApprovedHourCorrection(current, {
        date: "2027-09-02",
        correctionReason: "Correctie op basis van de onderliggende urenstaat.",
      })
    ).toThrow(/projectperiode/i);

    expect(() =>
      buildApprovedHourCorrection(current, {
        date: "2026-02-30",
        correctionReason: "Correctie op basis van de onderliggende urenstaat.",
      })
    ).toThrow(/ongeldig/i);
  });

  it("weigert een correctie die feitelijk niets verandert", () => {
    expect(() =>
      buildApprovedHourCorrection(current, {
        date: "2026-09-09",
        correctionReason: "Controle zonder daadwerkelijke wijziging van de registratie.",
      })
    ).toThrow(/geen wijziging/i);
  });
});
