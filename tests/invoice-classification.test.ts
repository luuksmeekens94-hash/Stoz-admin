import { describe, expect, it } from "vitest";
import { validateInvoiceClassification } from "@/lib/invoice-classification";

describe("invoice classification", () => {
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
