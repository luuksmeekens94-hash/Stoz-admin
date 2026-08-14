import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  transaction: vi.fn(),
  findEntry: vi.fn(),
  findUpdated: vi.fn(),
  findScopeEntries: vi.fn(),
  aggregateHours: vi.fn(),
  updateEntries: vi.fn(),
  findAudit: vi.fn(),
  findScopeAudits: vi.fn(),
  createAudit: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/reporting-control", async (original) => ({
  ...(await original<typeof import("@/lib/reporting-control")>()),
  amsterdamDateKey: () => "2026-08-10",
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
    hourEntry: { findUnique: mocks.findEntry },
  },
}));

import { PATCH } from "@/app/api/hours/reconstruction/[id]/route";
import { POST } from "@/app/api/hours/reconstruction/route";
import {
  buildHistoricalReconstructionEntryId,
  buildHistoricalReconstructionRequestFingerprint,
  type HistoricalReconstructionPayload,
} from "@/lib/historical-reconstruction-integrity";

const earlierPayload: HistoricalReconstructionPayload = {
  requestId: "123e4567-e89b-42d3-a456-426614174000",
  asOf: "2026-08-10",
  date: "2026-07-01",
  hours: 2,
  description: "Eerste aantoonbaar uitgevoerde historische werkzaamheden.",
  userId: "manager-1",
  therapistId: null,
  workPackageId: "wp2",
  activityId: "a21",
  targetHours: 2,
  sourceType: "DOCUMENTED_SOURCE",
  sourceReference: "Agenda en opgeleverd werkdocument van 1 juli 2026.",
  performedConfirmation: true,
};

const laterPayload: HistoricalReconstructionPayload = {
  ...earlierPayload,
  requestId: "223e4567-e89b-42d3-a456-426614174001",
  date: "2026-07-15",
  hours: 18,
  description: "Later bevestigde aanvullende historische werkzaamheden.",
  targetHours: 20,
  sourceReference: "Agenda en opgeleverd werkdocument van 15 juli 2026.",
};

function entryFromPayload(id: string, payload: HistoricalReconstructionPayload): {
  id: string;
  date: Date;
  hours: number;
  description: string;
  userId: string;
  therapistId: string | null;
  workPackageId: string;
  activityId: string;
  status: string;
  historicalProposalId: null;
  approvedAt: Date | null;
  approvedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
} {
  return {
    id,
    date: new Date(`${payload.date}T00:00:00.000Z`),
    hours: payload.hours,
    description: payload.description,
    userId: payload.userId,
    therapistId: payload.therapistId,
    workPackageId: payload.workPackageId,
    activityId: payload.activityId,
    status: "DRAFT",
    historicalProposalId: null,
    approvedAt: null,
    approvedBy: null,
    createdAt: new Date("2026-08-10T08:00:00.000Z"),
    updatedAt: new Date("2026-08-10T08:00:00.000Z"),
  };
}

function auditFromPayload(id: string, payload: HistoricalReconstructionPayload) {
  return {
    id: `audit-${id}`,
    entityId: id,
    reason: payload.sourceReference,
    beforeData: {
      asOf: payload.asOf,
      confirmedTargetHours: payload.targetHours,
      sourceType: payload.sourceType,
      performedConfirmation: true,
    },
    afterData: {
      requestId: payload.requestId,
      requestFingerprint: buildHistoricalReconstructionRequestFingerprint(payload),
      date: payload.date,
      hours: payload.hours,
      description: payload.description,
      status: "DRAFT",
      userId: payload.userId,
      therapistId: payload.therapistId,
      workPackageId: payload.workPackageId,
      activityId: payload.activityId,
    },
    actorUserId: "admin-1",
    createdAt: new Date("2026-08-10T08:00:00.000Z"),
  };
}

const earlierId = buildHistoricalReconstructionEntryId("admin-1", earlierPayload.requestId);
const laterId = buildHistoricalReconstructionEntryId("admin-1", laterPayload.requestId);
let earlierEntry = entryFromPayload(earlierId, earlierPayload);
let laterEntry = entryFromPayload(laterId, laterPayload);

const tx = {
  hourEntry: {
    findUnique: mocks.findEntry,
    findUniqueOrThrow: mocks.findUpdated,
    findMany: mocks.findScopeEntries,
    aggregate: mocks.aggregateHours,
    updateMany: mocks.updateEntries,
  },
  auditEvent: {
    findFirst: mocks.findAudit,
    findMany: mocks.findScopeAudits,
    create: mocks.createAudit,
  },
  interimHourProposal: { findUnique: vi.fn() },
  budgetAllocation: { findMany: vi.fn() },
};

function replayRequest() {
  return new Request("http://localhost/api/hours/reconstruction", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(earlierPayload),
  });
}

function lifecycleRequest(status: "SUBMITTED" | "APPROVED") {
  return PATCH(new Request(`http://localhost/api/hours/reconstruction/${earlierId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  }) as never, { params: Promise.resolve({ id: earlierId }) }) as Promise<Response>;
}

describe("historische reconstructieroute met oplopende doelstand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    earlierEntry = entryFromPayload(earlierId, earlierPayload);
    laterEntry = entryFromPayload(laterId, laterPayload);
    mocks.getSession.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
    mocks.transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx));
    mocks.findEntry.mockImplementation(async ({ where }: { where: { id: string } }) => {
      if (where.id === earlierId) return earlierEntry;
      if (where.id === laterId) return laterEntry;
      return null;
    });
    mocks.findUpdated.mockImplementation(async ({ where }: { where: { id: string } }) => {
      if (where.id === earlierId) return earlierEntry;
      if (where.id === laterId) return laterEntry;
      throw new Error("not found");
    });
    mocks.findScopeEntries.mockImplementation(async ({ where }: { where: { OR: unknown[] } }) => {
      void where;
      return [earlierEntry, laterEntry];
    });
    mocks.findScopeAudits.mockResolvedValue([
      { entityId: earlierId },
      { entityId: laterId },
    ]);
    mocks.findAudit.mockImplementation(async ({ where }: { where: { entityId: string } }) => {
      if (where.entityId === earlierId) return auditFromPayload(earlierId, earlierPayload);
      if (where.entityId === laterId) return auditFromPayload(laterId, laterPayload);
      return null;
    });
    mocks.aggregateHours.mockResolvedValue({ _sum: { hours: 20 } });
    mocks.updateEntries.mockImplementation(async ({ data }: { data: { status: string; approvedAt: Date | null; approvedBy: string | null } }) => {
      earlierEntry = {
        ...earlierEntry,
        status: data.status,
        approvedAt: data.approvedAt,
        approvedBy: data.approvedBy,
      };
      return { count: 1 };
    });
    mocks.createAudit.mockResolvedValue({ id: "status-audit" });
  });

  it("laat de eerdere lagere reconstructie indienen en goedkeuren onder het latere hoogste doel", async () => {
    const submitted = await lifecycleRequest("SUBMITTED");
    expect(submitted.status).toBe(200);

    const approved = await lifecycleRequest("APPROVED");
    expect(approved.status).toBe(200);
    expect(earlierEntry.status).toBe("APPROVED");
    expect(mocks.updateEntries).toHaveBeenCalledTimes(2);
  });

  it("speelt de eerdere lagere reconstructie idempotent af onder het latere hoogste doel", async () => {
    const response = await POST(replayRequest() as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      entry: { id: earlierId },
      confirmedTargetHours: 2,
      idempotent: true,
    });
  });

  it("herleest ook na een concurrent conflict onder het latere hoogste doel", async () => {
    const duplicate = Object.assign(
      Object.create(Prisma.PrismaClientKnownRequestError.prototype),
      { code: "P2002", message: "Unique constraint failed" },
    );
    mocks.transaction
      .mockRejectedValueOnce(duplicate)
      .mockImplementationOnce(async (callback: (client: typeof tx) => unknown) => callback(tx));

    const response = await POST(replayRequest() as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      entry: { id: earlierId },
      confirmedTargetHours: 2,
      idempotent: true,
    });
    expect(mocks.transaction).toHaveBeenCalledTimes(2);
  });
});
