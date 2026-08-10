import {
  PROJECT_END_DATE,
  PROJECT_START_DATE,
  parseHourInput,
  parseProjectDateInput,
} from "@/lib/hour-entry-validation";

export interface CorrectableHourEntry {
  id: string;
  date: Date;
  hours: number;
  description: string;
  workPackageId: string;
  activityId: string;
  therapistId: string | null;
}

export interface ApprovedHourCorrectionInput {
  date?: string;
  hours?: number | string;
  description?: string;
  workPackageId?: string;
  activityId?: string;
  therapistId?: string | null;
  correctionReason: string;
}

export interface HourCorrectionSnapshot {
  date: string;
  hours: number;
  description: string;
  workPackageId: string;
  activityId: string;
  therapistId: string | null;
}


function dateKey(value: Date | string): string {
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

function snapshot(entry: CorrectableHourEntry): HourCorrectionSnapshot {
  return {
    date: dateKey(entry.date),
    hours: entry.hours,
    description: entry.description,
    workPackageId: entry.workPackageId,
    activityId: entry.activityId,
    therapistId: entry.therapistId,
  };
}

export function buildApprovedHourCorrection(
  current: CorrectableHourEntry,
  input: ApprovedHourCorrectionInput
) {
  const reason = input.correctionReason?.trim() ?? "";
  if (reason.length < 15) {
    throw new Error("Geef een concrete correctiereden van minimaal 15 tekens.");
  }

  const before = snapshot(current);
  const after: HourCorrectionSnapshot = { ...before };

  if (input.date !== undefined) {
    const { dateKey: nextDate } = parseProjectDateInput(input.date);
    if (nextDate < PROJECT_START_DATE || nextDate > PROJECT_END_DATE) {
      throw new Error("Datum valt buiten de formele projectperiode.");
    }
    after.date = nextDate;
  }

  if (input.hours !== undefined) {
    const parsedHours = parseHourInput(input.hours);
    if (parsedHours <= 0 || parsedHours > 24) {
      throw new Error("Uren moet groter dan 0 en maximaal 24 zijn.");
    }
    if (Math.round(parsedHours * 4) !== parsedHours * 4) {
      throw new Error("Uren moet in kwartieren worden geregistreerd.");
    }
    after.hours = parsedHours;
  }

  if (input.description !== undefined) {
    const description = input.description.trim();
    if (description.length < 5) {
      throw new Error("Geef een herleidbare omschrijving van de werkzaamheden.");
    }
    after.description = description;
  }

  if (input.workPackageId !== undefined) after.workPackageId = input.workPackageId;
  if (input.activityId !== undefined) after.activityId = input.activityId;
  if (input.therapistId !== undefined) after.therapistId = input.therapistId || null;

  const changedFields = (Object.keys(before) as Array<keyof HourCorrectionSnapshot>).filter(
    (field) => before[field] !== after[field]
  );

  if (changedFields.length === 0) {
    throw new Error("De correctie bevat geen wijziging.");
  }

  return {
    entityId: current.id,
    before,
    after,
    changedFields,
    reason,
  };
}
