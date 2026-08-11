import { describe, expect, it } from "vitest";
import { assertNoDirectIdentifiers } from "@/lib/privacy-text";

describe("privacytekstvalidatie", () => {
  it("staat functionele projectonderbouwing zonder directe identificatoren toe", () => {
    expect(() =>
      assertNoDirectIdentifiers(
        "Outlook-agenda van april, projectnotulen en opgeleverd instructieconcept.",
        "Brononderbouwing",
      ),
    ).not.toThrow();
  });

  it("weigert e-mailadressen, telefoonnummers en directe of gelabelde identificatoren", () => {
    const unsafeTexts = [
      "Bevestigd door persoon@example.nl",
      "Cliëntnummer 100000009",
      "Cliënt telefoon: 06-12345678",
      "Telefoon: 024-1234567",
      "Naam: Jan Jansen, diagnose: COPD",
      "Adres: Dorpsstraat 1",
      "Geboortedatum: 01-01-1980",
      "Patiëntnummer: 123456789",
      "Jan Jansen bevestigde de werkzaamheden",
      "Bel Jan Jansen op 020 123 4567",
      "Jan Jansen, geboren 01-01-1980, heeft COPD",
      "Patiënt 12345678 heeft geholpen",
      "BSN 1234 56 789 hoort bij het dossier",
      "BSN: 1234-56-789",
      "Bronreferentie 123 456 782 uit het dossier",
      "Controlegetal 123-456-782 uit het dossier",
      "Bel mij op 024-1234567 voor dossiercontrole",
      "Bron bevestigd via +31 24 123 4567",
      "Cliëntnummer 12345678 hoort bij deze behandeling",
      "Naam Jan Jansen heeft diagnose COPD",
      "naam jan jansen bevestigde de uitgevoerde werkzaamheden",
      "Telefoon 020/1234567 voor de bronbevestiging",
      "Cliëntnaam jan jansen met diagnose COPD",
    ];

    for (const text of unsafeTexts) {
      expect(() => assertNoDirectIdentifiers(text, "Brononderbouwing")).toThrow(
        /persoonsgegevens/i,
      );
    }
  });
});
