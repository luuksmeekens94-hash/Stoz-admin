export type ProgressFactSource = "USER_CONFIRMED" | "DATABASE" | "FORMAL_PLAN";
export type WorkPackageProgressStatus =
  | "IN_PROGRESS"
  | "DELAYED"
  | "NOT_DUE"
  | "BEHIND";

export const CONFIRMED_PROGRESS_FACTS = {
  reporting: {
    formalStart: "2025-09-01",
    actualStart: "2026-03-01",
    delayReason: "De subsidiegoedkeuring liet tot 6 februari 2026 op zich wachten.",
    changeRequestFiled: false,
    formalEndStillFeasible: true,
  },
  careContentVersions: {
    total: 12,
    contentReady: 12,
    published: 12,
    tested: 0,
    testingStarts: "2026-08",
    usedCount: null as number | null,
    source: "USER_CONFIRMED" as ProgressFactSource,
  },
  processVideos: {
    total: 3,
    completed: 3,
    used: false,
    source: "USER_CONFIRMED" as ProgressFactSource,
  },
  websites: {
    dutchB1: "IN_PROGRESS",
    arabic: "IN_PROGRESS",
    turkish: "IN_PROGRESS",
    expectedComplete: "2026-09-26",
    source: "USER_CONFIRMED" as ProgressFactSource,
  },
  clientUse: {
    firstUseMonth: "2026-08",
    clientCount: null as number | null,
    source: "USER_CONFIRMED" as ProgressFactSource,
  },
  knowledgeSharing: {
    confirmedBeforeReportEnd: false,
    nextParties: ["Huisartsenpraktijk De Schakel", "huisartsen"],
  },
  monitoring: {
    confirmedBeforeAsOf: false,
    therapistTestingPlannedFrom: "2026-08",
  },
} as const;

export interface WorkPackageProgressAssessment {
  code: string;
  name: string;
  formalStart: string;
  formalEnd: string;
  reportableHours: number;
  status: WorkPackageProgressStatus;
  knownEvidence: string;
  explanation: string;
}

const workPackageFacts = [
  {
    code: "WP1",
    name: "Projectcoördinatie en organisatie",
    formalStart: "2025-09-01",
    formalEnd: "2027-09-01",
  },
  {
    code: "WP2",
    name: "Contentontwikkeling en technische integratie",
    formalStart: "2025-10-01",
    formalEnd: "2026-05-31",
  },
  {
    code: "WP3",
    name: "Scholing en gebruikersondersteuning",
    formalStart: "2025-12-01",
    formalEnd: "2026-10-31",
  },
  {
    code: "WP4",
    name: "Implementatie en opschaling binnen Fy-fit",
    formalStart: "2026-09-01",
    formalEnd: "2027-02-28",
  },
  {
    code: "WP5",
    name: "Externe verspreiding en borging",
    formalStart: "2026-03-01",
    formalEnd: "2027-08-31",
  },
  {
    code: "WP6",
    name: "Monitoring, evaluatie en duurzame implementatie",
    formalStart: "2026-03-01",
    formalEnd: "2027-09-01",
  },
] as const;

export function assessWorkPackageProgress(
  asOf: string,
  reportableHoursByWorkPackage: Record<string, number>,
): WorkPackageProgressAssessment[] {
  const formatHours = (value: number) =>
    new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 2 }).format(value);

  return workPackageFacts.map((workPackage) => {
    const reportableHours = reportableHoursByWorkPackage[workPackage.code] ?? 0;
    if (workPackage.formalStart > asOf) {
      return {
        ...workPackage,
        reportableHours,
        status: "NOT_DUE" as const,
        knownEvidence: `${formatHours(reportableHours)} rapportageklare uren; de formele fase is nog niet gestart.`,
        explanation: "Nul uren is op deze peildatum geen achterstand.",
      };
    }

    if (workPackage.code === "WP2") {
      return {
        ...workPackage,
        reportableHours,
        status: "DELAYED" as const,
        knownEvidence:
          `Twaalf zorginhoudelijke taalversies zijn gereed en gepubliceerd; ${formatHours(reportableHours)} rapportageklare uren ondersteunen de stand. De webpagina’s en praktijktest lopen nog.`,
        explanation:
          "De formele einddatum was 31 mei 2026, maar content- en technische werkzaamheden lopen door tot september.",
      };
    }

    if (workPackage.code === "WP5" || workPackage.code === "WP6") {
      return {
        ...workPackage,
        reportableHours,
        status: "BEHIND" as const,
        knownEvidence:
          workPackage.code === "WP5"
            ? `Er zijn ${formatHours(reportableHours)} rapportageklare uren en nog geen bevestigde kennisdelings- of borgingsactiviteiten uitgevoerd.`
            : `Er zijn ${formatHours(reportableHours)} rapportageklare uren en nog geen bevestigde monitoring- of evaluatieactiviteiten uitgevoerd.`,
        explanation:
          "Deze fase was volgens het activiteitenplan vanaf maart 2026 actief en vraagt een corrigerende planning.",
      };
    }

    return {
      ...workPackage,
      reportableHours,
      status: "IN_PROGRESS" as const,
      knownEvidence:
        workPackage.code === "WP1"
          ? `${formatHours(reportableHours)} rapportageklare uren voor projectcoördinatie en organisatie.`
          : `Een communicatietraining is uitgevoerd; ${formatHours(reportableHours)} rapportageklare uren ondersteunen de stand.`,
      explanation: "De fase is gestart en bevat aantoonbare uitvoering.",
    };
  });
}

export interface CorrectiveAction {
  id: string;
  title: string;
  periodStart: string;
  periodEnd: string;
  workPackageCodes: string[];
  deliverable: string;
  evidenceNeeded: string[];
  dependsOn: string[];
  claimsImpact: false;
}

export function buildCorrectiveActionPlan(): CorrectiveAction[] {
  return [
    {
      id: "complete-and-test-content",
      title: "Webpagina’s afronden en alle gepubliceerde materialen praktisch testen",
      periodStart: "2026-08-01",
      periodEnd: "2026-09-26",
      workPackageCodes: ["WP2", "WP3"],
      deliverable: "Geteste Nederlandse B1-, Arabische en Turkse pagina’s en bevindingen van een kleine therapeutgroep.",
      evidenceNeeded: ["publicatielinks", "testverslag", "release-overzicht"],
      dependsOn: [],
      claimsImpact: false,
    },
    {
      id: "pilot-meijhorst",
      title: "Pilot op locatie Meijhorst starten",
      periodStart: "2026-09-01",
      periodEnd: "2026-11-30",
      workPackageCodes: ["WP4"],
      deliverable: "Werkafspraken voor vooraf toesturen van procesvideo’s en inzet van zorginhoudelijke video’s in consulten.",
      evidenceNeeded: ["pilotprotocol", "teamafspraak", "geanonimiseerde gebruikstelling"],
      dependsOn: ["complete-and-test-content"],
      claimsImpact: false,
    },
    {
      id: "monitoring-baseline",
      title: "Monitoring en therapeutmeting vóór brede implementatie uitvoeren",
      periodStart: "2026-09-01",
      periodEnd: "2026-11-30",
      workPackageCodes: ["WP6"],
      deliverable: "Responsaantal, schaalverdelingen en een eenvoudige maandelijkse gebruiksteller.",
      evidenceNeeded: ["vragenlijstsamenvatting", "indicatorendefinitie", "gebruiksregistratie"],
      dependsOn: ["pilot-meijhorst"],
      claimsImpact: false,
    },
    {
      id: "staff-support",
      title: "Therapeuten en front-/backoffice ondersteunen bij de nieuwe werkwijze",
      periodStart: "2026-09-01",
      periodEnd: "2026-12-31",
      workPackageCodes: ["WP3", "WP4"],
      deliverable: "Korte instructies, terugkommomenten en eenduidige cliëntcommunicatie.",
      evidenceNeeded: ["instructie", "presentie", "actiepunten"],
      dependsOn: ["pilot-meijhorst"],
      claimsImpact: false,
    },
    {
      id: "rollout-fyfit",
      title: "Pilot evalueren en uitrollen naar overige Fy-fit-locaties",
      periodStart: "2026-12-01",
      periodEnd: "2027-02-28",
      workPackageCodes: ["WP4"],
      deliverable: "Bijgestelde werkwijze en aantoonbare ingebruikname op de overige locaties.",
      evidenceNeeded: ["pilotbesluit", "uitrolplanning", "locatieoverzicht"],
      dependsOn: ["pilot-meijhorst", "monitoring-baseline"],
      claimsImpact: false,
    },
    {
      id: "knowledge-sharing",
      title: "Kennis delen met De Schakel en regionale partners",
      periodStart: "2027-01-01",
      periodEnd: "2027-05-31",
      workPackageCodes: ["WP5"],
      deliverable: "Minimaal één aantoonbaar kennisdelingsmoment en afspraken over verdere verspreiding.",
      evidenceNeeded: ["agenda", "deelnemerslijst", "gedeeld materiaal", "vervolgafspraak"],
      dependsOn: ["pilot-meijhorst"],
      claimsImpact: false,
    },
    {
      id: "follow-up-impact",
      title: "Vervolgmeting en procesevaluatie uitvoeren",
      periodStart: "2027-03-01",
      periodEnd: "2027-07-31",
      workPackageCodes: ["WP6"],
      deliverable: "Vergelijking met de meting vóór brede implementatie, gebruikscijfers en kwalitatieve lessen.",
      evidenceNeeded: ["vervolgmeting", "gebruiksoverzicht", "evaluatieverslag"],
      dependsOn: ["monitoring-baseline", "rollout-fyfit"],
      claimsImpact: false,
    },
    {
      id: "embedding-and-handover",
      title: "Werkwijze borgen en projectoverdracht afronden",
      periodStart: "2027-06-01",
      periodEnd: "2027-08-31",
      workPackageCodes: ["WP1", "WP5", "WP6"],
      deliverable: "Geborgde werkafspraken, implementatiehandboek, einddossier en besluit over structureel beheer.",
      evidenceNeeded: ["werkproces", "implementatiehandboek", "beheerbesluit", "einddossier"],
      dependsOn: ["follow-up-impact", "knowledge-sharing"],
      claimsImpact: false,
    },
  ];
}
