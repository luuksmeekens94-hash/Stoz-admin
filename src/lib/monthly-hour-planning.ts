export type PlannedWorkPackageCode = "WP1" | "WP2" | "WP3" | "WP4" | "WP5" | "WP6";
export type PlannedActivityCode =
  | "A1.1"
  | "A2.1"
  | "A3.1"
  | "A3.2"
  | "A4.1"
  | "A4.2"
  | "A5.1"
  | "A5.2"
  | "A6.1"
  | "A6.2";

export type MonthlyPlanSourceState =
  | "OPERATIONAL_FORECAST"
  | "APPROVED_REMAINING"
  | "OUTSIDE_APPROVED_QUANTITY"
  | "DECISION_REQUIRED";

export interface MonthlyPlanSuggestion {
  monthKey: string;
  budgetLineKey: string;
  roleCategory: string;
  label: string;
  workPackageCode: PlannedWorkPackageCode;
  activityCode: PlannedActivityCode;
  plannedHours: number;
  rationale: string;
  sourceState: MonthlyPlanSourceState;
  /** Forecasts never become HourEntry records directly. */
  canMaterialize: false;
  registrationPreparation: "PREFILL_ONLY_AFTER_EXECUTION" | "BLOCKED_PENDING_DECISION";
}

export interface CorrectiveMonthlyPlan {
  monthKey: string;
  planningState: "OPERATIONAL_FORECAST";
  suggestions: MonthlyPlanSuggestion[];
}

export interface ProposedPlanningDate {
  date: string;
  hours: number;
  state: "PROPOSED_DATE";
}

export interface ForecastEntrySuggestion {
  plannedDate: string;
  executorName: string;
  plannedHours: number;
  note: string;
}

export interface PlanActualPlanRow {
  monthKey: string;
  roleCategory: string;
  workPackageCode: string;
  activityCode: string;
  plannedHours: number;
}

export interface PlanActualActualRow {
  monthKey: string;
  roleCategory: string;
  workPackageCode: string;
  activityCode: string;
  actualHours: number;
}

export interface PlanActualComparison {
  monthKey: string;
  roleCategory: string;
  workPackageCode: string;
  activityCode: string;
  plannedHours: number;
  actualHours: number;
  varianceHours: number;
}

export function resolvePlanActualRoleCategory(input: {
  budgetCategory: string;
  workPackageCode: string;
}) {
  if (input.budgetCategory !== "Praktijkmanager") return input.budgetCategory;
  return input.workPackageCode === "WP3" ? "Interne opleider" : "Praktijkmanagement";
}

function planActualKey(row: {
  monthKey: string;
  roleCategory: string;
  workPackageCode: string;
  activityCode: string;
}) {
  return [row.monthKey, row.roleCategory, row.workPackageCode, row.activityCode].join("\u001f");
}

export function comparePlanActual(
  planRows: PlanActualPlanRow[],
  actualRows: PlanActualActualRow[],
): PlanActualComparison[] {
  const grouped = new Map<string, PlanActualComparison>();
  const ensure = (row: Omit<PlanActualComparison, "plannedHours" | "actualHours" | "varianceHours">) => {
    const key = planActualKey(row);
    const current = grouped.get(key) || { ...row, plannedHours: 0, actualHours: 0, varianceHours: 0 };
    grouped.set(key, current);
    return current;
  };

  for (const row of planRows) ensure(row).plannedHours += row.plannedHours;
  for (const row of actualRows) ensure(row).actualHours += row.actualHours;

  return Array.from(grouped.values())
    .map((row) => ({
      ...row,
      plannedHours: Math.round(row.plannedHours * 100) / 100,
      actualHours: Math.round(row.actualHours * 100) / 100,
      varianceHours: Math.round((row.actualHours - row.plannedHours) * 100) / 100,
    }))
    .sort((a, b) => planActualKey(a).localeCompare(planActualKey(b), "nl"));
}

export function findActualOnlyComparisons(rows: PlanActualComparison[]) {
  return rows.filter((row) => row.plannedHours === 0 && row.actualHours > 0);
}

const PLAN_MONTH_KEYS = [
  "2026-08",
  "2026-09",
  "2026-10",
  "2026-11",
  "2026-12",
  "2027-01",
  "2027-02",
  "2027-03",
  "2027-04",
  "2027-05",
  "2027-06",
  "2027-07",
  "2027-08",
] as const;

type ApprovedPlanLineKind =
  | "PROJECT_MANAGEMENT"
  | "PRACTICE_IMPLEMENTATION"
  | "EXTERNAL_MANAGEMENT"
  | "PHYSIOTHERAPISTS"
  | "FRONT_BACKOFFICE"
  | "INTERNAL_TRAINER";

interface ApprovedPlanLine {
  kind: ApprovedPlanLineKind;
  budgetLineKey: string;
  roleCategory: string;
  label: string;
  hoursByMonth: readonly number[];
}

const APPROVED_PLAN_LINES: readonly ApprovedPlanLine[] = [
  {
    kind: "PROJECT_MANAGEMENT",
    budgetLineKey: "PRACTICE_PROJECT_MANAGEMENT",
    roleCategory: "Praktijkmanagement",
    label: "Praktijkmanager en praktijkhouders · projectmanagement",
    hoursByMonth: [8, 14, 14, 14, 13, 16, 16, 12, 12, 11, 9, 7, 7],
  },
  {
    kind: "PRACTICE_IMPLEMENTATION",
    budgetLineKey: "PRACTICE_IMPLEMENTATION",
    roleCategory: "Praktijkmanagement",
    label: "Praktijkmanager en praktijkhouders · implementatie",
    hoursByMonth: [5, 8, 8, 8, 8, 10, 8, 5, 5, 4, 3, 2, 3],
  },
  {
    kind: "EXTERNAL_MANAGEMENT",
    budgetLineKey: "EXTERNAL_PROJECT_MANAGEMENT",
    roleCategory: "Extern adviseur",
    label: "Externe project- en innovatiemanager",
    hoursByMonth: [5, 7, 8, 8, 7.5, 8, 8, 5, 4, 3, 2, 2, 1],
  },
  {
    kind: "PHYSIOTHERAPISTS",
    budgetLineKey: "PHYSIOTHERAPIST_IMPLEMENTATION",
    roleCategory: "Fysiotherapeuten",
    label: "Fysiotherapeuten Fy-fit · implementatie",
    hoursByMonth: [0, 8, 10, 10, 10, 12, 10, 0, 0, 0, 0, 0, 0],
  },
  {
    kind: "FRONT_BACKOFFICE",
    budgetLineKey: "FRONT_BACKOFFICE_IMPLEMENTATION",
    roleCategory: "Front/backoffice",
    label: "Front- en backoffice · implementatie",
    hoursByMonth: [2, 3, 3, 3, 2, 3, 2, 1, 1, 0, 0, 0, 0],
  },
  {
    kind: "INTERNAL_TRAINER",
    budgetLineKey: "INTERNAL_TRAINER",
    roleCategory: "Interne opleider",
    label: "Praktijk Fy-fit / projectleider · opleider",
    hoursByMonth: [6, 7, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  },
];

function phaseCodeFor(
  lineKind: ApprovedPlanLineKind,
  monthIndex: number,
): { workPackageCode: PlannedWorkPackageCode; activityCode: PlannedActivityCode } {
  switch (lineKind) {
    case "PROJECT_MANAGEMENT":
      return { workPackageCode: "WP1", activityCode: "A1.1" };
    case "INTERNAL_TRAINER":
      return { workPackageCode: "WP3", activityCode: "A3.2" };
    case "PHYSIOTHERAPISTS":
      return monthIndex <= 4
        ? { workPackageCode: "WP4", activityCode: "A4.1" }
        : { workPackageCode: "WP4", activityCode: "A4.2" };
    case "FRONT_BACKOFFICE":
      if (monthIndex === 0) return { workPackageCode: "WP3", activityCode: "A3.2" };
      if (monthIndex <= 4) return { workPackageCode: "WP4", activityCode: "A4.1" };
      if (monthIndex <= 6) return { workPackageCode: "WP4", activityCode: "A4.2" };
      return { workPackageCode: "WP5", activityCode: "A5.1" };
    case "PRACTICE_IMPLEMENTATION":
      if (monthIndex === 0) return { workPackageCode: "WP6", activityCode: "A6.1" };
      if (monthIndex <= 4) return { workPackageCode: "WP4", activityCode: "A4.1" };
      if (monthIndex <= 6) return { workPackageCode: "WP4", activityCode: "A4.2" };
      if (monthIndex <= 8) return { workPackageCode: "WP5", activityCode: "A5.1" };
      if (monthIndex === 9) return { workPackageCode: "WP5", activityCode: "A5.2" };
      return { workPackageCode: "WP6", activityCode: "A6.2" };
    case "EXTERNAL_MANAGEMENT":
      if (monthIndex <= 4) return { workPackageCode: "WP6", activityCode: "A6.1" };
      if (monthIndex <= 6) return { workPackageCode: "WP4", activityCode: "A4.2" };
      if (monthIndex <= 8) return { workPackageCode: "WP5", activityCode: "A5.1" };
      if (monthIndex === 9) return { workPackageCode: "WP5", activityCode: "A5.2" };
      return { workPackageCode: "WP6", activityCode: "A6.2" };
  }
}

function rationaleFor(workPackageCode: PlannedWorkPackageCode, monthKey: string): string {
  if (workPackageCode === "WP1") {
    return "Operationele forecast voor projectsturing, besluitvorming, RVO-dossier en voortgangsbewaking.";
  }
  if (workPackageCode === "WP3") {
    return "Operationele forecast voor voorbereiding, instructie en ondersteuning; alleen registreren na feitelijke uitvoering.";
  }
  if (workPackageCode === "WP4") {
    return monthKey <= "2026-12"
      ? "Operationele forecast voor pilot, werkafspraken, cliëntcommunicatie en eerste implementatie."
      : "Operationele forecast voor bijstelling en uitrol naar overige Fy-fit-locaties.";
  }
  if (workPackageCode === "WP5") {
    return "Operationele forecast voor kennisdeling, regionale samenwerking en borgingsafspraken.";
  }
  if (workPackageCode === "WP6") {
    return monthKey <= "2026-12"
      ? "Operationele forecast voor nulmeting, indicatoren en inrichting van de gebruiksmonitoring."
      : "Operationele forecast voor vervolgmeting, evaluatie, borging en overdracht.";
  }
  return "Besluitpunt buiten de goedgekeurde resterende urenhoeveelheid.";
}

export function assertAutomaticPlanningCreationAllowed(existingVersionCount: number) {
  if (!Number.isInteger(existingVersionCount) || existingVersionCount < 0) {
    throw new Error("Het aantal planningversies is ongeldig.");
  }
  if (existingVersionCount > 0) {
    throw new Error(
      "Nieuwe planningrevisie geblokkeerd: leg eerst een expliciet herijkte actualbaseline vast.",
    );
  }
}

export function buildCorrectiveMonthlyPlan(): CorrectiveMonthlyPlan[] {
  return PLAN_MONTH_KEYS.map((monthKey, monthIndex) => {
    const suggestions: MonthlyPlanSuggestion[] = APPROVED_PLAN_LINES.flatMap((line) => {
      const plannedHours = line.hoursByMonth[monthIndex];
      if (plannedHours === undefined) {
        throw new Error(`${line.label} mist een maandwaarde voor ${monthKey}.`);
      }
      if (plannedHours === 0) return [];
      const phaseCode = phaseCodeFor(line.kind, monthIndex);
      return [
        {
          monthKey,
          budgetLineKey: line.budgetLineKey,
          roleCategory: line.roleCategory,
          label: line.label,
          ...phaseCode,
          plannedHours,
          rationale: rationaleFor(phaseCode.workPackageCode, monthKey),
          sourceState: "OPERATIONAL_FORECAST" as const,
          canMaterialize: false as const,
          registrationPreparation: "PREFILL_ONLY_AFTER_EXECUTION" as const,
        },
      ];
    });

    return { monthKey, planningState: "OPERATIONAL_FORECAST", suggestions };
  });
}

export function findMonthlyPlan(monthKey: string): CorrectiveMonthlyPlan | undefined {
  return buildCorrectiveMonthlyPlan().find((month) => month.monthKey === monthKey);
}

const FUTURE_MONTH_KEYS = PLAN_MONTH_KEYS.slice(1);

interface RebalancedFutureLine {
  budgetLineKey: string;
  roleCategory: string;
  label: string;
  hoursByMonth: readonly number[];
  phase: (monthIndex: number) => {
    workPackageCode: PlannedWorkPackageCode;
    activityCode: PlannedActivityCode;
  };
}

const REBALANCED_FUTURE_LINES: readonly RebalancedFutureLine[] = [
  {
    budgetLineKey: "PRACTICE_PROJECT_MANAGEMENT",
    roleCategory: "Praktijkmanagement",
    label: "Praktijkmanager en praktijkhouders · projectmanagement",
    hoursByMonth: [13, 13, 13, 12, 14, 14, 11, 10, 9, 8, 6, 6],
    phase: () => ({ workPackageCode: "WP1", activityCode: "A1.1" }),
  },
  {
    budgetLineKey: "PRACTICE_IMPLEMENTATION",
    roleCategory: "Praktijkmanagement",
    label: "Praktijkmanager en praktijkhouders · implementatie",
    hoursByMonth: [8, 9, 9, 8, 10, 8, 0, 0, 0, 0, 0, 0],
    phase: (monthIndex) => monthIndex <= 3
      ? { workPackageCode: "WP4", activityCode: "A4.1" }
      : { workPackageCode: "WP4", activityCode: "A4.2" },
  },
  {
    budgetLineKey: "PRACTICE_IMPLEMENTATION",
    roleCategory: "Praktijkmanagement",
    label: "Praktijkmanager en praktijkhouders · kennisdeling",
    hoursByMonth: [0, 0, 1, 1, 2, 2, 3, 3, 3, 2, 2, 1],
    phase: (monthIndex) => monthIndex <= 8
      ? { workPackageCode: "WP5", activityCode: "A5.1" }
      : { workPackageCode: "WP5", activityCode: "A5.2" },
  },
  {
    budgetLineKey: "PRACTICE_IMPLEMENTATION",
    roleCategory: "Praktijkmanagement",
    label: "Praktijkmanager en praktijkhouders · monitoring",
    hoursByMonth: [2, 2, 2, 2, 2, 2, 2, 2, 1, 1, 1, 1],
    phase: (monthIndex) => monthIndex <= 5
      ? { workPackageCode: "WP6", activityCode: "A6.1" }
      : { workPackageCode: "WP6", activityCode: "A6.2" },
  },
  {
    budgetLineKey: "EXTERNAL_PROJECT_MANAGEMENT",
    roleCategory: "Extern adviseur",
    label: "Externe project- en innovatiemanager",
    hoursByMonth: [6, 7, 7, 6.5, 7, 7, 4, 3.5, 2.5, 1.5, 1.5, 1],
    phase: (monthIndex) => phaseCodeFor("EXTERNAL_MANAGEMENT", monthIndex + 1),
  },
  {
    budgetLineKey: "PHYSIOTHERAPIST_IMPLEMENTATION",
    roleCategory: "Fysiotherapeuten",
    label: "Fysiotherapeuten Fy-fit · implementatie",
    hoursByMonth: [8, 10, 10, 10, 12, 10, 0, 0, 0, 0, 0, 0],
    phase: (monthIndex) => phaseCodeFor("PHYSIOTHERAPISTS", monthIndex + 1),
  },
  {
    budgetLineKey: "FRONT_BACKOFFICE_IMPLEMENTATION",
    roleCategory: "Front/backoffice",
    label: "Front- en backoffice · implementatie",
    hoursByMonth: [3, 3, 3, 2, 3, 2, 1, 1, 0, 0, 0, 0],
    phase: (monthIndex) => phaseCodeFor("FRONT_BACKOFFICE", monthIndex + 1),
  },
  {
    budgetLineKey: "INTERNAL_TRAINER",
    roleCategory: "Interne opleider",
    label: "Praktijk Fy-fit / projectleider · opleider",
    hoursByMonth: [7, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    phase: (monthIndex) => phaseCodeFor("INTERNAL_TRAINER", monthIndex + 1),
  },
];

export function buildRebalancedFutureMonthlyPlan(): CorrectiveMonthlyPlan[] {
  return FUTURE_MONTH_KEYS.map((monthKey, monthIndex) => ({
    monthKey,
    planningState: "OPERATIONAL_FORECAST",
    suggestions: REBALANCED_FUTURE_LINES.flatMap((line) => {
      const plannedHours = line.hoursByMonth[monthIndex];
      if (plannedHours === undefined) throw new Error(`${line.label} mist een maandwaarde voor ${monthKey}.`);
      if (plannedHours === 0) return [];
      const phase = line.phase(monthIndex);
      return [{
        monthKey,
        budgetLineKey: line.budgetLineKey,
        roleCategory: line.roleCategory,
        label: line.label,
        ...phase,
        plannedHours,
        rationale: rationaleFor(phase.workPackageCode, monthKey),
        sourceState: "OPERATIONAL_FORECAST" as const,
        canMaterialize: false as const,
        registrationPreparation: "PREFILL_ONLY_AFTER_EXECUTION" as const,
      }];
    }),
  }));
}

export function spreadPlannedHoursAcrossDates(
  monthKey: string,
  totalHours: number,
  maxHoursPerDate = 4,
): ProposedPlanningDate[] {
  if (!/^\d{4}-\d{2}$/.test(monthKey)) throw new Error("Ongeldige planmaand.");
  if (totalHours <= 0 || Math.round(totalHours * 4) !== totalHours * 4) {
    throw new Error("Planuren moeten positief en in kwartieren zijn.");
  }
  if (maxHoursPerDate <= 0 || Math.round(maxHoursPerDate * 4) !== maxHoursPerDate * 4) {
    throw new Error("Maximum per datum moet positief en in kwartieren zijn.");
  }

  const [year, month] = monthKey.split("-").map(Number);
  const businessDays: string[] = [];
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(Date.UTC(year, month - 1, day));
    const weekDay = date.getUTCDay();
    if (weekDay !== 0 && weekDay !== 6) businessDays.push(date.toISOString().slice(0, 10));
  }

  const totalQuarters = Math.round(totalHours * 4);
  const maxQuarters = Math.round(maxHoursPerDate * 4);
  const rowCount = Math.ceil(totalQuarters / maxQuarters);
  if (rowCount > businessDays.length) throw new Error("Te veel planuren voor het maximum per werkdag.");

  const baseQuarters = Math.floor(totalQuarters / rowCount);
  let remainder = totalQuarters - baseQuarters * rowCount;
  return Array.from({ length: rowCount }, (_, index) => {
    const quarters = baseQuarters + (remainder > 0 ? 1 : 0);
    remainder = Math.max(0, remainder - 1);
    const dayIndex = Math.min(
      businessDays.length - 1,
      Math.floor(((index + 0.5) * businessDays.length) / rowCount),
    );
    return {
      date: businessDays[dayIndex],
      hours: quarters / 4,
      state: "PROPOSED_DATE" as const,
    };
  });
}

export type ForecastExecutorCatalog = Partial<Record<string, string[]>>;

export const FRONT_BACKOFFICE_OPERATIONAL_EXECUTORS = [
  "Marion Brouwer",
  "Sjoerd Hendriks",
] as const;

export type ForecastExecutorBudgetRow = {
  category: string;
  user: { id: string; name: string | null; active: boolean } | null;
};

export type ForecastExecutorContributionRow = {
  userId: string;
  user: { name: string | null };
  therapist: { name: string; active?: boolean } | null;
  workPackage?: { code: string };
};

export type ForecastOperationalExecutorRow = {
  name: string;
  active: boolean;
};

function uniqueExecutorNames(values: Array<string | null | undefined>) {
  return Array.from(new Set(values
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))))
    .sort((a, b) => a.localeCompare(b, "nl"));
}

export function buildForecastExecutorCatalog(
  budgetRows: ForecastExecutorBudgetRow[],
  contributionRows: ForecastExecutorContributionRow[],
  operationalExecutorRows?: ForecastOperationalExecutorRow[],
): ForecastExecutorCatalog {
  const categoryByUserId = new Map(
    budgetRows.flatMap((row) => row.user?.active ? [[row.user.id, row.category] as const] : []),
  );
  const fallbackByCategory = (category: string) => uniqueExecutorNames(
    budgetRows.filter((row) => row.category === category && row.user?.active).map((row) => row.user?.name),
  );
  const contributorsByCategory = (category: string) => uniqueExecutorNames(
    contributionRows
      .filter((row) => categoryByUserId.get(row.userId) === category)
      .map((row) => row.user.name),
  );
  const practiceContributors = contributorsByCategory("Praktijkmanager");
  const externalContributors = contributorsByCategory("Extern adviseur");
  const trainerContributors = uniqueExecutorNames(
    contributionRows
      .filter((row) => categoryByUserId.get(row.userId) === "Praktijkmanager" && row.workPackage?.code === "WP3")
      .map((row) => row.user.name),
  );
  const therapists = uniqueExecutorNames(
    contributionRows
      .filter((row) => row.therapist && row.therapist.active !== false)
      .map((row) => row.therapist?.name),
  );
  const activeOperationalExecutors = uniqueExecutorNames(
    (operationalExecutorRows || [])
      .filter((row) => row.active)
      .map((row) => row.name),
  );
  const frontBackofficeExecutors = operationalExecutorRows === undefined
    ? fallbackByCategory("Front/backoffice")
    : FRONT_BACKOFFICE_OPERATIONAL_EXECUTORS.every((name) => activeOperationalExecutors.includes(name))
      ? [...FRONT_BACKOFFICE_OPERATIONAL_EXECUTORS]
      : [];

  return {
    Praktijkmanagement: practiceContributors.length > 0 ? practiceContributors : fallbackByCategory("Praktijkmanager"),
    "Extern adviseur": externalContributors.length > 0 ? externalContributors : fallbackByCategory("Extern adviseur"),
    Fysiotherapeuten: therapists,
    "Front/backoffice": frontBackofficeExecutors,
    "Interne opleider": trainerContributors.length > 0
      ? trainerContributors
      : practiceContributors.length > 0
        ? practiceContributors
        : fallbackByCategory("Praktijkmanager"),
  };
}

export function forecastExecutorsFor(
  roleCategory: string,
  catalog: ForecastExecutorCatalog = {},
): string[] {
  return catalog[roleCategory]
    ?.map((name) => name.trim())
    .filter((name) => Boolean(name) && !/(?:nog\s+toe\s+te\s+wijzen|toe\s+te\s+wijzen|onbekend|n\.?n\.?b\.?)/i.test(name))
    || [];
}

function preferredPlanningDates(
  suggestion: Pick<MonthlyPlanSuggestion, "monthKey" | "plannedHours" | "workPackageCode">,
  minimumRowCount = 1,
) {
  const [year, month] = suggestion.monthKey.split("-").map(Number);
  const dates: string[] = [];
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const includeWednesday = suggestion.workPackageCode === "WP6" && month % 3 === 2;
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(Date.UTC(year, month - 1, day));
    const weekday = date.getUTCDay();
    if (weekday === 1 || weekday === 4 || (includeWednesday && weekday === 3)) {
      dates.push(date.toISOString().slice(0, 10));
    }
  }

  const totalQuarters = Math.round(suggestion.plannedHours * 4);
  const rowCount = Math.max(
    Math.ceil(totalQuarters / 16),
    Math.min(minimumRowCount, totalQuarters),
  );
  const baseQuarters = Math.floor(totalQuarters / rowCount);
  const wednesdays = dates.filter((date) => new Date(`${date}T00:00:00.000Z`).getUTCDay() === 3);
  let remainder = totalQuarters - baseQuarters * rowCount;
  return Array.from({ length: rowCount }, (_, index) => {
    const quarters = baseQuarters + (remainder > 0 ? 1 : 0);
    remainder = Math.max(0, remainder - 1);
    const dateIndex = Math.min(dates.length - 1, Math.floor(((index + 0.5) * dates.length) / rowCount));
    const date = includeWednesday && index === 0 && wednesdays.length > 0
      ? wednesdays[Math.floor(wednesdays.length / 2)]
      : dates[dateIndex];
    return { date, hours: quarters / 4 };
  });
}

function forecastWorkDescription(
  suggestion: Pick<MonthlyPlanSuggestion, "workPackageCode" | "activityCode">,
) {
  const descriptions: Record<string, string> = {
    "WP1|A1.1": "Projectvoortgang besproken, besluiten voorbereid en concrete vervolgacties afgestemd.",
    "WP3|A3.1": "Communicatietraining voorbereid, uitgevoerd en met het behandelteam geëvalueerd.",
    "WP3|A3.2": "Interne instructie voorbereid en praktische ondersteuning voor collega's uitgewerkt.",
    "WP4|A4.1": "Eerste implementatiestappen begeleid, werkafspraken getest en praktijkfeedback verwerkt.",
    "WP4|A4.2": "Implementatie bijgesteld en vervolguitrol naar betrokken locaties praktisch begeleid.",
    "WP5|A5.1": "Praktijkervaringen gebundeld en een concreet kennisdelingsmoment voorbereid.",
    "WP5|A5.2": "Borgingsafspraken uitgewerkt en kennisdeling met betrokken partners georganiseerd.",
    "WP6|A6.1": "Indicatoren ingericht, gebruikssignalen verzameld en de eerste monitoring bijgewerkt.",
    "WP6|A6.2": "Monitoringsuitkomsten geëvalueerd en verbeteracties voor borging en overdracht vastgelegd.",
  };
  return descriptions[`${suggestion.workPackageCode}|${suggestion.activityCode}`]
    || "Werkzaamheden voorbereid, uitgevoerd en met de betrokken projectleden afgestemd.";
}

export function buildForecastEntrySuggestions(
  suggestion: Pick<
    MonthlyPlanSuggestion,
    "monthKey" | "roleCategory" | "plannedHours" | "rationale" | "workPackageCode" | "activityCode"
  >,
  catalog: ForecastExecutorCatalog = {},
): ForecastEntrySuggestion[] {
  const executors = forecastExecutorsFor(suggestion.roleCategory, catalog);
  if (executors.length === 0) {
    throw new Error(`Geen echte uitvoerder beschikbaar voor ${suggestion.roleCategory}.`);
  }
  return preferredPlanningDates(suggestion, executors.length).map((date, index) => ({
    plannedDate: date.date,
    executorName: executors[index % executors.length],
    plannedHours: date.hours,
    note: forecastWorkDescription(suggestion),
  }));
}
