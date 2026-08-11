import type { FinancialBudgetLine } from "@/lib/financial-steering";
import type { WorkPackagePhase } from "@/lib/project-steering";

export type ApprovedBudgetSourceStatus =
  | "OFFICIAL_FILE"
  | "OFFICIAL_DECISION_RECONCILED"
  | "RECONSTRUCTED_PENDING_APPROVED_XLSX";

export const PROJECT_STEERING_CONFIG = {
  caseReference: "STOZ25-03851282",
  projectName: "Hybride Begrip",
  formalStart: "2025-09-01",
  actualStart: "2026-03-01",
  reportPeriodStart: "2025-09-01",
  reportPeriodEnd: "2026-08-31",
  reportDate: "2026-09-01",
  projectEnd: "2027-09-01",
  reportReferenceShare: 0.5,
  approvedEligibleCostBaselineEuros: 78_820,
  approvedSubsidyEuros: 39_410,
  submittedProjectCostsEuros: 80_160,
  submittedIndicativeSubsidyEuros: 40_080,
  approvedBudgetSourceStatus: "OFFICIAL_DECISION_RECONCILED" as ApprovedBudgetSourceStatus,
} as const;

/**
 * Begrotingsbasis na de twee correcties uit de beschikking van 6 februari 2026:
 * - externe project-/innovatiemanager: 325 × €100 = €32.500 in plaats van €32.000;
 * - de opgevoerde deelnemer Praktijkmanager en huisartsen (€920) is niet subsidiabel.
 *
 * De som is daardoor €78.820 en sluit exact aan op 2 × de verleende subsidie van €39.410.
 * De ingediende Model B-begroting en de RVO-beschikking vormen samen de gereconcilieerde
 * officiële bron. De beschikking gaat voor waar RVO bedragen heeft aangepast.
 */
export const APPROVED_BUDGET_LINES: FinancialBudgetLine[] = [
  {
    id: "practice-management-project",
    category: "Praktijkmanager",
    label: "Praktijkmanager en praktijkhouders · projectmanagement",
    rvoSection: "PROJECT_MANAGEMENT",
    costType: "INTERNAL_LABOUR",
    eligibleWorkPackageCodes: ["WP1"],
    budgetHours: 325,
    hourlyRate: 50,
    budgetEuros: 16_250,
  },
  {
    id: "project-management-overhead",
    category: "Overhead",
    label: "Opslag algemene kosten · projectmanagement",
    rvoSection: "PROJECT_MANAGEMENT",
    costType: "OVERHEAD",
    budgetEuros: 2_437.5,
  },
  {
    id: "practice-management-implementation",
    category: "Praktijkmanager",
    label: "Praktijkmanager en praktijkhouders · implementatie",
    rvoSection: "IMPLEMENTATION",
    costType: "INTERNAL_LABOUR",
    eligibleWorkPackageCodes: ["WP2", "WP4", "WP5", "WP6"],
    budgetHours: 145,
    hourlyRate: 50,
    budgetEuros: 7_250,
  },
  {
    id: "physiotherapists",
    category: "Fysiotherapeuten",
    label: "Fysiotherapeuten Fy-fit · implementatie",
    rvoSection: "IMPLEMENTATION",
    costType: "INTERNAL_LABOUR",
    eligibleWorkPackageCodes: ["WP2", "WP4"],
    budgetHours: 60,
    hourlyRate: 50,
    budgetEuros: 3_000,
  },
  {
    id: "front-backoffice",
    category: "Front/backoffice",
    label: "Front- en backoffice · implementatie",
    rvoSection: "IMPLEMENTATION",
    costType: "INTERNAL_LABOUR",
    eligibleWorkPackageCodes: ["WP3", "WP4", "WP5"],
    budgetHours: 20,
    hourlyRate: 50,
    budgetEuros: 1_000,
  },
  {
    id: "implementation-overhead",
    category: "Overhead",
    label: "Opslag algemene kosten · implementatie",
    rvoSection: "IMPLEMENTATION",
    costType: "OVERHEAD",
    budgetEuros: 1_687.5,
  },
  {
    id: "external-project-manager",
    category: "Extern adviseur",
    label: "Externe project- en innovatiemanager",
    rvoSection: "IMPLEMENTATION",
    costType: "EXTERNAL_LABOUR",
    eligibleWorkPackageCodes: ["WP1", "WP2", "WP3", "WP4", "WP5", "WP6"],
    budgetHours: 325,
    hourlyRate: 100,
    budgetEuros: 32_500,
  },
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
  },
  {
    id: "licenses",
    category: "Licenties",
    label: "Synthesia Enterprise en ChatGPT Business",
    rvoSection: "INVESTMENT",
    costType: "OTHER",
    budgetEuros: 10_400,
  },
  {
    id: "practice-management-training",
    category: "Praktijkmanager",
    label: "Praktijk Fy-fit / projectleider · opleider",
    rvoSection: "TRAINING",
    costType: "INTERNAL_LABOUR",
    eligibleWorkPackageCodes: ["WP3"],
    budgetHours: 20,
    hourlyRate: 50,
    budgetEuros: 1_000,
  },
  {
    id: "training-overhead",
    category: "Overhead",
    label: "Opslag algemene kosten · opleiding",
    rvoSection: "TRAINING",
    costType: "OVERHEAD",
    budgetEuros: 150,
  },
  {
    id: "communication-training",
    category: "Opleiding",
    label: "Training omgaan met beperkte basisvaardigheden",
    rvoSection: "TRAINING",
    costType: "OTHER",
    eligibleWorkPackageCodes: ["WP3"],
    budgetEuros: 645,
  },
];

export const WORK_PACKAGE_PHASES: WorkPackagePhase[] = [
  {
    code: "WP1",
    name: "Projectcoördinatie en organisatie",
    start: "2025-09-01",
    end: "2027-09-01",
    filedWorkDescription:
      "Projectleiding, afstemming, voortgangsrapportages, risicobeheersing, kwaliteitsbewaking en borging.",
  },
  {
    code: "WP2",
    name: "Contentontwikkeling en technische integratie",
    start: "2025-10-01",
    end: "2026-05-31",
    filedWorkDescription:
      "Technische infrastructuur en website, contentontwikkeling en integratie van digitale hulpmiddelen en modules.",
  },
  {
    code: "WP3",
    name: "Scholing en gebruikersondersteuning",
    start: "2025-12-01",
    end: "2026-10-31",
    filedWorkDescription:
      "Communicatietraining, instructie digitale tools, e-learningmodules en terugkomsessies.",
  },
  {
    code: "WP4",
    name: "Implementatie en opschaling binnen Fy-fit",
    start: "2026-09-01",
    end: "2027-02-28",
    filedWorkDescription:
      "Pilot op locatie Meijhorst, evaluatie en optimalisatie, gevolgd door uitrol naar de overige locaties.",
  },
  {
    code: "WP5",
    name: "Externe verspreiding en borging",
    start: "2026-03-01",
    end: "2027-08-31",
    filedWorkDescription:
      "Kennisdeling via regionale en landelijke partners, webinars, netwerkbijeenkomsten en borging via reguliere kanalen.",
  },
  {
    code: "WP6",
    name: "Monitoring, evaluatie en duurzame implementatie",
    start: "2026-03-01",
    end: "2027-09-01",
    filedWorkDescription:
      "Doorlopende monitoring van gebruik, ervaringen en effecten, evaluatie en opstellen van een implementatiehandboek.",
  },
];

export const CATEGORY_USER_EMAILS: Record<string, string> = {
  Websitebouwer: "ltromp@symbiomarketing.nl",
};

export const EXPECTED_WORK_PACKAGES_BY_CATEGORY: Record<string, string[]> = {
  Praktijkmanager: ["WP1", "WP2", "WP3", "WP4", "WP5", "WP6"],
  Fysiotherapeuten: ["WP2", "WP3", "WP4"],
  "Front/backoffice": ["WP3", "WP4", "WP5"],
  "Extern adviseur": ["WP1", "WP2", "WP3", "WP4", "WP5", "WP6"],
  Websitebouwer: ["WP2"],
  Taalambassadeurs: ["WP2", "WP3"],
};

export const INVOICE_BUDGET_LINE_SUGGESTIONS = [
  { contains: "ls project", budgetLineId: "external-project-manager" },
  { contains: "smeekens", budgetLineId: "external-project-manager" },
  { contains: "symbio", budgetLineId: "website-builder" },
] as const;

export const SOURCE_NOTES = {
  decision:
    "Beschikking RVO van 6 februari 2026, STOZ25-03851282: maximaal €39.410 subsidie; formele looptijd 1 september 2025 t/m 1 september 2027.",
  approvedBudget:
    "De goedgekeurde kostenbasis van €78.820 is gereconstrueerd uit de ingediende Model-B-begroting en de twee expliciete correcties in de beschikking. Het losse aangepaste RVO-XLSX-bestand ontbreekt nog.",
  submittedBudget:
    "Ingediende Model-B-begroting: €80.160 projectkosten en indicatief €40.080 subsidie. Dit is niet de verleende financiële bovenlaag.",
  schedule:
    "Het activiteitenplan is ingediend met fasering vanaf september 2025. De uitvoering is feitelijk rond maart 2026 gestart; een goedgekeurd wijzigingsbesluit voor de activiteitenplanning is nog niet als bron opgenomen.",
  reportTemplate:
    "RVO Model D vraagt algemene voortgang, tussenresultaten, activiteiten/planning en samenwerking. Model B vraagt gemaakte kosten naast de verleende begroting.",
} as const;
