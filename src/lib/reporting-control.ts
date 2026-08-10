export type MonthlyControlState = "PAST" | "CURRENT" | "FUTURE";

function assertIsoDateKey(value: string, label: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${label} heeft geen geldige peildatum.`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error(`${label} heeft geen geldige peildatum.`);
  }
}

export function reportCutoffEnd(asOf: string) {
  assertIsoDateKey(asOf, "Rapportage");
  return new Date(`${asOf}T23:59:59.999Z`);
}

export function isWithinReportCutoff(value: Date, asOf: string) {
  return value.getTime() <= reportCutoffEnd(asOf).getTime();
}

export function resolveReportExportAsOf(input: {
  requestedAsOf: string | null;
  today: string;
  periodEnd: string;
}) {
  assertIsoDateKey(input.periodEnd, "Verslagperiode");
  assertIsoDateKey(input.today, "Vandaag");
  const latestAllowed = input.today <= input.periodEnd ? input.today : input.periodEnd;
  if (!input.requestedAsOf) return latestAllowed;
  assertIsoDateKey(input.requestedAsOf, "Export");
  return input.requestedAsOf <= latestAllowed ? input.requestedAsOf : latestAllowed;
}

export function amsterdamDateKey(date = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

interface MonthlyControlAction {
  id: string;
  title: string;
  periodStart: string;
  periodEnd: string;
  deliverable: string;
  evidenceNeeded: readonly string[];
}

export function resolveReportAsOf(input: { today: string; periodEnd: string }) {
  return input.today <= input.periodEnd ? input.today : input.periodEnd;
}

function roundHours(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function buildMonthlyControl(input: {
  monthKey: string;
  currentMonth: string;
  asOfDate: string;
  plannedHours: number;
  approvedActualHours: number;
  actions: readonly MonthlyControlAction[];
}) {
  const state: MonthlyControlState =
    input.monthKey < input.currentMonth
      ? "PAST"
      : input.monthKey === input.currentMonth
        ? "CURRENT"
        : "FUTURE";
  const guidance =
    state === "PAST"
      ? "Verklaar het verschil op basis van aantoonbare uitvoering; vul ontbrekende uren niet achteraf in om de forecast passend te maken."
      : state === "CURRENT"
        ? "Bevestig wat daadwerkelijk is uitgevoerd, registreer alleen die inzet en leg bewijs of een afwijkingsverklaring vast."
        : "Zorg dat activiteiten, uitvoerders en bewijs vooraf zijn voorbereid; deze uren blijven forecast totdat uitvoering is bevestigd.";

  return {
    monthKey: input.monthKey,
    asOfDate: input.asOfDate,
    state,
    plannedHours: roundHours(input.plannedHours),
    approvedActualHours: roundHours(input.approvedActualHours),
    varianceHours: roundHours(input.approvedActualHours - input.plannedHours),
    guidance,
    actions: input.actions.filter(
      (action) =>
        action.periodStart.slice(0, 7) <= input.monthKey &&
        action.periodEnd.slice(0, 7) >= input.monthKey,
    ),
  };
}
