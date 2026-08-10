import { APPROVED_BUDGET_LINES } from "@/lib/project-plan";

export type InvoiceVatTreatmentInput = "PENDING" | "EXCLUDED" | "INCLUDED_CONFIRMED";

const ALLOWED_VAT_TREATMENTS = new Set<InvoiceVatTreatmentInput>([
  "PENDING",
  "EXCLUDED",
  "INCLUDED_CONFIRMED",
]);

export function validateInvoiceClassification(input: {
  budgetLineId: unknown;
  workPackageCode: string;
  vatTreatment: unknown;
  reason: unknown;
}) {
  const budgetLineId = typeof input.budgetLineId === "string" ? input.budgetLineId.trim() : "";
  const vatTreatment =
    typeof input.vatTreatment === "string" ? input.vatTreatment.trim() : "";
  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  const budgetLine = APPROVED_BUDGET_LINES.find(
    (line) =>
      line.id === budgetLineId &&
      (line.costType === "EXTERNAL_LABOUR" || line.costType === "OTHER"),
  );

  if (!budgetLine) {
    throw new Error("Onbekende of niet-factureerbare begrotingsregel.");
  }
  if (!ALLOWED_VAT_TREATMENTS.has(vatTreatment as InvoiceVatTreatmentInput)) {
    throw new Error("Ongeldige btw-status.");
  }
  if (reason.length < 20) {
    throw new Error("Geef een concrete reden van minimaal 20 tekens voor het auditspoor.");
  }
  if (
    budgetLine.eligibleWorkPackageCodes?.length &&
    !budgetLine.eligibleWorkPackageCodes.includes(input.workPackageCode)
  ) {
    throw new Error("De begrotingsregel past niet bij het werkpakket van deze factuur.");
  }

  return {
    budgetLineId,
    vatTreatment: vatTreatment as InvoiceVatTreatmentInput,
    reason,
  };
}
