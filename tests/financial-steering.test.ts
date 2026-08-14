import { describe, expect, it } from "vitest";
import { buildFinancialSteeringModel, hasValidInvoiceEvidence, type FinancialBudgetLine } from "@/lib/financial-steering";
import type { ParticipantSteeringRow } from "@/lib/project-steering";

const budgetLines: FinancialBudgetLine[] = [
  { id: "internal", category: "Praktijkmanager", label: "Praktijkmanagement", costType: "INTERNAL_LABOUR", budgetHours: 100, hourlyRate: 50, budgetEuros: 5_000 },
  { id: "external", category: "Extern adviseur", label: "Externe projectmanager", costType: "EXTERNAL_LABOUR", budgetHours: 25, hourlyRate: 100, budgetEuros: 2_500 },
  { id: "overhead", category: "Overhead", label: "Opslag algemene kosten", costType: "OVERHEAD", budgetEuros: 750 },
  { id: "licenses", category: "Licenties", label: "Licenties", costType: "OTHER", budgetEuros: 750 },
];

const participants: ParticipantSteeringRow[] = [
  {
    id: "pm",
    category: "Praktijkmanager",
    label: "Marion",
    userId: "marion",
    budgetHours: 100,
    hourlyRate: 50,
    expectedWorkPackageCodes: ["WP1"],
    reportableHours: 30,
    unapprovedPastHours: 5,
    futureHours: 0,
    referenceHours: 50,
    referenceVarianceHours: -20,
    remainingReportableHours: 70,
    questionableWorkPackageHours: 10,
    signal: "CHECK_CLASSIFICATION",
  },
  {
    id: "external",
    category: "Extern adviseur",
    label: "Luuk",
    userId: "luuk",
    budgetHours: 25,
    hourlyRate: 100,
    expectedWorkPackageCodes: ["WP1", "WP2"],
    reportableHours: 20,
    unapprovedPastHours: 0,
    futureHours: 0,
    referenceHours: 12.5,
    referenceVarianceHours: 7.5,
    remainingReportableHours: 5,
    questionableWorkPackageHours: 0,
    signal: "WITHIN_BUDGET",
  },
];

describe("buildFinancialSteeringModel", () => {
  it("accepteert alleen daadwerkelijk opgeslagen, benoemd factuurbewijs met toegelaten MIME", () => {
    expect(hasValidInvoiceEvidence({ fileData: "UERG", fileName: "factuur.pdf", fileMime: "application/pdf" })).toBe(true);
    expect(hasValidInvoiceEvidence({ fileData: null, filePath: "/stale/factuur.pdf", fileName: "factuur.pdf", fileMime: "application/pdf" })).toBe(false);
    expect(hasValidInvoiceEvidence({ fileData: "UERG", fileName: "factuur.exe", fileMime: "application/octet-stream" })).toBe(false);
  });
  it("deelt dezelfde begrotingsrol zonder dubbeltelling over de vier RVO-rubrieken", () => {
    const splitBudgetLines: FinancialBudgetLine[] = [
      {
        id: "pm-project",
        category: "Praktijkmanager",
        label: "Praktijkmanager · projectmanagement",
        rvoSection: "PROJECT_MANAGEMENT",
        costType: "INTERNAL_LABOUR",
        eligibleWorkPackageCodes: ["WP1"],
        budgetHours: 325,
        hourlyRate: 50,
        budgetEuros: 16_250,
      },
      {
        id: "pm-implementation",
        category: "Praktijkmanager",
        label: "Praktijkmanager · implementatie",
        rvoSection: "IMPLEMENTATION",
        costType: "INTERNAL_LABOUR",
        eligibleWorkPackageCodes: ["WP2", "WP4", "WP5", "WP6"],
        budgetHours: 145,
        hourlyRate: 50,
        budgetEuros: 7_250,
      },
      {
        id: "pm-training",
        category: "Praktijkmanager",
        label: "Praktijkmanager · opleider",
        rvoSection: "TRAINING",
        costType: "INTERNAL_LABOUR",
        eligibleWorkPackageCodes: ["WP3"],
        budgetHours: 20,
        hourlyRate: 50,
        budgetEuros: 1_000,
      },
      {
        id: "pm-overhead",
        category: "Overhead",
        label: "Opslag projectmanagement",
        rvoSection: "PROJECT_MANAGEMENT",
        costType: "OVERHEAD",
        budgetEuros: 2_437.5,
      },
      {
        id: "implementation-overhead",
        category: "Overhead",
        label: "Opslag implementatie",
        rvoSection: "IMPLEMENTATION",
        costType: "OVERHEAD",
        budgetEuros: 1_687.5,
      },
      {
        id: "training-overhead",
        category: "Overhead",
        label: "Opslag opleiding",
        rvoSection: "TRAINING",
        costType: "OVERHEAD",
        budgetEuros: 150,
      },
    ];

    const model = buildFinancialSteeringModel({
      participants,
      hours: [
        { id: "h1", category: "Praktijkmanager", actorName: "Marion", workPackageCode: "WP1", hours: 10 },
        { id: "h2", category: "Praktijkmanager", actorName: "Marion", workPackageCode: "WP2", hours: 5 },
        { id: "h3", category: "Praktijkmanager", actorName: "Marion", workPackageCode: "WP3", hours: 2 },
      ],
      budgetLines: splitBudgetLines,
      invoices: [],
      overheadRate: 0.15,
      approvedBudgetSourceStatus: "OFFICIAL_FILE",
    });

    expect(model.rows.find((row) => row.id === "pm-project")?.reportReadyHours).toBe(10);
    expect(model.rows.find((row) => row.id === "pm-implementation")?.reportReadyHours).toBe(5);
    expect(model.rows.find((row) => row.id === "pm-training")?.reportReadyHours).toBe(2);
    expect(model.rows.find((row) => row.id === "pm-overhead")?.knownRealizedEuros).toBe(75);
    expect(model.rows.find((row) => row.id === "implementation-overhead")?.knownRealizedEuros).toBe(37.5);
    expect(model.rows.find((row) => row.id === "training-overhead")?.knownRealizedEuros).toBe(15);
    expect(model.sections.find((section) => section.id === "PROJECT_MANAGEMENT")?.knownRealizedEuros).toBe(575);
    expect(model.totals.knownRealizedEuros).toBe(977.5);
  });

  it("houdt uren zonder passende verleende RVO-regel zichtbaar en buiten de realisatie", () => {
    const model = buildFinancialSteeringModel({
      participants,
      hours: [
        { id: "training", category: "Fysiotherapeuten", actorName: "Jorik", workPackageCode: "WP3", hours: 2 },
      ],
      budgetLines: [
        {
          id: "physio-implementation",
          category: "Fysiotherapeuten",
          label: "Fysiotherapeuten · implementatie",
          rvoSection: "IMPLEMENTATION",
          costType: "INTERNAL_LABOUR",
          eligibleWorkPackageCodes: ["WP4"],
          budgetHours: 60,
          hourlyRate: 50,
          budgetEuros: 3_000,
        },
      ],
      invoices: [],
      overheadRate: 0.15,
      approvedBudgetSourceStatus: "OFFICIAL_FILE",
    });

    expect(model.rows[0].reportReadyHours).toBe(0);
    expect(model.unallocatedHours).toEqual([
      { category: "Fysiotherapeuten", hours: 2, indicativeEuros: 100 },
    ]);
    expect(model.totals.classificationPendingEuros).toBe(100);
    expect(model.totals.knownRealizedEuros).toBe(0);
    expect(model.blockers).toContain("HOUR_CLASSIFICATION_PENDING");
  });

  it("classificeert fysiotherapeutische scholingsuren tegen het bevestigde interne tarief buiten Model B", () => {
    const model = buildFinancialSteeringModel({
      participants,
      hours: [
        { id: "training", category: "Fysiotherapeuten", actorName: "Behandelaar", workPackageCode: "WP3", hours: 2 },
      ],
      budgetLines: [
        {
          id: "physio-implementation",
          category: "Fysiotherapeuten",
          label: "Fysiotherapeuten · implementatie",
          rvoSection: "IMPLEMENTATION",
          costType: "INTERNAL_LABOUR",
          eligibleWorkPackageCodes: ["WP4"],
          budgetHours: 60,
          hourlyRate: 50,
          budgetEuros: 3_000,
        },
      ],
      nonSubsidisedHourRules: [
        {
          id: "physio-training-operational",
          category: "Fysiotherapeuten",
          label: "Scholingsdeelname fysiotherapeuten · operationeel",
          eligibleWorkPackageCodes: ["WP3"],
          hourlyRate: 35,
          decisionReference: "Projectbesluit 14 augustus 2026: intern tarief, buiten Model B.",
        },
      ],
      invoices: [],
      overheadRate: 0.15,
      approvedBudgetSourceStatus: "OFFICIAL_FILE",
    });

    expect(model.unallocatedHours).toEqual([]);
    expect(model.nonSubsidisedHours).toEqual([
      expect.objectContaining({
        id: "physio-training-operational",
        hours: 2,
        hourlyRate: 35,
        indicativeEuros: 70,
      }),
    ]);
    expect(model.totals.classificationPendingEuros).toBe(0);
    expect(model.totals.knownRealizedEuros).toBe(0);
    expect(model.blockers).not.toContain("HOUR_CLASSIFICATION_PENDING");
  });

  it("stelt een nog niet gefactureerde externe regel uit zonder deze als actual te claimen of het tussenverslag te blokkeren", () => {
    const model = buildFinancialSteeringModel({
      participants: [],
      hours: [
        { id: "website-hour", category: "Websitebouwer", actorName: "Leverancier", workPackageCode: "WP2", hours: 56 },
      ],
      budgetLines: [
        {
          id: "website-builder",
          category: "Websitebouwer",
          label: "Websitebouwer",
          rvoSection: "IMPLEMENTATION",
          costType: "EXTERNAL_LABOUR",
          eligibleWorkPackageCodes: ["WP2"],
          budgetHours: 25,
          hourlyRate: 100,
          budgetEuros: 2_500,
          uninvoicedCostTreatment: "DEFER_TO_LATER_REPORT",
          reportingNote: "Pas opnemen na ontvangst en koppeling van de factuur.",
        },
      ],
      invoices: [],
      overheadRate: 0.15,
      approvedBudgetSourceStatus: "OFFICIAL_FILE",
    });

    expect(model.totals.knownRealizedEuros).toBe(0);
    expect(model.deferredExternalCosts).toEqual([
      expect.objectContaining({
        id: "website-builder",
        reportableHours: 56,
        indicativeHoursValueEuros: 5_600,
      }),
    ]);
    expect(model.blockers).not.toContain("EXTERNAL_COST_EVIDENCE_INCOMPLETE");
    expect(model.isReportReady).toBe(true);
  });

  it("gebruikt expliciete begrotingsbedragen in plaats van een risicovolle reconstructie", () => {
    const model = buildFinancialSteeringModel({
      participants,
      budgetLines,
      invoices: [],
      overheadRate: 0.15,
      approvedBudgetSourceStatus: "OFFICIAL_FILE",
    });

    expect(model.totals.approvedBudgetEuros).toBe(9_000);
    expect(model.totals.budgetSourceDifferenceEuros).toBe(0);
    expect(model.rows.find((row) => row.id === "internal")?.budgetEuros).toBe(5_000);
  });

  it("neemt bij interne inzet alleen geclassificeerde goedgekeurde uren en de bijbehorende overhead mee", () => {
    const model = buildFinancialSteeringModel({
      participants,
      budgetLines,
      invoices: [],
      overheadRate: 0.15,
      approvedBudgetSourceStatus: "OFFICIAL_FILE",
    });

    expect(model.rows.find((row) => row.id === "internal")?.reportReadyHours).toBe(20);
    expect(model.rows.find((row) => row.id === "internal")?.knownRealizedEuros).toBe(1_000);
    expect(model.rows.find((row) => row.id === "overhead")?.knownRealizedEuros).toBe(150);
    expect(model.totals.classificationPendingEuros).toBe(500);
  });

  it("telt externe urenwaarde en voorgestelde factuurkoppeling niet dubbel of definitief", () => {
    const model = buildFinancialSteeringModel({
      participants,
      budgetLines,
      invoices: [
        { id: "inv", supplier: "LS Project", amountExVat: 1_000, hasEvidence: true, suggestedBudgetLineId: "external" },
      ],
      overheadRate: 0.15,
      approvedBudgetSourceStatus: "OFFICIAL_FILE",
    });

    const external = model.rows.find((row) => row.id === "external");
    expect(external?.indicativeHoursValueEuros).toBe(2_000);
    expect(external?.knownRealizedEuros).toBe(0);
    expect(external?.pendingInvoiceMappingEuros).toBe(1_000);
    expect(model.totals.consolidatedRealizedEuros).toBeNull();
    expect(model.blockers).toContain("INVOICE_MAPPING_PENDING");
  });

  it("neemt een bevestigde externe factuur ex btw op maar houdt onbevestigde btw apart geblokkeerd", () => {
    const model = buildFinancialSteeringModel({
      participants,
      budgetLines,
      invoices: [
        {
          id: "inv",
          supplier: "LS Project",
          amountExVat: 1_000,
          vatAmount: 210,
          amountIncVat: 1_210,
          vatTreatment: "PENDING",
          hasEvidence: true,
          confirmedBudgetLineId: "external",
        },
      ],
      overheadRate: 0.15,
      approvedBudgetSourceStatus: "OFFICIAL_FILE",
    });

    expect(model.rows.find((row) => row.id === "external")?.knownRealizedEuros).toBe(1_000);
    expect(model.totals.pendingVatEuros).toBe(210);
    expect(model.blockers).toContain("VAT_TREATMENT_PENDING");
  });

  it("houdt een bevestigde factuur zonder bewijs volledig buiten bekende realisatie", () => {
    const model = buildFinancialSteeringModel({
      participants,
      budgetLines,
      invoices: [
        {
          id: "missing-evidence",
          supplier: "LS Project",
          amountExVat: 1_000,
          vatAmount: 210,
          amountIncVat: 1_210,
          vatTreatment: "EXCLUDED",
          hasEvidence: false,
          confirmedBudgetLineId: "external",
        },
      ],
      overheadRate: 0.15,
      approvedBudgetSourceStatus: "OFFICIAL_FILE",
    });

    expect(model.rows.find((row) => row.id === "external")?.confirmedInvoiceEuros).toBe(0);
    expect(model.rows.find((row) => row.id === "external")?.knownRealizedEuros).toBe(0);
    expect(model.totals.knownRealizedEuros).toBe(1_150);
    expect(model.blockers).toContain("INVOICE_EVIDENCE_MISSING");
  });

  it.each([
    { amountExVat: -1, vatAmount: 0, amountIncVat: -1 },
    { amountExVat: 1_000, vatAmount: -1, amountIncVat: 999 },
    { amountExVat: 1_000, vatAmount: 210, amountIncVat: 5_000 },
    { amountExVat: Number.NaN, vatAmount: 0, amountIncVat: 0 },
  ])("blokkeert ongeldige of intern inconsistente factuurbedragen: %o", (amounts) => {
    const model = buildFinancialSteeringModel({
      participants,
      budgetLines,
      invoices: [
        {
          id: "invalid-amount",
          supplier: "LS Project",
          ...amounts,
          vatTreatment: "INCLUDED_CONFIRMED",
          hasEvidence: true,
          confirmedBudgetLineId: "external",
        },
      ],
      overheadRate: 0.15,
      approvedBudgetSourceStatus: "OFFICIAL_FILE",
    });

    expect(model.rows.find((row) => row.id === "external")?.confirmedInvoiceEuros).toBe(0);
    expect(model.rows.find((row) => row.id === "external")?.knownRealizedEuros).toBe(0);
    expect(model.blockers).toContain("INVOICE_AMOUNT_INVALID");
    expect(model.totals.consolidatedRealizedEuros).toBeNull();
  });

  it("blokkeert een stale of niet-factureerbare bevestigde begrotingsmapping", () => {
    const model = buildFinancialSteeringModel({
      participants: [],
      budgetLines,
      invoices: [
        {
          id: "stale",
          supplier: "Leverancier",
          amountExVat: 1_000,
          vatAmount: 0,
          amountIncVat: 1_000,
          vatTreatment: "EXCLUDED",
          hasEvidence: true,
          confirmedBudgetLineId: "verdwenen-regel",
          workPackageCode: "WP2",
        },
        {
          id: "internal-map",
          supplier: "Leverancier",
          amountExVat: 500,
          vatAmount: 0,
          amountIncVat: 500,
          vatTreatment: "EXCLUDED",
          hasEvidence: true,
          confirmedBudgetLineId: "internal",
          workPackageCode: "WP1",
        },
      ],
      overheadRate: 0.15,
      approvedBudgetSourceStatus: "OFFICIAL_FILE",
    });

    expect(model.totals.confirmedInvoiceEuros).toBe(0);
    expect(model.totals.unmappedInvoiceEuros).toBe(1_500);
    expect(model.blockers).toContain("INVOICE_MAPPING_MISSING");
    expect(model.totals.consolidatedRealizedEuros).toBeNull();
  });

  it("neemt btw pas mee na expliciete bevestiging en telt nog steeds geen externe urenwaarde op", () => {
    const model = buildFinancialSteeringModel({
      participants,
      budgetLines,
      invoices: [
        {
          id: "inv",
          supplier: "LS Project",
          amountExVat: 1_000,
          vatAmount: 210,
          amountIncVat: 1_210,
          vatTreatment: "INCLUDED_CONFIRMED",
          hasEvidence: true,
          confirmedBudgetLineId: "external",
        },
      ],
      overheadRate: 0.15,
      approvedBudgetSourceStatus: "OFFICIAL_FILE",
    });

    const external = model.rows.find((row) => row.id === "external");
    expect(external?.indicativeHoursValueEuros).toBe(2_000);
    expect(external?.knownRealizedEuros).toBe(1_210);
    expect(model.totals.confirmedInvoiceEuros).toBe(1_210);
    expect(model.totals.pendingVatEuros).toBe(0);
  });

  it("blokkeert formele gereedheid zolang de goedgekeurde RVO-begroting alleen is gereconstrueerd", () => {
    const model = buildFinancialSteeringModel({
      participants: [],
      budgetLines,
      invoices: [],
      overheadRate: 0.15,
      approvedBudgetSourceStatus: "RECONSTRUCTED_PENDING_APPROVED_XLSX",
    });

    expect(model.blockers).toContain("APPROVED_BUDGET_FILE_MISSING");
    expect(model.isReportReady).toBe(false);
  });
});
