import { describe, expect, it } from "vitest";
import {
  buildHistoricalReconstructionEntryId,
  buildHistoricalReconstructionRequestFingerprint,
  HistoricalReconstructionPayload,
  parseHistoricalReconstructionPayload,
  parseHistoricalReconstructionProvenance,
  validateHistoricalReconstructionIntegrity,
} from "@/lib/historical-reconstruction-integrity";
import { isAllowedHistoricalReconstructionTransition } from "@/lib/historical-reconstruction-db";

const payload = {
  requestId: "0f6af396-a6f8-4bb1-90dd-208a5ad94c85",
  asOf: "2026-08-10",
  date: "2026-06-18",
  hours: "2.25",
  description: "Uitwerking van begrijpelijke projectinstructie",
  userId: "user-1",
  therapistId: null,
  workPackageId: "wp2",
  activityId: "a2-2",
  targetHours: 18.25,
  sourceType: "DOCUMENTED_SOURCE",
  sourceReference: "Outlook-agenda 18 juni 2026 en opgeleverd instructieconcept.",
  performedConfirmation: true,
} as const;

const normalized: HistoricalReconstructionPayload = {
  ...payload,
  hours: 2.25,
  targetHours: 18.25,
};

describe("historische reconstructie-integriteit", () => {
  it("biedt een gecontroleerd herstelpad van goedgekeurd naar concept", () => {
    expect(isAllowedHistoricalReconstructionTransition("APPROVED", "DRAFT")).toBe(true);
    expect(isAllowedHistoricalReconstructionTransition("APPROVED", "SUBMITTED")).toBe(false);
  });

  it("accepteert alleen een exact getypeerd requestobject zonder overposting", () => {
    expect(parseHistoricalReconstructionPayload(payload)).toEqual(normalized);
    expect(() => parseHistoricalReconstructionPayload(null)).toThrow(/request|object/i);
    expect(() =>
      parseHistoricalReconstructionPayload({ ...payload, description: {} }),
    ).toThrow(/omschrijving|tekst/i);
    expect(() =>
      parseHistoricalReconstructionPayload({ ...payload, sourceReference: [{ agenda: true }] }),
    ).toThrow(/bron|tekst/i);
    expect(() =>
      parseHistoricalReconstructionPayload({ ...payload, approvedBy: "overpost" }),
    ).toThrow(/onbekend|veld/i);
    expect(() =>
      parseHistoricalReconstructionPayload({ ...payload, description: "x".repeat(1_001) }),
    ).toThrow(/maximaal/i);
    expect(() =>
      parseHistoricalReconstructionPayload({ ...payload, sourceReference: "x".repeat(2_001) }),
    ).toThrow(/maximaal/i);
  });

  it("maakt per beheerder en request-id één deterministische entry-id en bindt de payload aan een fingerprint", () => {
    expect(buildHistoricalReconstructionEntryId("admin-1", payload.requestId)).toBe(
      buildHistoricalReconstructionEntryId("admin-1", payload.requestId),
    );
    expect(buildHistoricalReconstructionEntryId("admin-1", payload.requestId)).not.toBe(
      buildHistoricalReconstructionEntryId("admin-2", payload.requestId),
    );

    const fingerprint = buildHistoricalReconstructionRequestFingerprint(normalized);
    expect(fingerprint).toBe(buildHistoricalReconstructionRequestFingerprint(normalized));
    expect(fingerprint).not.toBe(
      buildHistoricalReconstructionRequestFingerprint({ ...normalized, hours: 2.5 }),
    );

    const upperCaseUuid = parseHistoricalReconstructionPayload({
      ...payload,
      requestId: payload.requestId.toUpperCase(),
    });
    expect(upperCaseUuid.requestId).toBe(normalized.requestId);
    expect(buildHistoricalReconstructionEntryId("admin-1", upperCaseUuid.requestId)).toBe(
      buildHistoricalReconstructionEntryId("admin-1", normalized.requestId),
    );
    expect(buildHistoricalReconstructionRequestFingerprint(upperCaseUuid)).toBe(
      buildHistoricalReconstructionRequestFingerprint(normalized),
    );
  });

  it("leest de creatieprovenance en weigert iedere inhoudelijke afwijking of overschrijding", () => {
    const audit = {
      reason: normalized.sourceReference,
      beforeData: {
        asOf: normalized.asOf,
        confirmedTargetHours: normalized.targetHours,
        sourceType: normalized.sourceType,
        performedConfirmation: true,
      },
      afterData: {
        requestId: normalized.requestId,
        requestFingerprint: buildHistoricalReconstructionRequestFingerprint(normalized),
        date: normalized.date,
        hours: normalized.hours,
        description: normalized.description,
        status: "DRAFT",
        userId: normalized.userId,
        therapistId: normalized.therapistId,
        workPackageId: normalized.workPackageId,
        activityId: normalized.activityId,
      },
    };
    const provenance = parseHistoricalReconstructionProvenance(audit);
    const entry = {
      id: "entry-1",
      date: new Date(`${normalized.date}T00:00:00.000Z`),
      hours: normalized.hours,
      description: normalized.description,
      userId: normalized.userId,
      therapistId: normalized.therapistId,
      workPackageId: normalized.workPackageId,
      activityId: normalized.activityId,
      status: "DRAFT",
    };

    expect(() =>
      validateHistoricalReconstructionIntegrity({ entry, provenance, registeredHours: 18.25 }),
    ).not.toThrow();
    expect(() =>
      validateHistoricalReconstructionIntegrity({
        entry: { ...entry, hours: 4 },
        provenance,
        registeredHours: 18.25,
      }),
    ).toThrow(/afwijkt|creatie/i);
    expect(() =>
      validateHistoricalReconstructionIntegrity({
        entry,
        provenance,
        registeredHours: 18.5,
      }),
    ).toThrow(/doelstand|overschrijdt/i);
    expect(() =>
      validateHistoricalReconstructionIntegrity({
        entry,
        provenance,
        registeredHours: 18.5,
        enforceTarget: false,
      }),
    ).not.toThrow();
  });
});
