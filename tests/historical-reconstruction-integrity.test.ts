import { describe, expect, it, vi } from "vitest";
import {
  buildHistoricalReconstructionEntryId,
  buildHistoricalReconstructionRequestFingerprint,
  HistoricalReconstructionPayload,
  parseHistoricalReconstructionPayload,
  parseHistoricalReconstructionProvenance,
  validateHistoricalReconstructionIntegrity,
} from "@/lib/historical-reconstruction-integrity";
import {
  validateInterimProposalTarget,
  HISTORICAL_RECONSTRUCTION_CREATE_ACTIONS,
  isAllowedHistoricalReconstructionTransition,
  loadAndValidateHistoricalReconstruction,
} from "@/lib/historical-reconstruction-db";

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
  it("blokkeert goedkeuring als een gekoppeld voorstel functiebreed al boven doel staat", async () => {
    const findMany = vi.fn().mockResolvedValue([
      { userId: "manager-1" },
      { userId: "manager-2" },
    ]);
    const aggregate = vi.fn().mockResolvedValue({ _sum: { hours: 20.25 } });

    await expect(validateInterimProposalTarget(
      {
        interimHourProposal: {
          findUnique: vi.fn().mockResolvedValue({
            id: "proposal-1",
            budgetLineKey: "INTERNAL_TRAINER",
            workPackageId: "wp3",
            targetQuarters: 80,
            proposalSet: { asOf: new Date("2026-08-12T00:00:00.000Z") },
          }),
        },
        budgetAllocation: { findMany },
        hourEntry: { aggregate },
      } as never,
      { historicalProposalId: "proposal-1", userId: "manager-1" } as never,
    )).rejects.toThrow(/functie.*werkpakket.*doelstand/i);

    expect(aggregate).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        userId: { in: ["manager-1", "manager-2"] },
        workPackageId: "wp3",
      }),
    }));
  });

  it("biedt een gecontroleerd herstelpad van goedgekeurd naar concept", () => {
    expect(isAllowedHistoricalReconstructionTransition("APPROVED", "DRAFT")).toBe(true);
    expect(isAllowedHistoricalReconstructionTransition("APPROVED", "SUBMITTED")).toBe(false);
  });

  it("herkent zowel canonieke als bestaande legacy-creatieprovenance", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    await loadAndValidateHistoricalReconstruction(
      { auditEvent: { findFirst } } as never,
      { id: "entry-legacy" } as never,
    );

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          action: { in: [...HISTORICAL_RECONSTRUCTION_CREATE_ACTIONS] },
        }),
      }),
    );
    expect(HISTORICAL_RECONSTRUCTION_CREATE_ACTIONS).toEqual([
      "CREATED_FROM_HISTORICAL_RECONSTRUCTION",
      "CREATED_HISTORICAL_RECONSTRUCTION",
    ]);
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
