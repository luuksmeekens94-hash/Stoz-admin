export const PROJECT_START_DATE = "2025-09-01";
export const PROJECT_END_DATE = "2027-08-31";

export class HourInputError extends Error {}

export function parseProjectDateInput(value: unknown) {
  const dateKey = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    throw new HourInputError("Datum heeft geen geldig formaat (JJJJ-MM-DD).");
  }
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== dateKey) {
    throw new HourInputError("Datum is ongeldig.");
  }
  return { date, dateKey };
}

export function parseHourInput(value: unknown) {
  if (typeof value === "string" && value.trim() === "") {
    throw new HourInputError("Uren moet een geldig getal zijn.");
  }
  const hours = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(hours)) throw new HourInputError("Uren moet een geldig getal zijn.");
  return hours;
}

export function validateHourEntryDraft(input: {
  dateKey: string;
  now: Date;
  hours: number;
  workPackageId: string;
  activityWorkPackageId: string;
}) {
  const { date } = parseProjectDateInput(input.dateKey);
  if (input.hours <= 0 || input.hours > 24) throw new HourInputError("Uren moeten tussen 0 en 24 liggen.");
  if (!Number.isInteger(input.hours * 4)) throw new HourInputError("Uren moeten in kwartieren worden geregistreerd.");
  if (input.workPackageId !== input.activityWorkPackageId) {
    throw new HourInputError("De activiteit hoort niet bij het gekozen werkpakket.");
  }

  const today = input.now.toISOString().slice(0, 10);
  if (input.dateKey > today) throw new HourInputError("Toekomstige uren kunnen niet als werkelijk werk worden geregistreerd.");
  if (input.dateKey < PROJECT_START_DATE || input.dateKey > PROJECT_END_DATE) {
    throw new HourInputError("Datum valt buiten de formele projectperiode.");
  }
  return date;
}
