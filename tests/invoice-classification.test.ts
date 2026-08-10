import { describe, expect, it } from "vitest";
import { buildUnclassifiedInvoiceDeleteWhere, isClassifiedInvoiceImmutable, validateInvoiceClassification } from "@/lib/invoice-classification";

describe("invoice classification", () => {
  it("maakt iedere factuur met een classificatiespoor immutable", () => {
    expect(isClassifiedInvoiceImmutable({ confirmedBudgetLineId: "external", classifiedAt: null, classifiedById: null })).toBe(true);
    expect(isClassifiedInvoiceImmutable({ confirmedBudgetLineId: null, classifiedAt: new Date(), classifiedById: "admin" })).toBe(true);
    expect(isClassifiedInvoiceImmutable({ confirmedBudgetLineId: null, classifiedAt: null, classifiedById: null })).toBe(false);
    expect(isClassifiedInvoiceImmutable({ classificationReason: "auditreden", vatTreatment: "PENDING" })).toBe(true);
    expect(isClassifiedInvoiceImmutable({ classificationReason: null, vatTreatment: "EXCLUDED" })).toBe(true);
  });

  it("bouwt een atomische deletevoorwaarde op de volledige ongeclassificeerde snapshot", () => {
    const updatedAt = new Date("2026-08-10T10:00:00.000Z");
    expect(buildUnclassifiedInvoiceDeleteWhere({ id: "invoice-1", updatedAt })).toEqual({
      id: "invoice-1",
      updatedAt,
      confirmedBudgetLineId: null,
      classificationReason: null,
      classifiedAt: null,
      classifiedById: null,
      vatTreatment: "PENDING",
    });
  });
  it("accepteert een expliciete externe factuurkoppeling met concrete reden", () => {
    expect(
      validateInvoiceClassification({
        budgetLineId: "external-project-manager",
        workPackageCode: "WP1",
        vatTreatment: "PENDING",
        reason: "Factuur 67 betreft aantoonbaar project- en innovatiemanagement.",
      }),
    ).toMatchObject({ budgetLineId: "external-project-manager", vatTreatment: "PENDING" });
  });

  it("weigert een websitefactuur buiten WP2", () => {
    expect(() =>
      validateInvoiceClassification({
        budgetLineId: "website-builder",
        workPackageCode: "WP1",
        vatTreatment: "EXCLUDED",
        reason: "Deze factuur betreft de technische websitebouw van het project.",
      }),
    ).toThrow(/werkpakket/i);
  });

  it("vereist een concrete auditreden", () => {
    expect(() =>
      validateInvoiceClassification({
        budgetLineId: "external-project-manager",
        workPackageCode: "WP1",
        vatTreatment: "PENDING",
        reason: "klopt",
      }),
    ).toThrow(/reden/i);
  });

  it("weigert onbekende begrotingsregels en btw-statussen", () => {
    expect(() =>
      validateInvoiceClassification({
        budgetLineId: "verzonnen-regel",
        workPackageCode: "WP1",
        vatTreatment: "JA_HOOR",
        reason: "Dit is lang genoeg maar hoort bij geen formele begrotingsregel.",
      }),
    ).toThrow(/begrotingsregel|btw/i);
  });
});
