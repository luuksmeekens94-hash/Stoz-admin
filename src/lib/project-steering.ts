export type HourStatus = "DRAFT" | "SUBMITTED" | "APPROVED";

export interface SteeringBudget {
  id: string;
  category: string;
  label: string;
  userId?: string | null;
  budgetHours: number;
  hourlyRate: number;
  expectedWorkPackageCodes?: string[];
}

export interface SteeringHour {
  id: string;
  userId: string;
  actorName: string;
  date: string;
  hours: number;
  status: HourStatus;
  workPackageCode: string;
  activityCode: string;
  activityName: string;
}

export interface WorkPackagePhase {
  code: string;
  name: string;
  start: string;
  end: string;
  filedWorkDescription: string;
}

export interface SteeringInput {
  asOf: string;
  reportDate: string;
  projectStart: string;
  projectEnd: string;
  reportReferenceShare: number;
  budgets: SteeringBudget[];
  hours: SteeringHour[];
  categoryUserIds?: Record<string, string>;
  workPackagePhases: WorkPackagePhase[];
}

export type ParticipantSignal =
  | "WITHIN_BUDGET"
  | "OVER_BUDGET"
  | "CHECK_CLASSIFICATION"
  | "NO_REPORTABLE_HOURS"
  | "UNMAPPED";

export type WorkPackageSignal =
  | "UPCOMING"
  | "ACTIVE"
  | "PHASE_ENDED"
  | "CHECK_CLASSIFICATION"
  | "MISSING_REGISTRATION";

export interface ParticipantSteeringRow extends SteeringBudget {
  userId: string | null;
  reportableHours: number;
  unapprovedPastHours: number;
  futureHours: number;
  referenceHours: number;
  referenceVarianceHours: number;
  remainingReportableHours: number;
  questionableWorkPackageHours: number;
  signal: ParticipantSignal;
}

export interface ActorSteeringRow {
  userId: string;
  name: string;
  budgetCategory: string | null;
  reportableHours: number;
  unapprovedPastHours: number;
  futureHours: number;
  questionableWorkPackageHours: number;
  workPackages: Array<{
    code: string;
    reportableHours: number;
    unapprovedPastHours: number;
    futureHours: number;
  }>;
}

export interface ActivitySteeringRow {
  code: string;
  name: string;
  workPackageCode: string;
  reportableHours: number;
  unapprovedPastHours: number;
  futureHours: number;
}

export interface WorkPackageSteeringRow extends WorkPackagePhase {
  reportableHours: number;
  unapprovedPastHours: number;
  futureHours: number;
  outsidePhaseHours: number;
  futureOutsidePhaseHours: number;
  signal: WorkPackageSignal;
}

const DAY_MS = 86_400_000;

function startOfUtcDay(value: string): Date {
  return new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
}

function endOfUtcDay(value: string): Date {
  return new Date(`${value.slice(0, 10)}T23:59:59.999Z`);
}

function rowDate(value: string): Date {
  return new Date(`${value.slice(0, 10)}T12:00:00.000Z`);
}

function roundHours(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function sumHours(rows: SteeringHour[]): number {
  return roundHours(rows.reduce((sum, row) => sum + row.hours, 0));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isOutsidePhase(row: SteeringHour, phase: WorkPackagePhase): boolean {
  const date = rowDate(row.date);
  return date < startOfUtcDay(phase.start) || date > endOfUtcDay(phase.end);
}

export function buildProjectSteeringModel(input: SteeringInput) {
  const asOf = endOfUtcDay(input.asOf);
  const reportDate = endOfUtcDay(input.reportDate);
  const projectStart = startOfUtcDay(input.projectStart);
  const projectEnd = endOfUtcDay(input.projectEnd);

  const pastRows = input.hours.filter((row) => rowDate(row.date) <= asOf);
  const reportableRows = pastRows.filter((row) => row.status === "APPROVED");
  const unapprovedPastRows = pastRows.filter((row) => row.status !== "APPROVED");
  const futureRows = input.hours.filter((row) => rowDate(row.date) > asOf);
  const futureToReportRows = futureRows.filter((row) => rowDate(row.date) <= reportDate);

  const budgetHours = roundHours(input.budgets.reduce((sum, row) => sum + row.budgetHours, 0));
  const financialBudgetHours = roundHours(
    input.budgets.filter((row) => row.hourlyRate > 0).reduce((sum, row) => sum + row.budgetHours, 0),
  );
  const inKindBudgetHours = roundHours(budgetHours - financialBudgetHours);
  const reportableHours = sumHours(reportableRows);
  const unapprovedPastHours = sumHours(unapprovedPastRows);
  const futureHours = sumHours(futureRows);
  const referenceHours = roundHours(budgetHours * input.reportReferenceShare);

  const projectDays = Math.max(1, (projectEnd.getTime() - projectStart.getTime()) / DAY_MS);
  const elapsedDays = clamp((asOf.getTime() - projectStart.getTime()) / DAY_MS, 0, projectDays);
  const elapsedShare = elapsedDays / projectDays;
  const historicalPaceProjection =
    elapsedShare > 0 ? roundHours(reportableHours / elapsedShare) : 0;

  const recentWindowStart = new Date(asOf.getTime() - 90 * DAY_MS);
  const recentRows = reportableRows.filter((row) => rowDate(row.date) >= recentWindowStart);
  const recentWindowHours = sumHours(recentRows);
  const recentMonthlyHours = roundHours((recentWindowHours / 90) * 30.4375);

  const participants: ParticipantSteeringRow[] = input.budgets.map((budget) => {
    const mappedUserId = budget.userId || input.categoryUserIds?.[budget.category] || null;
    const participantReportableRows = mappedUserId
      ? reportableRows.filter((row) => row.userId === mappedUserId)
      : [];
    const participantUnapprovedRows = mappedUserId
      ? unapprovedPastRows.filter((row) => row.userId === mappedUserId)
      : [];
    const participantFutureRows = mappedUserId
      ? futureRows.filter((row) => row.userId === mappedUserId)
      : [];
    const expected = budget.expectedWorkPackageCodes || [];
    const questionableRows =
      expected.length > 0
        ? participantReportableRows.filter((row) => !expected.includes(row.workPackageCode))
        : [];

    const participantReportable = sumHours(participantReportableRows);
    const participantUnapproved = sumHours(participantUnapprovedRows);
    const participantFuture = sumHours(participantFutureRows);
    const participantReference = roundHours(budget.budgetHours * input.reportReferenceShare);
    const questionableWorkPackageHours = sumHours(questionableRows);

    let signal: ParticipantSignal = "WITHIN_BUDGET";
    if (!mappedUserId) signal = "UNMAPPED";
    else if (participantReportable > budget.budgetHours) signal = "OVER_BUDGET";
    else if (questionableWorkPackageHours > 0) signal = "CHECK_CLASSIFICATION";
    else if (participantReportable === 0) signal = "NO_REPORTABLE_HOURS";

    return {
      ...budget,
      userId: mappedUserId,
      reportableHours: participantReportable,
      unapprovedPastHours: participantUnapproved,
      futureHours: participantFuture,
      referenceHours: participantReference,
      referenceVarianceHours: roundHours(participantReportable - participantReference),
      remainingReportableHours: roundHours(budget.budgetHours - participantReportable),
      questionableWorkPackageHours,
      signal,
    };
  });

  const categoriesByUserId = new Map<
    string,
    { categories: Set<string>; expectedWorkPackages: Set<string> }
  >();
  for (const participant of participants) {
    if (!participant.userId) continue;
    const existing = categoriesByUserId.get(participant.userId) || {
      categories: new Set<string>(),
      expectedWorkPackages: new Set<string>(),
    };
    existing.categories.add(participant.category);
    for (const code of participant.expectedWorkPackageCodes || []) {
      existing.expectedWorkPackages.add(code);
    }
    categoriesByUserId.set(participant.userId, existing);
  }

  type ActorAccumulator = {
    userId: string;
    name: string;
    reportableHours: number;
    unapprovedPastHours: number;
    futureHours: number;
    questionableWorkPackageHours: number;
    workPackages: Map<
      string,
      { reportableHours: number; unapprovedPastHours: number; futureHours: number }
    >;
  };
  const actorMap = new Map<string, ActorAccumulator>();

  const addActorHours = (
    row: SteeringHour,
    kind: "reportable" | "unapproved" | "future",
  ) => {
    const key = `${row.userId}::${row.actorName}`;
    const actor = actorMap.get(key) || {
      userId: row.userId,
      name: row.actorName,
      reportableHours: 0,
      unapprovedPastHours: 0,
      futureHours: 0,
      questionableWorkPackageHours: 0,
      workPackages: new Map(),
    };
    const workPackage = actor.workPackages.get(row.workPackageCode) || {
      reportableHours: 0,
      unapprovedPastHours: 0,
      futureHours: 0,
    };

    if (kind === "reportable") {
      actor.reportableHours += row.hours;
      workPackage.reportableHours += row.hours;
      const expected = categoriesByUserId.get(row.userId)?.expectedWorkPackages;
      if (expected && expected.size > 0 && !expected.has(row.workPackageCode)) {
        actor.questionableWorkPackageHours += row.hours;
      }
    } else if (kind === "unapproved") {
      actor.unapprovedPastHours += row.hours;
      workPackage.unapprovedPastHours += row.hours;
    } else {
      actor.futureHours += row.hours;
      workPackage.futureHours += row.hours;
    }

    actor.workPackages.set(row.workPackageCode, workPackage);
    actorMap.set(key, actor);
  };

  reportableRows.forEach((row) => addActorHours(row, "reportable"));
  unapprovedPastRows.forEach((row) => addActorHours(row, "unapproved"));
  futureRows.forEach((row) => addActorHours(row, "future"));

  const actors: ActorSteeringRow[] = Array.from(actorMap.values())
    .map((actor) => ({
      userId: actor.userId,
      name: actor.name,
      budgetCategory: categoriesByUserId.get(actor.userId)
        ? Array.from(categoriesByUserId.get(actor.userId)!.categories).join(", ")
        : null,
      reportableHours: roundHours(actor.reportableHours),
      unapprovedPastHours: roundHours(actor.unapprovedPastHours),
      futureHours: roundHours(actor.futureHours),
      questionableWorkPackageHours: roundHours(actor.questionableWorkPackageHours),
      workPackages: Array.from(actor.workPackages.entries())
        .map(([code, values]) => ({
          code,
          reportableHours: roundHours(values.reportableHours),
          unapprovedPastHours: roundHours(values.unapprovedPastHours),
          futureHours: roundHours(values.futureHours),
        }))
        .sort((a, b) => a.code.localeCompare(b.code, "nl")),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "nl"));

  const activityMap = new Map<string, ActivitySteeringRow>();
  const addActivityHours = (
    row: SteeringHour,
    kind: "reportable" | "unapproved" | "future",
  ) => {
    const activity = activityMap.get(row.activityCode) || {
      code: row.activityCode,
      name: row.activityName,
      workPackageCode: row.workPackageCode,
      reportableHours: 0,
      unapprovedPastHours: 0,
      futureHours: 0,
    };
    if (kind === "reportable") activity.reportableHours += row.hours;
    else if (kind === "unapproved") activity.unapprovedPastHours += row.hours;
    else activity.futureHours += row.hours;
    activityMap.set(row.activityCode, activity);
  };
  reportableRows.forEach((row) => addActivityHours(row, "reportable"));
  unapprovedPastRows.forEach((row) => addActivityHours(row, "unapproved"));
  futureRows.forEach((row) => addActivityHours(row, "future"));

  const activities = Array.from(activityMap.values())
    .map((activity) => ({
      ...activity,
      reportableHours: roundHours(activity.reportableHours),
      unapprovedPastHours: roundHours(activity.unapprovedPastHours),
      futureHours: roundHours(activity.futureHours),
    }))
    .sort((a, b) => a.code.localeCompare(b.code, "nl", { numeric: true }));

  const workPackages: WorkPackageSteeringRow[] = input.workPackagePhases.map((phase) => {
    const phaseStart = startOfUtcDay(phase.start);
    const phaseEnd = endOfUtcDay(phase.end);
    const reportableForPackage = reportableRows.filter(
      (row) => row.workPackageCode === phase.code,
    );
    const unapprovedForPackage = unapprovedPastRows.filter(
      (row) => row.workPackageCode === phase.code,
    );
    const futureForPackage = futureRows.filter((row) => row.workPackageCode === phase.code);
    const outsideRows = reportableForPackage.filter((row) => isOutsidePhase(row, phase));
    const futureOutsideRows = futureForPackage.filter((row) => isOutsidePhase(row, phase));

    const reportable = sumHours(reportableForPackage);
    const unapproved = sumHours(unapprovedForPackage);
    const future = sumHours(futureForPackage);
    const outside = sumHours(outsideRows);
    const futureOutside = sumHours(futureOutsideRows);

    let signal: WorkPackageSignal;
    if (asOf < phaseStart) signal = "UPCOMING";
    else if (reportable === 0 && unapproved === 0) signal = "MISSING_REGISTRATION";
    else if (asOf > phaseEnd) signal = "PHASE_ENDED";
    else signal = "ACTIVE";

    if (outside > 0 || futureOutside > 0) signal = "CHECK_CLASSIFICATION";

    return {
      ...phase,
      reportableHours: reportable,
      unapprovedPastHours: unapproved,
      futureHours: future,
      outsidePhaseHours: outside,
      futureOutsidePhaseHours: futureOutside,
      signal,
    };
  });

  const financialReportableHours = roundHours(
    participants
      .filter((row) => row.hourlyRate > 0)
      .reduce((sum, row) => sum + row.reportableHours, 0),
  );
  const remainingFinancialHours = roundHours(financialBudgetHours - financialReportableHours);

  return {
    totals: {
      budgetHours,
      financialBudgetHours,
      inKindBudgetHours,
      reportableHours,
      unapprovedPastHours,
      futureHours,
      referenceHours,
      referenceVarianceHours: roundHours(reportableHours - referenceHours),
      financialReportableHours,
      remainingFinancialHours,
      elapsedShare,
      historicalPaceProjection,
      recentWindowHours,
      recentMonthlyHours,
    },
    participants,
    actors,
    activities,
    workPackages,
    dataQuality: {
      futureEntryCount: futureRows.length,
      futureHours,
      futureToReportEntryCount: futureToReportRows.length,
      futureToReportHours: sumHours(futureToReportRows),
      unapprovedPastEntryCount: unapprovedPastRows.length,
      unapprovedPastHours,
    },
    assumptions: {
      linearReferenceIsApprovedTarget: false,
      linearReferenceShare: input.reportReferenceShare,
      note:
        "De 50%-lijn is alleen een lineaire stuurreferentie. De goedgekeurde begroting bevat geen tijdgefaseerd urenbudget per rol of werkpakket.",
    },
  };
}
