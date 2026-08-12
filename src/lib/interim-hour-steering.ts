export type InterimBudgetLineKey =
  | "PRACTICE_PROJECT_MANAGEMENT"
  | "PRACTICE_IMPLEMENTATION"
  | "PHYSIOTHERAPIST_IMPLEMENTATION"
  | "FRONT_BACKOFFICE_IMPLEMENTATION"
  | "EXTERNAL_PROJECT_MANAGEMENT"
  | "WEBSITE_BUILDER"
  | "INTERNAL_TRAINER";

export interface InterimHourTarget {
  budgetLineKey: InterimBudgetLineKey;
  title: string;
  budgetCategory: string;
  workPackageCode: "WP1" | "WP2" | "WP3" | "WP4" | "WP5" | "WP6";
  activityCode: string;
  targetHours: number;
  rationale: string;
}

export interface InterimRegisteredHours {
  budgetCategory: string;
  workPackageCode: string;
  activityCode?: string;
  hours: number;
}

export type InterimComparisonState = "TO_ADD" | "ON_TARGET" | "ABOVE_TARGET";

export interface InterimComparisonRow {
  key: string;
  label: string;
  budgetHours: number;
  targetHours: number;
  currentHours: number;
  differenceHours: number;
  state: InterimComparisonState;
}

export interface InterimCatchUpProposal {
  budgetLineKey: InterimBudgetLineKey;
  title: string;
  workPackageCode: InterimHourTarget["workPackageCode"];
  activityCode: string;
  targetHours: number;
  currentHours: number;
  proposedHours: number;
  rationale: string;
}

const TITLE_DEFINITIONS: ReadonlyArray<{
  key: InterimBudgetLineKey;
  label: string;
  budgetHours: number;
}> = [
  { key: "PRACTICE_PROJECT_MANAGEMENT", label: "Praktijkmanagement · projectcoördinatie", budgetHours: 325 },
  { key: "PRACTICE_IMPLEMENTATION", label: "Praktijkmanagement · implementatie", budgetHours: 145 },
  { key: "PHYSIOTHERAPIST_IMPLEMENTATION", label: "Fysiotherapeuten · inhoud en implementatie", budgetHours: 60 },
  { key: "FRONT_BACKOFFICE_IMPLEMENTATION", label: "Front- en backoffice", budgetHours: 20 },
  { key: "EXTERNAL_PROJECT_MANAGEMENT", label: "Externe project- en innovatiemanager", budgetHours: 325 },
  { key: "WEBSITE_BUILDER", label: "Websitebouwer", budgetHours: 25 },
  { key: "INTERNAL_TRAINER", label: "Interne opleider", budgetHours: 20 },
];

/**
 * Project-owner delegated operational estimate for the first reporting cutoff.
 * It deliberately totals 450/920 hours (48.9%), not a linear 50% copy.
 * WP2/content is front-loaded; implementation, front/backoffice, scaling and
 * evaluation carry more work in the second project half. Role totals may
 * therefore differ materially from the same percentage of each budget line.
 */
export const INTERIM_HOUR_TARGETS: readonly InterimHourTarget[] = [
  {
    budgetLineKey: "PRACTICE_PROJECT_MANAGEMENT",
    title: "Praktijkmanagement · projectcoördinatie",
    budgetCategory: "Praktijkmanager",
    workPackageCode: "WP1",
    activityCode: "A1.1",
    targetHours: 150,
    rationale: "Projectorganisatie en afstemming lopen door, maar het zwaartepunt van uitvoering en borging volgt later.",
  },
  {
    budgetLineKey: "PRACTICE_IMPLEMENTATION",
    title: "Praktijkmanagement · implementatie",
    budgetCategory: "Praktijkmanager",
    workPackageCode: "WP2",
    activityCode: "A2.2",
    targetHours: 15,
    rationale: "Praktijkhouders en praktijkmanagement leverden al inhoudelijke voorbereiding en afstemming voor de ontwikkelfase.",
  },
  {
    budgetLineKey: "PRACTICE_IMPLEMENTATION",
    title: "Praktijkmanagement · implementatie",
    budgetCategory: "Praktijkmanager",
    workPackageCode: "WP4",
    activityCode: "A4.1",
    targetHours: 20,
    rationale: "De eerste implementatie, werkafspraken en begeleiding zijn aantoonbaar gestart; monitoring en kennisdeling volgen als toekomstige inzet.",
  },
  {
    budgetLineKey: "PHYSIOTHERAPIST_IMPLEMENTATION",
    title: "Fysiotherapeuten · inhoud en implementatie",
    budgetCategory: "Fysiotherapeuten",
    workPackageCode: "WP2",
    activityCode: "A2.2",
    targetHours: 40,
    rationale: "Inhoudelijke expertise, teksten en praktijktesten waren in de ontwikkelfase relatief vroeg nodig.",
  },
  {
    budgetLineKey: "EXTERNAL_PROJECT_MANAGEMENT",
    title: "Externe project- en innovatiemanager",
    budgetCategory: "Extern adviseur",
    workPackageCode: "WP1",
    activityCode: "A1.1",
    targetHours: 65,
    rationale: "Projectleiding was intensief in de opstart; begeleiding van implementatie, monitoring en afronding krijgt bewust meer uren in de tweede helft.",
  },
  {
    budgetLineKey: "EXTERNAL_PROJECT_MANAGEMENT",
    title: "Externe project- en innovatiemanager",
    budgetCategory: "Extern adviseur",
    workPackageCode: "WP2",
    activityCode: "A2.2",
    targetHours: 100,
    rationale: "Contentontwikkeling, technische afstemming en kwaliteitsbewaking waren bewust voorbelast in de eerste helft.",
  },
  {
    budgetLineKey: "WEBSITE_BUILDER",
    title: "Websitebouwer",
    budgetCategory: "Websitebouwer",
    workPackageCode: "WP2",
    activityCode: "A2.1",
    targetHours: 40,
    rationale: "De technische bouw was voorbelast en mocht inhoudelijk boven de 25 begrote uren uitkomen; die afwijking blijft zichtbaar.",
  },
  {
    budgetLineKey: "INTERNAL_TRAINER",
    title: "Interne opleider",
    budgetCategory: "Praktijkmanager",
    workPackageCode: "WP3",
    activityCode: "A3.1",
    targetHours: 20,
    rationale: "Voorbereiding, afstemming en uitvoering van de communicatietraining vallen grotendeels vóór de tussenrapportage.",
  },
] as const;

export const INTERIM_TARGET_TOTAL_HOURS = INTERIM_HOUR_TARGETS.reduce(
  (sum, target) => sum + target.targetHours,
  0,
);

function roundHours(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function titleKeyFor(row: InterimRegisteredHours): InterimBudgetLineKey | null {
  if (row.budgetCategory === "Praktijkmanager") {
    if (row.workPackageCode === "WP1") return "PRACTICE_PROJECT_MANAGEMENT";
    if (row.workPackageCode === "WP3") return "INTERNAL_TRAINER";
    return "PRACTICE_IMPLEMENTATION";
  }
  if (row.budgetCategory === "Fysiotherapeuten") return "PHYSIOTHERAPIST_IMPLEMENTATION";
  if (row.budgetCategory === "Front/backoffice") return "FRONT_BACKOFFICE_IMPLEMENTATION";
  if (row.budgetCategory === "Extern adviseur") return "EXTERNAL_PROJECT_MANAGEMENT";
  if (row.budgetCategory === "Websitebouwer") return "WEBSITE_BUILDER";
  return null;
}

function comparisonState(differenceHours: number): InterimComparisonState {
  if (differenceHours > 0) return "TO_ADD";
  if (differenceHours < 0) return "ABOVE_TARGET";
  return "ON_TARGET";
}

export function buildInterimHoursSteering(registrations: InterimRegisteredHours[]) {
  const currentByTitle = new Map<InterimBudgetLineKey, number>();
  const currentByWorkPackage = new Map<string, number>();
  const currentByScope = new Map<string, number>();

  for (const row of registrations) {
    const titleKey = titleKeyFor(row);
    if (titleKey) currentByTitle.set(titleKey, (currentByTitle.get(titleKey) || 0) + row.hours);
    currentByWorkPackage.set(
      row.workPackageCode,
      (currentByWorkPackage.get(row.workPackageCode) || 0) + row.hours,
    );
    if (titleKey) {
      const scopeKey = `${titleKey}|${row.workPackageCode}`;
      currentByScope.set(scopeKey, (currentByScope.get(scopeKey) || 0) + row.hours);
    }
  }

  const targetByTitle = new Map<InterimBudgetLineKey, number>();
  const targetByWorkPackage = new Map<string, number>();
  for (const target of INTERIM_HOUR_TARGETS) {
    targetByTitle.set(
      target.budgetLineKey,
      (targetByTitle.get(target.budgetLineKey) || 0) + target.targetHours,
    );
    targetByWorkPackage.set(
      target.workPackageCode,
      (targetByWorkPackage.get(target.workPackageCode) || 0) + target.targetHours,
    );
  }

  const titles: InterimComparisonRow[] = TITLE_DEFINITIONS.map((definition) => {
    const targetHours = roundHours(targetByTitle.get(definition.key) || 0);
    const currentHours = roundHours(currentByTitle.get(definition.key) || 0);
    const differenceHours = roundHours(targetHours - currentHours);
    return {
      key: definition.key,
      label: definition.label,
      budgetHours: definition.budgetHours,
      targetHours,
      currentHours,
      differenceHours,
      state: comparisonState(differenceHours),
    };
  });

  const workPackageLabels: Record<string, string> = {
    WP1: "Projectcoördinatie",
    WP2: "Contentontwikkeling",
    WP3: "Scholing",
    WP4: "Implementatie",
    WP5: "Verspreiding en borging",
    WP6: "Monitoring en evaluatie",
  };
  const workPackages = Object.entries(workPackageLabels).map(([code, label]) => {
    const targetHours = roundHours(targetByWorkPackage.get(code) || 0);
    const currentHours = roundHours(currentByWorkPackage.get(code) || 0);
    const differenceHours = roundHours(targetHours - currentHours);
    return {
      code,
      label,
      targetHours,
      currentHours,
      differenceHours,
      state: comparisonState(differenceHours),
    };
  });

  const proposals: InterimCatchUpProposal[] = INTERIM_HOUR_TARGETS.flatMap((target) => {
    const scopeKey = `${target.budgetLineKey}|${target.workPackageCode}`;
    const currentHours = roundHours(currentByScope.get(scopeKey) || 0);
    const proposedHours = roundHours(Math.max(0, target.targetHours - currentHours));
    if (proposedHours === 0) return [];
    return [{
      budgetLineKey: target.budgetLineKey,
      title: target.title,
      workPackageCode: target.workPackageCode,
      activityCode: target.activityCode,
      targetHours: target.targetHours,
      currentHours,
      proposedHours,
      rationale: target.rationale,
    }];
  });

  const currentHours = roundHours(registrations.reduce((sum, row) => sum + row.hours, 0));
  const missingAcrossScopesHours = roundHours(
    proposals.reduce((sum, proposal) => sum + proposal.proposedHours, 0),
  );
  const aboveAcrossScopesHours = roundHours(
    titles.reduce((sum, row) => sum + Math.max(0, -row.differenceHours), 0),
  );

  return {
    totals: {
      budgetHours: TITLE_DEFINITIONS.reduce((sum, row) => sum + row.budgetHours, 0),
      targetHours: INTERIM_TARGET_TOTAL_HOURS,
      currentHours,
      netVarianceHours: roundHours(currentHours - INTERIM_TARGET_TOTAL_HOURS),
      missingAcrossScopesHours,
      aboveAcrossScopesHours,
    },
    titles,
    workPackages,
    proposals,
    targets: INTERIM_HOUR_TARGETS,
  };
}
