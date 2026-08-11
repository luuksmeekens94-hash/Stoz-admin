import type { HourEntry, Prisma } from "@prisma/client";
import { buildHistoricalReconstructionScope } from "@/lib/hour-reconstruction";
import { reportCutoffEnd } from "@/lib/reporting-control";
import {
  HistoricalReconstructionIntegrityError,
  parseHistoricalReconstructionProvenance,
  validateHistoricalReconstructionIntegrity,
} from "@/lib/historical-reconstruction-integrity";

export const HISTORICAL_RECONSTRUCTION_CREATE_ACTION =
  "CREATED_FROM_HISTORICAL_RECONSTRUCTION";

type HistoricalReconstructionStatus = "DRAFT" | "SUBMITTED" | "APPROVED";

export function isAllowedHistoricalReconstructionTransition(
  from: HistoricalReconstructionStatus,
  to: HistoricalReconstructionStatus,
) {
  return (
    (from === "DRAFT" && to === "SUBMITTED") ||
    (from === "SUBMITTED" && to === "APPROVED") ||
    (from === "SUBMITTED" && to === "DRAFT") ||
    (from === "APPROVED" && to === "DRAFT")
  );
}

export async function loadAndValidateHistoricalReconstruction(
  tx: Prisma.TransactionClient,
  entry: HourEntry,
  options: { enforceTarget?: boolean } = {},
) {
  const audit = await tx.auditEvent.findFirst({
    where: {
      entityType: "HourEntry",
      entityId: entry.id,
      action: HISTORICAL_RECONSTRUCTION_CREATE_ACTION,
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      reason: true,
      beforeData: true,
      afterData: true,
      actorUserId: true,
      createdAt: true,
    },
  });
  if (!audit) return null;

  const provenance = parseHistoricalReconstructionProvenance(audit);
  const aggregate = await tx.hourEntry.aggregate({
    where: buildHistoricalReconstructionScope({
      userId: entry.userId,
      therapistId: entry.therapistId,
      workPackageId: entry.workPackageId,
      activityId: entry.activityId,
      asOf: reportCutoffEnd(provenance.asOf),
    }),
    _sum: { hours: true },
  });
  const registeredHours = aggregate._sum.hours ?? 0;
  validateHistoricalReconstructionIntegrity({
    entry,
    provenance,
    registeredHours,
    enforceTarget: options.enforceTarget,
  });
  return { audit, provenance, registeredHours };
}

export interface HistoricalReconstructionScopeKey {
  userId: string;
  therapistId: string | null;
  workPackageId: string;
  activityId: string;
}

function scopeIdentity(scope: HistoricalReconstructionScopeKey) {
  return [
    scope.userId,
    scope.therapistId ?? "",
    scope.workPackageId,
    scope.activityId,
  ].join("\u0000");
}

async function loadHistoricalReconstructionEntriesForScopes(
  tx: Prisma.TransactionClient,
  scopes: HistoricalReconstructionScopeKey[],
) {
  const uniqueScopes = Array.from(
    new Map(scopes.map((scope) => [scopeIdentity(scope), scope])).values(),
  );
  if (uniqueScopes.length === 0) return [];
  const entries = await tx.hourEntry.findMany({
    where: {
      OR: uniqueScopes.map((scope) => ({
        userId: scope.userId,
        therapistId: scope.therapistId,
        workPackageId: scope.workPackageId,
        activityId: scope.activityId,
      })),
    },
  });
  if (entries.length === 0) return [];
  const audits = await tx.auditEvent.findMany({
    where: {
      entityType: "HourEntry",
      entityId: { in: entries.map((entry) => entry.id) },
      action: HISTORICAL_RECONSTRUCTION_CREATE_ACTION,
    },
    select: { entityId: true },
  });
  const reconstructionIds = new Set(audits.map((audit) => audit.entityId));
  return entries.filter((entry) => reconstructionIds.has(entry.id));
}

export async function assertNoOrdinaryEntryOverlapsHistoricalReconstruction(
  tx: Prisma.TransactionClient,
  proposedEntries: Array<HistoricalReconstructionScopeKey & { date: Date }>,
) {
  const reconstructionEntries = await loadHistoricalReconstructionEntriesForScopes(
    tx,
    proposedEntries,
  );
  for (const reconstructionEntry of reconstructionEntries) {
    const reconstruction = await loadAndValidateHistoricalReconstruction(
      tx,
      reconstructionEntry,
    );
    if (!reconstruction) continue;
    const overlaps = proposedEntries.some(
      (entry) =>
        scopeIdentity(entry) === scopeIdentity(reconstructionEntry) &&
        entry.date.toISOString().slice(0, 10) <= reconstruction.provenance.asOf,
    );
    if (overlaps) {
      throw new HistoricalReconstructionIntegrityError(
        "Deze uren vallen in een scope met historische reconstructieprovenance. Gebruik de auditbare reconstructie- of correctieroute.",
      );
    }
  }
}

export async function validateHistoricalReconstructionTargetsForScopes(
  tx: Prisma.TransactionClient,
  scopes: HistoricalReconstructionScopeKey[],
) {
  const reconstructionEntries = await loadHistoricalReconstructionEntriesForScopes(tx, scopes);
  for (const reconstructionEntry of reconstructionEntries) {
    const reconstruction = await loadAndValidateHistoricalReconstruction(tx, reconstructionEntry);
    if (!reconstruction) {
      throw new HistoricalReconstructionIntegrityError("De reconstructieprovenance ontbreekt.");
    }
  }
}

export function historicalReconstructionEntrySnapshot(entry: HourEntry) {
  return {
    date: entry.date.toISOString().slice(0, 10),
    hours: entry.hours,
    description: entry.description,
    status: entry.status,
    userId: entry.userId,
    therapistId: entry.therapistId,
    workPackageId: entry.workPackageId,
    activityId: entry.activityId,
    approvedAt: entry.approvedAt?.toISOString() || null,
    approvedBy: entry.approvedBy,
  };
}
