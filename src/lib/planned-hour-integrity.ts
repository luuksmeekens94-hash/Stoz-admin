export interface ReviewedForecastHourAuditInput {
  action: string;
  reason: string;
  actorUserId: string | null;
  createdAt: Date;
  beforeData: unknown;
  afterData: unknown;
}

export interface ReviewedForecastHourSourceInput {
  id: string;
  plannedDate: Date;
  executorName: string;
  plannedHours: number;
}

export interface ReviewedForecastHourReview {
  integrity: "VALID" | "INVALID";
  sourceReference: string | null;
  performedConfirmation: boolean;
  plannedDate: string | null;
  plannedExecutorName: string | null;
  plannedHours: number | null;
  auditHistory: Array<{
    action: string;
    reason: string;
    actor: string;
    createdAt: string;
  }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyText(value: unknown): value is string {
  return typeof value === "string" && Boolean(value.trim());
}

function validEvidenceFromAudit(audit: ReviewedForecastHourAuditInput) {
  if (!isRecord(audit.afterData) || audit.afterData.performedConfirmation !== true) return null;
  const sourceReference = nonEmptyText(audit.afterData.sourceReference)
    ? audit.afterData.sourceReference.trim()
    : audit.reason.trim();
  return sourceReference.length >= 20 ? sourceReference : null;
}

export function buildReviewedForecastHourReview(input: {
  sourceForecastEntryId: string;
  sourceForecast: ReviewedForecastHourSourceInput | null;
  audits: ReviewedForecastHourAuditInput[];
  actorNameById: Map<string, string>;
}): ReviewedForecastHourReview {
  const auditHistory = [...input.audits]
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((audit) => ({
      action: audit.action,
      reason: audit.reason,
      actor: audit.actorUserId
        ? input.actorNameById.get(audit.actorUserId) || audit.actorUserId
        : "Systeem",
      createdAt: audit.createdAt.toISOString(),
    }));
  const invalid = (): ReviewedForecastHourReview => ({
    integrity: "INVALID",
    sourceReference: null,
    performedConfirmation: false,
    plannedDate: null,
    plannedExecutorName: null,
    plannedHours: null,
    auditHistory,
  });

  if (!input.sourceForecast) return invalid();
  const creationAudits = input.audits.filter(
    (audit) => audit.action === "MATERIALIZED_REVIEWED_FORECAST",
  );
  if (creationAudits.length !== 1) return invalid();
  const creation = creationAudits[0];
  if (!isRecord(creation.beforeData) || !isRecord(creation.afterData)) return invalid();
  if (
    creation.beforeData.sourceForecastEntryId !== input.sourceForecastEntryId ||
    creation.afterData.performedConfirmation !== true ||
    !nonEmptyText(creation.beforeData.plannedDate) ||
    !nonEmptyText(creation.beforeData.plannedExecutorName) ||
    typeof creation.beforeData.plannedHours !== "number" ||
    !Number.isFinite(creation.beforeData.plannedHours) ||
    creation.beforeData.plannedHours <= 0
  ) {
    return invalid();
  }

  const sourceDate = input.sourceForecast.plannedDate.toISOString().slice(0, 10);
  if (
    creation.beforeData.plannedDate !== sourceDate ||
    creation.beforeData.plannedExecutorName !== input.sourceForecast.executorName ||
    creation.beforeData.plannedHours !== input.sourceForecast.plannedHours
  ) {
    return invalid();
  }

  let sourceReference = validEvidenceFromAudit(creation);
  if (!sourceReference) return invalid();
  for (const audit of [...input.audits].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
    if (
      audit.action === "CORRECTED_REVIEWED_FORECAST_HOUR" ||
      audit.action === "CORRECTED_APPROVED_REVIEWED_FORECAST_HOUR"
    ) {
      const correctedEvidence = validEvidenceFromAudit(audit);
      if (!correctedEvidence) return invalid();
      sourceReference = correctedEvidence;
    }
  }

  return {
    integrity: "VALID",
    sourceReference,
    performedConfirmation: true,
    plannedDate: sourceDate,
    plannedExecutorName: input.sourceForecast.executorName,
    plannedHours: input.sourceForecast.plannedHours,
    auditHistory,
  };
}
