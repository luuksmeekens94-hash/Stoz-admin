import { describe, expect, it } from "vitest";
import {
  buildHistoricalReconstructionComparison,
  buildHistoricalReconstructionScope,
  validateHistoricalReconstructionDraft,
} from "@/lib/hour-reconstruction";

describe("historische urenreconstructie", () => {
  it("toont het verschil met een handmatig bevestigd werkelijk totaal zonder een begrotingsdoel te construeren", () => {
    expect(
      buildHistoricalReconstructionComparison({
        registeredHours: 12.5,
        targetHours: 18.25,
      }),
    ).toEqual({
      registeredHours: 12.5,
      targetHours: 18.25,
      differenceHours: 5.75,
      state: "MISSING_REGISTRATION",
    });

    expect(
      buildHistoricalReconstructionComparison({
        registeredHours: 18.25,
        targetHours: 18.25,
      }).state,
    ).toBe("ALIGNED");

    expect(
      buildHistoricalReconstructionComparison({
        registeredHours: 20,
        targetHours: 18.25,
      }).state,
    ).toBe("REVIEW_EXISTING");
  });

  it("normaliseert een onderbouwde conceptregistratie binnen het bevestigde verschil", () => {
    expect(
      validateHistoricalReconstructionDraft({
        registeredHours: 12.5,
        targetHours: 18.25,
        entryHours: 3,
        description: "Voorbereiding en afstemming hybride cliëntinstructie",
        sourceType: "MIXED_DOCUMENTATION",
        sourceReference: "Agenda, projectnotulen en bevestiging van de projecteigenaar.",
        performedConfirmation: true,
      }),
    ).toMatchObject({
      comparison: {
        differenceHours: 5.75,
        state: "MISSING_REGISTRATION",
      },
      entryHours: 3,
      sourceType: "MIXED_DOCUMENTATION",
      sourceReference: "Agenda, projectnotulen en bevestiging van de projecteigenaar.",
    });
  });

  it("weigert reconstructie zonder uitvoeringsbevestiging of concrete bronbeschrijving", () => {
    const base = {
      registeredHours: 12.5,
      targetHours: 18.25,
      entryHours: 3,
      description: "Voorbereiding en afstemming hybride cliëntinstructie",
      sourceType: "PROJECT_OWNER_RECONSTRUCTION" as const,
      sourceReference: "Te globaal",
      performedConfirmation: false,
    };

    expect(() => validateHistoricalReconstructionDraft(base)).toThrow(/bevestig/i);
    expect(() =>
      validateHistoricalReconstructionDraft({
        ...base,
        performedConfirmation: true,
      }),
    ).toThrow(/bron|onderbouwing/i);
  });

  it("weigert een concept boven het resterende verschil of zonder positief verschil", () => {
    const base = {
      registeredHours: 12.5,
      targetHours: 18.25,
      entryHours: 6,
      description: "Voorbereiding en afstemming hybride cliëntinstructie",
      sourceType: "DOCUMENTED_SOURCE" as const,
      sourceReference: "Agenda en projectnotulen van de betreffende uitvoeringsmaand.",
      performedConfirmation: true,
    };

    expect(() => validateHistoricalReconstructionDraft(base)).toThrow(/resterende verschil/i);
    expect(() =>
      validateHistoricalReconstructionDraft({
        ...base,
        registeredHours: 18.25,
        entryHours: 0.25,
      }),
    ).toThrow(/geen ontbrekende uren/i);
  });

  it("weigert ongeldige doelstanden, niet-kwartieruren en onherleidbare omschrijvingen", () => {
    const base = {
      registeredHours: 12.5,
      targetHours: 18.25,
      entryHours: 3,
      description: "Voorbereiding en afstemming hybride cliëntinstructie",
      sourceType: "DOCUMENTED_SOURCE" as const,
      sourceReference: "Agenda en projectnotulen van de betreffende uitvoeringsmaand.",
      performedConfirmation: true,
    };

    expect(() => validateHistoricalReconstructionDraft({ ...base, targetHours: 18.1 })).toThrow(/kwartier/i);
    expect(() => validateHistoricalReconstructionDraft({ ...base, entryHours: 1.1 })).toThrow(/kwartier/i);
    expect(() => validateHistoricalReconstructionDraft({ ...base, targetHours: Number.NaN })).toThrow(/getal/i);
    expect(() => validateHistoricalReconstructionDraft({ ...base, description: "werk" })).toThrow(/omschrijving/i);
    expect(() =>
      validateHistoricalReconstructionDraft({
        ...base,
        sourceType: "ONGELDIG" as never,
      }),
    ).toThrow(/bronsoort/i);
  });

  it("bouwt een exacte live scope t/m de serverpeildatum", () => {
    const asOf = new Date("2026-08-10T23:59:59.999Z");
    expect(
      buildHistoricalReconstructionScope({
        userId: "team-user",
        therapistId: "therapeut-1",
        workPackageId: "wp2",
        activityId: "a2-3",
        asOf,
      }),
    ).toEqual({
      userId: "team-user",
      therapistId: "therapeut-1",
      workPackageId: "wp2",
      activityId: "a2-3",
      date: { lte: asOf },
    });
  });
});
