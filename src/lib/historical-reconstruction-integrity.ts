import { createHash } from "node:crypto";
import type { HistoricalReconstructionSourceType } from "@/lib/hour-reconstruction";

export class HistoricalReconstructionIntegrityError extends Error {}

export interface HistoricalReconstructionPayload {
  requestId: string;
  asOf: string;
  date: string;
  hours: number;
  description: string;
  userId: string;
  therapistId: string | null;
  workPackageId: string;
  activityId: string;
  targetHours: number;
  sourceType: HistoricalReconstructionSourceType;
  sourceReference: string;
  performedConfirmation: boolean;
}

export interface HistoricalReconstructionProvenance {
  requestId: string;
  requestFingerprint: string;
  asOf: string;
  confirmedTargetHours: number;
  sourceType: HistoricalReconstructionSourceType;
  sourceReference: string;
  performedConfirmation: true;
  snapshot: {
    date: string;
    hours: number;
    description: string;
    userId: string;
    therapistId: string | null;
    workPackageId: string;
    activityId: string;
  };
}

export interface HistoricalReconstructionEntryLike {
  id: string;
  date: Date;
  hours: number;
  description: string;
  userId: string;
  therapistId: string | null;
  workPackageId: string;
  activityId: string;
  status: string;
}

const ALLOWED_FIELDS = new Set([
  "requestId",
  "asOf",
  "date",
  "hours",
  "description",
  "userId",
  "therapistId",
  "workPackageId",
  "activityId",
  "targetHours",
  "sourceType",
  "sourceReference",
  "performedConfirmation",
]);
const SOURCE_TYPES = new Set<HistoricalReconstructionSourceType>([
  "DOCUMENTED_SOURCE",
  "MIXED_DOCUMENTATION",
  "PROJECT_OWNER_RECONSTRUCTION",
]);
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_RECONSTRUCTION_STATUSES = new Set(["DRAFT", "SUBMITTED", "APPROVED", "REJECTED"]);

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HistoricalReconstructionIntegrityError(`${label} moet een object zijn.`);
  }
  return value as Record<string, unknown>;
}

function exactString(
  value: unknown,
  label: string,
  options: { min?: number; max?: number } = {},
) {
  if (typeof value !== "string") {
    throw new HistoricalReconstructionIntegrityError(`${label} moet tekst zijn.`);
  }
  const normalized = value.trim();
  if (options.min !== undefined && normalized.length < options.min) {
    throw new HistoricalReconstructionIntegrityError(
      `${label} moet minimaal ${options.min} tekens bevatten.`,
    );
  }
  if (options.max !== undefined && normalized.length > options.max) {
    throw new HistoricalReconstructionIntegrityError(
      `${label} mag maximaal ${options.max} tekens bevatten.`,
    );
  }
  return normalized;
}

function exactNumber(value: unknown, label: string) {
  if (typeof value !== "number" && typeof value !== "string") {
    throw new HistoricalReconstructionIntegrityError(`${label} moet een getal zijn.`);
  }
  if (typeof value === "string" && value.trim() === "") {
    throw new HistoricalReconstructionIntegrityError(`${label} moet een getal zijn.`);
  }
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) {
    throw new HistoricalReconstructionIntegrityError(`${label} moet een geldig getal zijn.`);
  }
  return normalized;
}

function isoDate(value: unknown, label: string) {
  const dateKey = exactString(value, label);
  if (!ISO_DATE_PATTERN.test(dateKey)) {
    throw new HistoricalReconstructionIntegrityError(`${label} moet een geldige datum zijn.`);
  }
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== dateKey) {
    throw new HistoricalReconstructionIntegrityError(`${label} moet een geldige datum zijn.`);
  }
  return dateKey;
}

function sourceType(value: unknown) {
  if (typeof value !== "string" || !SOURCE_TYPES.has(value as HistoricalReconstructionSourceType)) {
    throw new HistoricalReconstructionIntegrityError("Kies een geldige bronsoort.");
  }
  return value as HistoricalReconstructionSourceType;
}

export function parseHistoricalReconstructionPayload(
  value: unknown,
): HistoricalReconstructionPayload {
  const input = asRecord(value, "Het reconstructierequest");
  const unknownFields = Object.keys(input).filter((key) => !ALLOWED_FIELDS.has(key));
  if (unknownFields.length > 0) {
    throw new HistoricalReconstructionIntegrityError(
      `Onbekend veld in reconstructierequest: ${unknownFields.join(", ")}.`,
    );
  }

  const requestId = exactString(input.requestId, "Request-id").toLowerCase();
  if (!UUID_PATTERN.test(requestId)) {
    throw new HistoricalReconstructionIntegrityError("Request-id moet een geldige UUID zijn.");
  }
  if (input.performedConfirmation !== true && input.performedConfirmation !== false) {
    throw new HistoricalReconstructionIntegrityError(
      "Uitvoeringsbevestiging moet een boolean zijn.",
    );
  }
  const therapistId =
    input.therapistId === null || input.therapistId === undefined
      ? null
      : exactString(input.therapistId, "Therapeut-id", { min: 1, max: 200 });

  return {
    requestId,
    asOf: isoDate(input.asOf, "Peildatum"),
    date: isoDate(input.date, "Uitvoeringsdatum"),
    hours: exactNumber(input.hours, "Concepturen"),
    description: exactString(input.description, "Omschrijving", { min: 10, max: 1_000 }),
    userId: exactString(input.userId, "Uitvoerder-id", { min: 1, max: 200 }),
    therapistId,
    workPackageId: exactString(input.workPackageId, "Werkpakket-id", { min: 1, max: 200 }),
    activityId: exactString(input.activityId, "Activiteit-id", { min: 1, max: 200 }),
    targetHours: exactNumber(input.targetHours, "Doelstand"),
    sourceType: sourceType(input.sourceType),
    sourceReference: exactString(input.sourceReference, "Brononderbouwing", {
      min: 20,
      max: 2_000,
    }),
    performedConfirmation: input.performedConfirmation,
  };
}

export function buildHistoricalReconstructionEntryId(actorUserId: string, requestId: string) {
  const digest = createHash("sha256")
    .update(`${actorUserId}\u0000${requestId}`, "utf8")
    .digest("hex");
  return `hr_${digest.slice(0, 40)}`;
}

export function buildHistoricalReconstructionRequestFingerprint(
  input: HistoricalReconstructionPayload,
) {
  const canonical = JSON.stringify([
    input.requestId,
    input.asOf,
    input.date,
    input.hours,
    input.description,
    input.userId,
    input.therapistId,
    input.workPackageId,
    input.activityId,
    input.targetHours,
    input.sourceType,
    input.sourceReference,
    input.performedConfirmation,
  ]);
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export function parseHistoricalReconstructionProvenance(audit: {
  reason: string | null;
  beforeData: unknown;
  afterData: unknown;
}): HistoricalReconstructionProvenance {
  const before = asRecord(audit.beforeData, "Reconstructieprovenance vóór creatie");
  const after = asRecord(audit.afterData, "Reconstructieprovenance na creatie");
  if (before.performedConfirmation !== true) {
    throw new HistoricalReconstructionIntegrityError(
      "De reconstructieprovenance bevat geen uitvoeringsbevestiging.",
    );
  }
  const status = exactString(after.status, "Oorspronkelijke status");
  if (status !== "DRAFT") {
    throw new HistoricalReconstructionIntegrityError(
      "De reconstructieprovenance bevat geen oorspronkelijke conceptstatus.",
    );
  }

  return {
    requestId: exactString(after.requestId, "Request-id"),
    requestFingerprint: exactString(after.requestFingerprint, "Request-fingerprint"),
    asOf: isoDate(before.asOf, "Bevestigde peildatum"),
    confirmedTargetHours: exactNumber(before.confirmedTargetHours, "Bevestigde doelstand"),
    sourceType: sourceType(before.sourceType),
    sourceReference: exactString(audit.reason, "Brononderbouwing", { min: 20, max: 2_000 }),
    performedConfirmation: true,
    snapshot: {
      date: isoDate(after.date, "Oorspronkelijke uitvoeringsdatum"),
      hours: exactNumber(after.hours, "Oorspronkelijke uren"),
      description: exactString(after.description, "Oorspronkelijke omschrijving", {
        min: 10,
        max: 1_000,
      }),
      userId: exactString(after.userId, "Oorspronkelijke uitvoerder-id", { min: 1 }),
      therapistId:
        after.therapistId === null
          ? null
          : exactString(after.therapistId, "Oorspronkelijke therapeut-id", { min: 1 }),
      workPackageId: exactString(after.workPackageId, "Oorspronkelijk werkpakket-id", { min: 1 }),
      activityId: exactString(after.activityId, "Oorspronkelijke activiteit-id", { min: 1 }),
    },
  };
}

export function validateHistoricalReconstructionIntegrity(input: {
  entry: HistoricalReconstructionEntryLike;
  provenance: HistoricalReconstructionProvenance;
  registeredHours: number;
  enforceTarget?: boolean;
}) {
  const { entry, provenance } = input;
  const currentSnapshot = {
    date: entry.date.toISOString().slice(0, 10),
    hours: entry.hours,
    description: entry.description,
    userId: entry.userId,
    therapistId: entry.therapistId,
    workPackageId: entry.workPackageId,
    activityId: entry.activityId,
  };
  if (JSON.stringify(currentSnapshot) !== JSON.stringify(provenance.snapshot)) {
    throw new HistoricalReconstructionIntegrityError(
      "De reconstructieregel wijkt af van de vastgelegde creatieprovenance.",
    );
  }
  if (!ALLOWED_RECONSTRUCTION_STATUSES.has(entry.status)) {
    throw new HistoricalReconstructionIntegrityError(
      "De reconstructieregel heeft een ongeldige status.",
    );
  }
  if (!Number.isFinite(input.registeredHours)) {
    throw new HistoricalReconstructionIntegrityError(
      "De actuele scope-uren konden niet betrouwbaar worden vastgesteld.",
    );
  }
  if (
    input.enforceTarget !== false &&
    input.registeredHours > provenance.confirmedTargetHours + 0.0001
  ) {
    throw new HistoricalReconstructionIntegrityError(
      "De actuele geregistreerde uren overschrijden de bevestigde doelstand.",
    );
  }

  const expectedFingerprint = buildHistoricalReconstructionRequestFingerprint({
    requestId: provenance.requestId,
    asOf: provenance.asOf,
    date: provenance.snapshot.date,
    hours: provenance.snapshot.hours,
    description: provenance.snapshot.description,
    userId: provenance.snapshot.userId,
    therapistId: provenance.snapshot.therapistId,
    workPackageId: provenance.snapshot.workPackageId,
    activityId: provenance.snapshot.activityId,
    targetHours: provenance.confirmedTargetHours,
    sourceType: provenance.sourceType,
    sourceReference: provenance.sourceReference,
    performedConfirmation: true,
  });
  if (expectedFingerprint !== provenance.requestFingerprint) {
    throw new HistoricalReconstructionIntegrityError(
      "De reconstructieprovenance heeft een ongeldige request-fingerprint.",
    );
  }
}
