import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  transaction: vi.fn(),
  findProposal: vi.fn(),
  findUser: vi.fn(),
  findTherapist: vi.fn(),
  findEntry: vi.fn(),
  findAudit: vi.fn(),
  findAllocations: vi.fn(),
  aggregateHours: vi.fn(),
  createEntry: vi.fn(),
  createAudit: vi.fn(),
  findScopeEntries: vi.fn(),
  findScopeAudits: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/reporting-control", async (original) => ({
  ...(await original<typeof import("@/lib/reporting-control")>()),
  amsterdamDateKey: () => "2026-08-12",
}));
vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: mocks.transaction } }));

import { POST } from "@/app/api/hours/reconstruction/proposals/[proposalId]/entries/route";
import { buildHistoricalReconstructionRequestFingerprint } from "@/lib/historical-reconstruction-integrity";

const proposal = {
  id: "proposal-1",
  proposalSet: { asOf: new Date("2026-08-12T00:00:00.000Z"), sourceReference: "Gedelegeerde projecteigenaar-inschatting 12 augustus 2026." },
  budgetLineKey: "INTERNAL_TRAINER",
  title: "Interne opleider",
  workPackageId: "wp3",
  activityId: "a31",
  targetQuarters: 80,
  registeredBaselineQuarters: 8,
  proposedQuarters: 72,
  activity: { id: "a31", workPackageId: "wp3" },
};

const tx = {
  interimHourProposal: { findUnique: mocks.findProposal },
  user: { findFirst: mocks.findUser },
  therapist: { findFirst: mocks.findTherapist },
  budgetAllocation: { findMany: mocks.findAllocations },
  hourEntry: {
    findUnique: mocks.findEntry,
    findMany: mocks.findScopeEntries,
    aggregate: mocks.aggregateHours,
    create: mocks.createEntry,
  },
  auditEvent: {
    findFirst: mocks.findAudit,
    findMany: mocks.findScopeAudits,
    create: mocks.createAudit,
  },
};

function request(overrides: Record<string, unknown> = {}) {
  return new Request("http://localhost/api/hours/reconstruction/proposals/proposal-1/entries", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requestId: "123e4567-e89b-42d3-a456-426614174000",
      userId: "manager",
      therapistId: null,
      date: "2026-07-10",
      hours: 18,
      description: "Voorbereiding en uitvoering van de communicatietraining voor de praktijk.",
      sourceReference: "Outlook-agenda 10 juli 2026 en het opgeleverde trainingsmateriaal.",
      performedConfirmation: true,
      ...overrides,
    }),
  });
}

function call(requestValue = request()) {
  return POST(requestValue as never, { params: Promise.resolve({ proposalId: "proposal-1" }) });
}

describe("interim proposal materialisation route", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.findScopeEntries.mockResolvedValue([]);
    mocks.findScopeAudits.mockResolvedValue([]);
  });

  it("maakt één gekoppeld concept met audit na live-gapcontrole", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
    mocks.transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx));
    mocks.findProposal.mockResolvedValue(proposal);
    mocks.findEntry.mockResolvedValue(null);
    mocks.findUser.mockResolvedValue({
      id: "manager",
      role: "ADMIN",
      active: true,
      email: "manager@example.nl",
      budgetAllocations: [{ category: "Praktijkmanager" }],
    });
    mocks.findTherapist.mockResolvedValue(null);
    mocks.findAllocations.mockResolvedValue([{ userId: "manager" }]);
    mocks.aggregateHours
      .mockResolvedValueOnce({ _sum: { hours: 2 } })
      .mockResolvedValueOnce({ _sum: { hours: 2 } });
    mocks.createEntry.mockResolvedValue({ id: "entry-1", hours: 18, status: "DRAFT" });
    mocks.createAudit.mockResolvedValue({ id: "audit-1" });

    const response = await call();

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({ remainingHours: 0 });
    expect(mocks.createEntry).toHaveBeenCalledWith({
      data: expect.objectContaining({
        historicalProposalId: "proposal-1",
        status: "DRAFT",
        hours: 18,
      }),
      select: expect.any(Object),
    });
    expect(mocks.createAudit).toHaveBeenCalledOnce();
    expect(mocks.createAudit).toHaveBeenCalledWith({
      data: expect.objectContaining({
        beforeData: expect.objectContaining({
          confirmedTargetHours: 20,
          proposalTargetHours: 20,
        }),
      }),
    });
  });

  it("reserveert voor deelregels een stabiele actorgrens en hercontroleert sibling-reconstructies", async () => {
    const partialPayload = {
      requestId: "123e4567-e89b-42d3-a456-426614174000",
      asOf: "2026-08-12",
      date: "2026-07-10",
      hours: 5,
      description: "Voorbereiding en uitvoering van de communicatietraining voor de praktijk.",
      userId: "manager",
      therapistId: null,
      workPackageId: "wp3",
      activityId: "a31",
      targetHours: 12,
      sourceType: "PROJECT_OWNER_RECONSTRUCTION" as const,
      sourceReference: "Outlook-agenda 10 juli 2026 en het opgeleverde trainingsmateriaal.",
      performedConfirmation: true,
    };
    const partialAudit = {
      reason: partialPayload.sourceReference,
      beforeData: {
        asOf: partialPayload.asOf,
        confirmedTargetHours: partialPayload.targetHours,
        sourceType: partialPayload.sourceType,
        performedConfirmation: true,
      },
      afterData: {
        requestId: partialPayload.requestId,
        requestFingerprint: buildHistoricalReconstructionRequestFingerprint(partialPayload),
        date: partialPayload.date,
        hours: partialPayload.hours,
        description: partialPayload.description,
        status: "DRAFT",
        userId: partialPayload.userId,
        therapistId: partialPayload.therapistId,
        workPackageId: partialPayload.workPackageId,
        activityId: partialPayload.activityId,
      },
    };
    mocks.getSession.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
    mocks.transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx));
    mocks.findProposal.mockResolvedValue(proposal);
    mocks.findEntry.mockResolvedValue(null);
    mocks.findUser.mockResolvedValue({
      id: "manager",
      role: "ADMIN",
      active: true,
      email: "manager@example.nl",
      budgetAllocations: [{ category: "Praktijkmanager" }],
    });
    mocks.findTherapist.mockResolvedValue(null);
    mocks.findAllocations.mockResolvedValue([{ userId: "manager" }, { userId: "other-manager" }]);
    mocks.findAudit.mockResolvedValueOnce(null).mockResolvedValueOnce(partialAudit);
    mocks.findScopeEntries.mockResolvedValue([{
      id: "entry-1",
      date: new Date("2026-07-10T00:00:00.000Z"),
      hours: 5,
      description: partialPayload.description,
      userId: "manager",
      therapistId: null,
      workPackageId: "wp3",
      activityId: "a31",
      status: "DRAFT",
    }]);
    mocks.findScopeAudits.mockResolvedValue([{ entityId: "entry-1" }]);
    mocks.aggregateHours
      .mockResolvedValueOnce({ _sum: { hours: 10 } })
      .mockResolvedValueOnce({ _sum: { hours: 2 } })
      .mockResolvedValueOnce({ _sum: { hours: 7 } });
    mocks.createEntry.mockResolvedValue({ id: "entry-1", hours: 5, status: "DRAFT" });
    mocks.createAudit.mockResolvedValue({ id: "audit-1" });

    const response = await call(request({ hours: 5 }));

    expect(response.status).toBe(201);
    expect(mocks.createAudit).toHaveBeenCalledWith({
      data: expect.objectContaining({
        beforeData: expect.objectContaining({
          registeredHours: 2,
          confirmedTargetHours: 12,
          proposalRegisteredHours: 10,
          proposalTargetHours: 20,
        }),
        afterData: expect.objectContaining({
          requestFingerprint: buildHistoricalReconstructionRequestFingerprint(partialPayload),
        }),
      }),
    });
    expect(mocks.findScopeEntries).toHaveBeenCalledOnce();
  });

  it("weigert ontbrekende uitvoeringsbevestiging en overschrijding van de live ruimte", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
    mocks.transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx));
    expect((await call(request({ performedConfirmation: false }))).status).toBe(400);

    mocks.findProposal.mockResolvedValue(proposal);
    mocks.findEntry.mockResolvedValue(null);
    mocks.findUser.mockResolvedValue({
      id: "manager",
      role: "ADMIN",
      active: true,
      email: "manager@example.nl",
      budgetAllocations: [{ category: "Praktijkmanager" }],
    });
    mocks.findAllocations.mockResolvedValue([{ userId: "manager" }]);
    mocks.aggregateHours.mockResolvedValueOnce({ _sum: { hours: 19 } });
    expect((await call(request({ hours: 2 }))).status).toBe(409);
    expect(mocks.createEntry).not.toHaveBeenCalled();
  });

  it("hergebruikt een request-id van een verwijderde conceptregel nooit", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
    mocks.transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx));
    mocks.findProposal.mockResolvedValue(proposal);
    mocks.findEntry.mockResolvedValue(null);
    mocks.findAudit.mockResolvedValue({
      reason: "Outlook-agenda 10 juli 2026 en het opgeleverde trainingsmateriaal.",
      beforeData: { asOf: "2026-08-12" },
      afterData: { requestId: "123e4567-e89b-42d3-a456-426614174000" },
    });

    const response = await call();

    expect(response.status).toBe(409);
    expect(mocks.createEntry).not.toHaveBeenCalled();
  });

  it("weigert dezelfde request-id met gewijzigde conceptgegevens", async () => {
    const originalPayload = {
      requestId: "123e4567-e89b-42d3-a456-426614174000",
      asOf: "2026-08-12",
      date: "2026-07-10",
      hours: 18,
      description: "Voorbereiding en uitvoering van de communicatietraining voor de praktijk.",
      userId: "manager",
      therapistId: null,
      workPackageId: "wp3",
      activityId: "a31",
      targetHours: 20,
      sourceType: "PROJECT_OWNER_RECONSTRUCTION" as const,
      sourceReference: "Outlook-agenda 10 juli 2026 en het opgeleverde trainingsmateriaal.",
      performedConfirmation: true,
    };
    mocks.getSession.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
    mocks.transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx));
    mocks.findProposal.mockResolvedValue(proposal);
    mocks.findEntry.mockResolvedValue({
      id: "entry-1",
      historicalProposalId: "proposal-1",
      date: new Date("2026-07-10T00:00:00.000Z"),
      hours: 18,
      description: originalPayload.description,
      userId: "manager",
      therapistId: null,
      workPackageId: "wp3",
      activityId: "a31",
      status: "DRAFT",
    });
    mocks.findAudit.mockResolvedValue({
      reason: originalPayload.sourceReference,
      beforeData: {
        asOf: "2026-08-12",
        confirmedTargetHours: 20,
        sourceType: "PROJECT_OWNER_RECONSTRUCTION",
        performedConfirmation: true,
      },
      afterData: {
        requestId: originalPayload.requestId,
        requestFingerprint: buildHistoricalReconstructionRequestFingerprint(originalPayload),
        date: originalPayload.date,
        hours: 18,
        description: originalPayload.description,
        status: "DRAFT",
        userId: "manager",
        therapistId: null,
        workPackageId: "wp3",
        activityId: "a31",
      },
    });

    const response = await call(request({ hours: 17.75 }));

    expect(response.status).toBe(409);
  });

  it("geeft bij een veilige replay het actuele resterende voorstel terug", async () => {
    const replayPayload = {
      requestId: "123e4567-e89b-42d3-a456-426614174000",
      asOf: "2026-08-12",
      date: "2026-07-10",
      hours: 5,
      description: "Voorbereiding en uitvoering van de communicatietraining voor de praktijk.",
      userId: "manager",
      therapistId: null,
      workPackageId: "wp3",
      activityId: "a31",
      targetHours: 20,
      sourceType: "PROJECT_OWNER_RECONSTRUCTION" as const,
      sourceReference: "Outlook-agenda 10 juli 2026 en het opgeleverde trainingsmateriaal.",
      performedConfirmation: true,
    };
    mocks.getSession.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
    mocks.transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx));
    mocks.findProposal.mockResolvedValue(proposal);
    mocks.findEntry.mockResolvedValue({
      id: "entry-1",
      historicalProposalId: "proposal-1",
      date: new Date("2026-07-10T00:00:00.000Z"),
      hours: 5,
      description: replayPayload.description,
      userId: "manager",
      therapistId: null,
      workPackageId: "wp3",
      activityId: "a31",
      status: "DRAFT",
    });
    mocks.findAudit.mockResolvedValue({
      reason: replayPayload.sourceReference,
      beforeData: {
        asOf: replayPayload.asOf,
        confirmedTargetHours: replayPayload.targetHours,
        sourceType: replayPayload.sourceType,
        performedConfirmation: true,
      },
      afterData: {
        requestId: replayPayload.requestId,
        requestFingerprint: buildHistoricalReconstructionRequestFingerprint(replayPayload),
        date: replayPayload.date,
        hours: replayPayload.hours,
        description: replayPayload.description,
        status: "DRAFT",
        userId: replayPayload.userId,
        therapistId: null,
        workPackageId: replayPayload.workPackageId,
        activityId: replayPayload.activityId,
      },
    });
    mocks.findAllocations.mockResolvedValue([{ userId: "manager" }]);
    mocks.aggregateHours.mockResolvedValue({ _sum: { hours: 7 } });

    const response = await call(request({ hours: 5 }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ remainingHours: 13, idempotent: true });
  });

  it("herleest na een concurrente unieke insert de winnende idempotente materialisatie", async () => {
    const duplicate = Object.assign(
      Object.create(Prisma.PrismaClientKnownRequestError.prototype),
      { code: "P2002", message: "Unique constraint failed" },
    );
    const replayPayload = {
      requestId: "123e4567-e89b-42d3-a456-426614174000",
      asOf: "2026-08-12",
      date: "2026-07-10",
      hours: 5,
      description: "Voorbereiding en uitvoering van de communicatietraining voor de praktijk.",
      userId: "manager",
      therapistId: null,
      workPackageId: "wp3",
      activityId: "a31",
      targetHours: 20,
      sourceType: "PROJECT_OWNER_RECONSTRUCTION" as const,
      sourceReference: "Outlook-agenda 10 juli 2026 en het opgeleverde trainingsmateriaal.",
      performedConfirmation: true,
    };
    mocks.getSession.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
    mocks.transaction
      .mockRejectedValueOnce(duplicate)
      .mockImplementationOnce(async (callback: (client: typeof tx) => unknown) => callback(tx));
    mocks.findProposal.mockResolvedValue(proposal);
    mocks.findEntry.mockResolvedValue({
      id: "entry-1",
      historicalProposalId: "proposal-1",
      date: new Date("2026-07-10T00:00:00.000Z"),
      hours: 5,
      description: replayPayload.description,
      userId: "manager",
      therapistId: null,
      workPackageId: "wp3",
      activityId: "a31",
      status: "DRAFT",
    });
    mocks.findAudit.mockResolvedValue({
      reason: replayPayload.sourceReference,
      beforeData: {
        asOf: replayPayload.asOf,
        confirmedTargetHours: replayPayload.targetHours,
        sourceType: replayPayload.sourceType,
        performedConfirmation: true,
      },
      afterData: {
        requestId: replayPayload.requestId,
        requestFingerprint: buildHistoricalReconstructionRequestFingerprint(replayPayload),
        date: replayPayload.date,
        hours: replayPayload.hours,
        description: replayPayload.description,
        status: "DRAFT",
        userId: replayPayload.userId,
        therapistId: null,
        workPackageId: replayPayload.workPackageId,
        activityId: replayPayload.activityId,
      },
    });
    mocks.findAllocations.mockResolvedValue([{ userId: "manager" }]);
    mocks.aggregateHours.mockResolvedValue({ _sum: { hours: 7 } });

    const response = await call(request({ hours: 5 }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ remainingHours: 13, idempotent: true });
    expect(mocks.transaction).toHaveBeenCalledTimes(2);
  });

  it("autoriseert vóór de transactie", async () => {
    mocks.getSession.mockResolvedValueOnce(null);
    expect((await call()).status).toBe(401);
    mocks.getSession.mockResolvedValueOnce({ user: { id: "internal", role: "INTERNAL" } });
    expect((await call()).status).toBe(403);
  });
});
