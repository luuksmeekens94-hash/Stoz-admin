import { describe, expect, it } from "vitest";
import {
  parseHourInput,
  parseProjectDateInput,
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
});
