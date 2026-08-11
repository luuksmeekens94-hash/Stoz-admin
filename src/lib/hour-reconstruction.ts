export class HistoricalReconstructionError extends Error {}

export type HistoricalReconstructionState =
  | "MISSING_REGISTRATION"
  | "ALIGNED"
  | "REVIEW_EXISTING";

export type HistoricalReconstructionSourceType =
  | "DOCUMENTED_SOURCE"
  | "MIXED_DOCUMENTATION"
  | "PROJECT_OWNER_RECONSTRUCTION";

export interface HistoricalReconstructionComparison {
  registeredHours: number;
  targetHours: number;
  differenceHours: number;
  state: HistoricalReconstructionState;
}

export function buildHistoricalReconstructionScope(input: {
  userId: string;
  therapistId: string | null;
  workPackageId: string;
  activityId: string;
  asOf: Date;
}) {
  return {
    userId: input.userId,
    therapistId: input.therapistId,
    workPackageId: input.workPackageId,
    activityId: input.activityId,
    date: { lte: input.asOf },
  };
}

export function buildHistoricalReconstructionComparison(input: {
  registeredHours: number;
  targetHours: number;
}): HistoricalReconstructionComparison {
  const differenceHours = Math.round((input.targetHours - input.registeredHours) * 100) / 100;
  return {
    registeredHours: input.registeredHours,
    targetHours: input.targetHours,
    differenceHours,
    state:
      differenceHours > 0
        ? "MISSING_REGISTRATION"
        : differenceHours < 0
          ? "REVIEW_EXISTING"
          : "ALIGNED",
  };
}

const HISTORICAL_RECONSTRUCTION_SOURCE_TYPES = new Set<HistoricalReconstructionSourceType>([
  "DOCUMENTED_SOURCE",
  "MIXED_DOCUMENTATION",
  "PROJECT_OWNER_RECONSTRUCTION",
]);

function assertFiniteQuarterHours(value: number, label: string, allowZero: boolean) {
  if (!Number.isFinite(value)) throw new HistoricalReconstructionError(`${label} moet een geldig getal zijn.`);
  if (value < 0 || (!allowZero && value === 0)) {
    throw new HistoricalReconstructionError(`${label} moet ${allowZero ? "nul of hoger" : "hoger dan nul"} zijn.`);
  }
  if (!Number.isInteger(value * 4)) throw new HistoricalReconstructionError(`${label} moet in kwartieren zijn opgegeven.`);
}

export function validateHistoricalReconstructionDraft(input: {
  registeredHours: number;
  targetHours: number;
  entryHours: number;
  description: string;
  sourceType: HistoricalReconstructionSourceType;
  sourceReference: string;
  performedConfirmation: boolean;
}) {
  if (!input.performedConfirmation) {
    throw new HistoricalReconstructionError("Bevestig dat de werkzaamheden daadwerkelijk vóór de peildatum zijn uitgevoerd.");
  }
  assertFiniteQuarterHours(input.registeredHours, "Geregistreerde uren", true);
  assertFiniteQuarterHours(input.targetHours, "De realistische doelstand", true);
  assertFiniteQuarterHours(input.entryHours, "De concepturen", false);
  if (input.entryHours > 24) throw new HistoricalReconstructionError("De concepturen mogen per registratie maximaal 24 uur zijn.");

  const description = input.description.trim();
  if (description.length < 10) {
    throw new HistoricalReconstructionError("Geef een herleidbare omschrijving van minimaal 10 tekens.");
  }
  if (!HISTORICAL_RECONSTRUCTION_SOURCE_TYPES.has(input.sourceType)) {
    throw new HistoricalReconstructionError("Kies een geldige bronsoort voor de reconstructie.");
  }
  const sourceReference = input.sourceReference.trim();
  if (sourceReference.length < 20) {
    throw new HistoricalReconstructionError("Geef een concrete bron of onderbouwing van minimaal 20 tekens.");
  }

  const comparison = buildHistoricalReconstructionComparison(input);
  if (comparison.state !== "MISSING_REGISTRATION") {
    throw new HistoricalReconstructionError("Er zijn volgens deze bevestigde stand geen ontbrekende uren om te reconstrueren.");
  }
  if (input.entryHours > comparison.differenceHours) {
    throw new HistoricalReconstructionError("De conceptregistratie is groter dan het resterende verschil.");
  }

  return {
    comparison,
    entryHours: input.entryHours,
    description,
    sourceType: input.sourceType,
    sourceReference,
    performedConfirmation: input.performedConfirmation,
  };
}
