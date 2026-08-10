import type { ParticipantSteeringRow } from "@/lib/project-steering";

export type FinancialCostType =
  | "INTERNAL_LABOUR"
  | "EXTERNAL_LABOUR"
  | "OVERHEAD"
  | "OTHER";

export type RvoFinancialSection =
  | "PROJECT_MANAGEMENT"
  | "IMPLEMENTATION"
  | "INVESTMENT"
  | "TRAINING";

export interface FinancialBudgetLine {
  id: string;
  category: string;
  label: string;
  rvoSection?: RvoFinancialSection;
  costType: FinancialCostType;
  eligibleWorkPackageCodes?: string[];
  budgetHours?: number;
  hourlyRate?: number;
  budgetEuros: number;
}

export interface FinancialHour {
  id: string;
  category: string | null;
  actorName: string;
  workPackageCode: string;
  hours: number;
}

export interface FinancialInvoice {
  id: string;
  supplier: string;
  amountExVat: number;
  vatAmount?: number;
  amountIncVat?: number;
  vatTreatment?: "PENDING" | "EXCLUDED" | "INCLUDED_CONFIRMED";
  hasEvidence: boolean;
  confirmedBudgetLineId?: string | null;
  suggestedBudgetLineId?: string | null;
  workPackageCode?: string;
}

export type ApprovedBudgetSourceStatus =
  | "OFFICIAL_FILE"
  | "RECONSTRUCTED_PENDING_APPROVED_XLSX";

export type FinancialBlocker =
  | "APPROVED_BUDGET_FILE_MISSING"
  | "BUDGET_TOTAL_MISMATCH"
  | "HOUR_CLASSIFICATION_PENDING"
  | "INVOICE_MAPPING_PENDING"
  | "INVOICE_MAPPING_MISSING"
  | "INVOICE_EVIDENCE_MISSING"
  | "INVOICE_AMOUNT_INVALID"
  | "VAT_TREATMENT_PENDING"
  | "EXTERNAL_COST_EVIDENCE_INCOMPLETE";

export interface FinancialSteeringInput {
  participants: ParticipantSteeringRow[];
  hours?: FinancialHour[];
  budgetLines: FinancialBudgetLine[];
  invoices: FinancialInvoice[];
  overheadRate: number;
  approvedBudgetSourceStatus: ApprovedBudgetSourceStatus;
  approvedBudgetTotalEuros?: number;
}

export interface FinancialSteeringRow extends FinancialBudgetLine {
  reportableHours: number;
  reportReadyHours: number;
  classificationPendingHours: number;
  indicativeHoursValueEuros: number;
  confirmedInvoiceEuros: number;
  pendingInvoiceMappingEuros: number;
  knownRealizedEuros: number;
}

function euros(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function hours(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

const ALLOWED_INVOICE_EVIDENCE_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
]);

export function hasValidInvoiceEvidence(input: {
  fileData?: string | null;
  fileName?: string | null;
  fileMime?: string | null;
  filePath?: string | null;
}) {
  const data = input.fileData?.trim() || "";
  return Boolean(
    data &&
      data.length % 4 === 0 &&
      /^[A-Za-z0-9+/]+={0,2}$/.test(data) &&
      input.fileName?.trim() &&
      input.fileMime &&
      ALLOWED_INVOICE_EVIDENCE_MIME.has(input.fileMime),
  );
}

export function hasValidInvoiceAmounts(invoice: FinancialInvoice): boolean {
  const vatAmount = invoice.vatAmount ?? 0;
  const amountIncVat = invoice.amountIncVat ?? invoice.amountExVat + vatAmount;
  return (
    Number.isFinite(invoice.amountExVat) &&
    Number.isFinite(vatAmount) &&
    Number.isFinite(amountIncVat) &&
    invoice.amountExVat >= 0 &&
    vatAmount >= 0 &&
    amountIncVat >= 0 &&
    Math.abs(invoice.amountExVat + vatAmount - amountIncVat) <= 0.01
  );
}

export function hasValidInvoiceBudgetLineMapping(
  invoice: FinancialInvoice,
  budgetLines: FinancialBudgetLine[],
) {
  if (!invoice.confirmedBudgetLineId) return false;
  const line = budgetLines.find(
    (candidate) =>
      candidate.id === invoice.confirmedBudgetLineId &&
      (candidate.costType === "EXTERNAL_LABOUR" || candidate.costType === "OTHER"),
  );
  if (!line) return false;
  const eligible = line.eligibleWorkPackageCodes || [];
  return eligible.length === 0 || Boolean(invoice.workPackageCode && eligible.includes(invoice.workPackageCode));
}

function isReportableInvoice(invoice: FinancialInvoice): boolean {
  return invoice.hasEvidence && hasValidInvoiceAmounts(invoice);
}

function reportableInvoiceAmount(invoice: FinancialInvoice): number {
  if (!isReportableInvoice(invoice)) return 0;
  return invoice.vatTreatment === "INCLUDED_CONFIRMED"
    ? invoice.amountIncVat ?? invoice.amountExVat + (invoice.vatAmount || 0)
    : invoice.amountExVat;
}

export function buildFinancialSteeringModel(input: FinancialSteeringInput) {
  const participantsForCategory = (category: string) =>
    input.participants.filter((participant) => participant.category === category);

  const hoursForLine = (line: FinancialBudgetLine) => {
    if (!input.hours) return null;
    const eligibleWorkPackages = line.eligibleWorkPackageCodes || [];
    return input.hours.filter(
      (hour) =>
        hour.category === line.category &&
        (eligibleWorkPackages.length === 0 ||
          eligibleWorkPackages.includes(hour.workPackageCode)),
    );
  };

  const baseRows: FinancialSteeringRow[] = input.budgetLines.map((line) => {
    const matchedHours = hoursForLine(line);
    const participants = participantsForCategory(line.category);
    const reportableHours = hours(
      matchedHours
        ? matchedHours.reduce((sum, hour) => sum + hour.hours, 0)
        : participants.reduce((sum, participant) => sum + participant.reportableHours, 0),
    );
    const classificationPendingHours = hours(
      matchedHours
        ? 0
        : participants.reduce(
            (sum, participant) => sum + participant.questionableWorkPackageHours,
            0,
          ),
    );
    const reportReadyHours = hours(
      Math.max(0, reportableHours - classificationPendingHours),
    );
    const hourlyRate = line.hourlyRate || 0;
    const indicativeHoursValueEuros = euros(reportableHours * hourlyRate);
    const confirmedInvoiceEuros = euros(
      input.invoices
        .filter(
          (invoice) =>
            invoice.confirmedBudgetLineId === line.id &&
            hasValidInvoiceBudgetLineMapping(invoice, input.budgetLines) &&
            isReportableInvoice(invoice),
        )
        .reduce((sum, invoice) => sum + reportableInvoiceAmount(invoice), 0),
    );
    const pendingInvoiceMappingEuros = euros(
      input.invoices
        .filter(
          (invoice) =>
            !invoice.confirmedBudgetLineId && invoice.suggestedBudgetLineId === line.id,
        )
        .reduce(
          (sum, invoice) =>
            sum + (hasValidInvoiceAmounts(invoice) ? invoice.amountExVat : 0),
          0,
        ),
    );

    let knownRealizedEuros = 0;
    if (line.costType === "INTERNAL_LABOUR") {
      knownRealizedEuros = euros(reportReadyHours * hourlyRate);
    } else if (line.costType === "EXTERNAL_LABOUR" || line.costType === "OTHER") {
      knownRealizedEuros = confirmedInvoiceEuros;
    }

    return {
      ...line,
      reportableHours,
      reportReadyHours,
      classificationPendingHours,
      indicativeHoursValueEuros,
      confirmedInvoiceEuros,
      pendingInvoiceMappingEuros,
      knownRealizedEuros,
    };
  });

  const reportReadyInternalLabourEuros = euros(
    baseRows
      .filter((row) => row.costType === "INTERNAL_LABOUR")
      .reduce((sum, row) => sum + row.knownRealizedEuros, 0),
  );

  const rows = baseRows.map((row) => {
    if (row.costType !== "OVERHEAD") return row;
    const eligibleInternalLabourEuros = baseRows
      .filter(
        (candidate) =>
          candidate.costType === "INTERNAL_LABOUR" &&
          (row.rvoSection
            ? candidate.rvoSection === row.rvoSection
            : !candidate.rvoSection),
      )
      .reduce((sum, candidate) => sum + candidate.knownRealizedEuros, 0);
    const overheadBasis = row.rvoSection
      ? eligibleInternalLabourEuros
      : reportReadyInternalLabourEuros;
    return {
      ...row,
      knownRealizedEuros: euros(overheadBasis * input.overheadRate),
    };
  });

  const approvedBudgetEuros = euros(
    input.budgetLines.reduce((sum, line) => sum + line.budgetEuros, 0),
  );
  const labourBudgetLines = input.budgetLines.filter(
    (line) =>
      line.costType === "INTERNAL_LABOUR" || line.costType === "EXTERNAL_LABOUR",
  );
  const unallocatedByCategory = new Map<string, number>();
  for (const hour of input.hours || []) {
    const hasMatchingLine = labourBudgetLines.some((line) => {
      if (line.category !== hour.category) return false;
      const eligible = line.eligibleWorkPackageCodes || [];
      return eligible.length === 0 || eligible.includes(hour.workPackageCode);
    });
    if (hasMatchingLine) continue;
    const category = hour.category || "Geen begrotingskoppeling";
    unallocatedByCategory.set(
      category,
      hours((unallocatedByCategory.get(category) || 0) + hour.hours),
    );
  }
  const unallocatedHours = Array.from(unallocatedByCategory.entries())
    .map(([category, value]) => {
      const rate =
        labourBudgetLines.find((line) => line.category === category)?.hourlyRate || 0;
      return {
        category,
        hours: value,
        indicativeEuros: euros(value * rate),
      };
    })
    .sort((a, b) => a.category.localeCompare(b.category, "nl"));
  const expectedApprovedBudgetEuros =
    input.approvedBudgetTotalEuros ?? approvedBudgetEuros;
  const budgetSourceDifferenceEuros = euros(
    expectedApprovedBudgetEuros - approvedBudgetEuros,
  );
  const knownRealizedEuros = euros(
    rows.reduce((sum, row) => sum + row.knownRealizedEuros, 0),
  );
  const classificationPendingEuros = euros(
    rows
      .filter(
        (row) =>
          row.costType === "INTERNAL_LABOUR" || row.costType === "EXTERNAL_LABOUR",
      )
      .reduce(
        (sum, row) => sum + row.classificationPendingHours * (row.hourlyRate || 0),
        unallocatedHours.reduce((sum, row) => sum + row.indicativeEuros, 0),
      ),
  );
  const confirmedInvoiceEuros = euros(
    input.invoices
      .filter(
        (invoice) =>
          hasValidInvoiceBudgetLineMapping(invoice, input.budgetLines) &&
          isReportableInvoice(invoice),
      )
      .reduce((sum, invoice) => sum + reportableInvoiceAmount(invoice), 0),
  );
  const pendingInvoiceMappingEuros = euros(
    input.invoices
      .filter(
        (invoice) =>
          !invoice.confirmedBudgetLineId && Boolean(invoice.suggestedBudgetLineId),
      )
      .reduce(
        (sum, invoice) =>
          sum + (hasValidInvoiceAmounts(invoice) ? invoice.amountExVat : 0),
        0,
      ),
  );
  const unmappedInvoiceEuros = euros(
    input.invoices
      .filter(
        (invoice) =>
          (!invoice.confirmedBudgetLineId && !invoice.suggestedBudgetLineId) ||
          (Boolean(invoice.confirmedBudgetLineId) &&
            !hasValidInvoiceBudgetLineMapping(invoice, input.budgetLines)),
      )
      .reduce(
        (sum, invoice) =>
          sum + (hasValidInvoiceAmounts(invoice) ? invoice.amountExVat : 0),
        0,
      ),
  );
  const invoiceEvidenceMissingEuros = euros(
    input.invoices
      .filter((invoice) => !invoice.hasEvidence && hasValidInvoiceAmounts(invoice))
      .reduce((sum, invoice) => sum + invoice.amountExVat, 0),
  );
  const pendingVatEuros = euros(
    input.invoices
      .filter(
        (invoice) =>
          hasValidInvoiceBudgetLineMapping(invoice, input.budgetLines) &&
          isReportableInvoice(invoice) &&
          invoice.vatTreatment === "PENDING" &&
          (invoice.vatAmount || 0) > 0,
      )
      .reduce((sum, invoice) => sum + (invoice.vatAmount || 0), 0),
  );

  const blockers = new Set<FinancialBlocker>();
  if (input.approvedBudgetSourceStatus !== "OFFICIAL_FILE") {
    blockers.add("APPROVED_BUDGET_FILE_MISSING");
  }
  if (budgetSourceDifferenceEuros !== 0) blockers.add("BUDGET_TOTAL_MISMATCH");
  if (classificationPendingEuros > 0) blockers.add("HOUR_CLASSIFICATION_PENDING");
  if (pendingInvoiceMappingEuros > 0) blockers.add("INVOICE_MAPPING_PENDING");
  if (unmappedInvoiceEuros > 0) blockers.add("INVOICE_MAPPING_MISSING");
  if (invoiceEvidenceMissingEuros > 0) blockers.add("INVOICE_EVIDENCE_MISSING");
  if (input.invoices.some((invoice) => !hasValidInvoiceAmounts(invoice))) {
    blockers.add("INVOICE_AMOUNT_INVALID");
  }
  if (pendingVatEuros > 0) blockers.add("VAT_TREATMENT_PENDING");

  const externalRowsWithoutConfirmedCost = rows.filter(
    (row) =>
      row.costType === "EXTERNAL_LABOUR" &&
      row.reportableHours > 0 &&
      row.confirmedInvoiceEuros === 0,
  );
  if (externalRowsWithoutConfirmedCost.length > 0) {
    blockers.add("EXTERNAL_COST_EVIDENCE_INCOMPLETE");
  }

  const sectionLabels: Record<RvoFinancialSection, string> = {
    PROJECT_MANAGEMENT: "Projectmanagement",
    IMPLEMENTATION: "Implementatie",
    INVESTMENT: "Investeringskosten",
    TRAINING: "Opleiding",
  };
  const sectionIds: RvoFinancialSection[] = [
    "PROJECT_MANAGEMENT",
    "IMPLEMENTATION",
    "INVESTMENT",
    "TRAINING",
  ];
  const sections = sectionIds.map((id) => {
    const sectionRows = rows.filter((row) => row.rvoSection === id);
    return {
      id,
      label: sectionLabels[id],
      budgetEuros: euros(sectionRows.reduce((sum, row) => sum + row.budgetEuros, 0)),
      knownRealizedEuros: euros(
        sectionRows.reduce((sum, row) => sum + row.knownRealizedEuros, 0),
      ),
      pendingInvoiceMappingEuros: euros(
        sectionRows.reduce((sum, row) => sum + row.pendingInvoiceMappingEuros, 0),
      ),
    };
  });

  const blockerList = Array.from(blockers);
  const isReportReady = blockerList.length === 0;

  return {
    rows,
    sections,
    unallocatedHours,
    totals: {
      approvedBudgetEuros,
      expectedApprovedBudgetEuros,
      budgetSourceDifferenceEuros,
      knownRealizedEuros,
      consolidatedRealizedEuros: isReportReady ? knownRealizedEuros : null,
      classificationPendingEuros,
      confirmedInvoiceEuros,
      pendingInvoiceMappingEuros,
      unmappedInvoiceEuros,
      invoiceEvidenceMissingEuros,
      pendingVatEuros,
      knownRealizedShare:
        approvedBudgetEuros > 0 ? knownRealizedEuros / approvedBudgetEuros : 0,
    },
    blockers: blockerList,
    isReportReady,
  };
}
