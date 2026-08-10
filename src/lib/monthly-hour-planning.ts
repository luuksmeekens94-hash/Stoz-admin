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
    hoursByMonth: [8, 14, 15, 15, 14, 17, 16, 10, 9, 8, 5, 3, 3],
  },
  {
    kind: "EXTERNAL_MANAGEMENT",
    budgetLineKey: "EXTERNAL_PROJECT_MANAGEMENT",
    roleCategory: "Extern adviseur",
    label: "Externe project- en innovatiemanager",
    hoursByMonth: [6, 11, 12, 12, 11.5, 13, 13, 9, 8, 6, 3, 2, 1],
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
    hoursByMonth: [6, 8, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
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
          sourceState: "APPROVED_REMAINING" as const,
          canMaterialize: false as const,
          registrationPreparation: "PREFILL_ONLY_AFTER_EXECUTION" as const,
        },
      ];
    });

    if (monthIndex <= 1) {
      suggestions.push({
        monthKey,
        budgetLineKey: "WEBSITE_BUILDER_DECISION",
        roleCategory: "Websitebouwer",
        label: "Websitebouwer · budgetbesluit vereist",
        workPackageCode: "WP2",
        activityCode: "A2.1",
        plannedHours: 0,
        rationale:
          "Websitebouwer heeft 56 uur tegenover 25 uur budget; zonder formele begrotingswijziging zijn extra uren mogelijk niet-subsidiabel.",
        sourceState: "DECISION_REQUIRED",
        canMaterialize: false,
        registrationPreparation: "BLOCKED_PENDING_DECISION",
      });
    }

    return { monthKey, planningState: "OPERATIONAL_FORECAST", suggestions };
  });
}

export function findMonthlyPlan(monthKey: string): CorrectiveMonthlyPlan | undefined {
  return buildCorrectiveMonthlyPlan().find((month) => month.monthKey === monthKey);
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
