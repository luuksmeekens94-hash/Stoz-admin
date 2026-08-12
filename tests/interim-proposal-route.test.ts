import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  transaction: vi.fn(),
  findSet: vi.fn(),
  findCalculation: vi.fn(),
  findEntries: vi.fn(),
  findAllocations: vi.fn(),
  findActivities: vi.fn(),
  createSet: vi.fn(),
  createAudit: vi.fn(),
  hourCreate: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/reporting-control", async (original) => ({
  ...(await original<typeof import("@/lib/reporting-control")>()),
  amsterdamDateKey: () => "2026-08-12",
}));
vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: mocks.transaction } }));

import { POST } from "@/app/api/hours/reconstruction/proposals/route";
import { buildInterimProposalRequestFingerprint } from "@/lib/interim-hour-proposals";
import { buildInterimHoursSteering } from "@/lib/interim-hour-steering";

const tx = {
  interimHourProposalSet: {
    findUnique: mocks.findSet,
    findFirst: mocks.findCalculation,
    create: mocks.createSet,
  },
  hourEntry: { findMany: mocks.findEntries, create: mocks.hourCreate },
  budgetAllocation: { findMany: mocks.findAllocations },
  activity: { findMany: mocks.findActivities },
  auditEvent: { create: mocks.createAudit },
};

const steering = buildInterimHoursSteering([
  { budgetCategory: "Praktijkmanager", workPackageCode: "WP1", activityCode: "A1.1", hours: 172 },
  { budgetCategory: "Praktijkmanager", workPackageCode: "WP2", activityCode: "A2.2", hours: 8 },
  { budgetCategory: "Praktijkmanager", workPackageCode: "WP3", activityCode: "A3.1", hours: 2 },
  { budgetCategory: "Extern adviseur", workPackageCode: "WP1", activityCode: "A1.1", hours: 97 },
  { budgetCategory: "Extern adviseur", workPackageCode: "WP2", activityCode: "A2.2", hours: 120.5 },
  { budgetCategory: "Fysiotherapeuten", workPackageCode: "WP2", activityCode: "A2.2", hours: 68 },
  { budgetCategory: "Fysiotherapeuten", workPackageCode: "WP3", activityCode: "A3.1", hours: 28 },
  { budgetCategory: "Websitebouwer", workPackageCode: "WP2", activityCode: "A2.1", hours: 56 },
]);
const expectedFingerprint = buildInterimProposalRequestFingerprint({
  asOf: "2026-08-12",
  proposals: steering.proposals,
});

function request(overrides: Record<string, unknown> = {}) {
  return new Request("http://localhost/api/hours/reconstruction/proposals", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requestId: "123e4567-e89b-42d3-a456-426614174000",
      asOf: "2026-08-12",
      proposals: steering.proposals,
      ...overrides,
    }),
  });
}

describe("interim proposal-set route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
    mocks.transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx));
    mocks.findSet.mockResolvedValue(null);
    mocks.findCalculation.mockResolvedValue(null);
    mocks.findEntries.mockResolvedValue([
      { hours: 172, userId: "pm", user: { email: "pm@example.nl" }, workPackage: { code: "WP1" }, activity: { code: "A1.1" } },
      { hours: 8, userId: "pm", user: { email: "pm@example.nl" }, workPackage: { code: "WP2" }, activity: { code: "A2.2" } },
      { hours: 2, userId: "pm", user: { email: "pm@example.nl" }, workPackage: { code: "WP3" }, activity: { code: "A3.1" } },
      { hours: 97, userId: "luuk", user: { email: "luuk.smeekens@outlook.com" }, workPackage: { code: "WP1" }, activity: { code: "A1.1" } },
      { hours: 120.5, userId: "luuk", user: { email: "luuk.smeekens@outlook.com" }, workPackage: { code: "WP2" }, activity: { code: "A2.2" } },
      { hours: 68, userId: "team", user: { email: "team@example.nl" }, workPackage: { code: "WP2" }, activity: { code: "A2.2" } },
      { hours: 28, userId: "team", user: { email: "team@example.nl" }, workPackage: { code: "WP3" }, activity: { code: "A3.1" } },
      { hours: 56, userId: "web", user: { email: "web@example.nl" }, workPackage: { code: "WP2" }, activity: { code: "A2.1" } },
    ]);
    mocks.findAllocations.mockResolvedValue([
      { userId: "pm", category: "Praktijkmanager" },
      { userId: "luuk", category: "Extern adviseur" },
      { userId: "team", category: "Fysiotherapeuten" },
      { userId: "web", category: "Websitebouwer" },
    ]);
    mocks.findActivities.mockResolvedValue([
      { id: "a22", code: "A2.2", workPackage: { id: "wp2", code: "WP2" } },
      { id: "a31", code: "A3.1", workPackage: { id: "wp3", code: "WP3" } },
      { id: "a41", code: "A4.1", workPackage: { id: "wp4", code: "WP4" } },
    ]);
    mocks.createSet.mockResolvedValue({ id: "set-1" });
    mocks.createAudit.mockResolvedValue({ id: "audit-1" });
  });

  it("maakt één bronvaste voorstelset en nul urenboekingen", async () => {
    const response = await POST(request() as never);

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({ proposalCount: 3, proposalHours: 45 });
    expect(mocks.createSet).toHaveBeenCalledWith({
      data: expect.objectContaining({
        requestKey: "123e4567-e89b-42d3-a456-426614174000",
        attestedById: "admin-1",
        proposals: { create: expect.arrayContaining([
          expect.objectContaining({
            budgetLineKey: "INTERNAL_TRAINER",
            activityId: "a31",
            proposedQuarters: 72,
          }),
        ]) },
      }),
    });
    expect(mocks.createAudit).toHaveBeenCalledOnce();
    expect(mocks.hourCreate).not.toHaveBeenCalled();
  });

  it("is idempotent voor dezelfde request-id", async () => {
    mocks.findSet.mockResolvedValue({
      id: "set-1",
      attestedById: "admin-1",
      requestFingerprint: expectedFingerprint,
      proposals: steering.proposals.map((proposal) => ({ proposedQuarters: proposal.proposedHours * 4 })),
    });

    const response = await POST(request() as never);

    expect(response.status).toBe(200);
    expect((await response.json()).idempotent).toBe(true);
    expect(mocks.createSet).not.toHaveBeenCalled();
  });

  it("weigert dezelfde request-id wanneer de voorstelpayload is gewijzigd", async () => {
    mocks.findSet.mockResolvedValue({
      id: "set-1",
      attestedById: "admin-1",
      requestFingerprint: "different-fingerprint",
      proposals: steering.proposals.map((proposal) => ({ proposedQuarters: proposal.proposedHours * 4 })),
    });

    const response = await POST(request() as never);

    expect(response.status).toBe(409);
    expect(mocks.createSet).not.toHaveBeenCalled();
  });

  it("maakt bij een nieuwe request-id geen tweede set voor dezelfde berekening en peildatum", async () => {
    mocks.findCalculation.mockResolvedValueOnce({
      id: "set-1",
      attestedById: "admin-1",
      proposals: steering.proposals.map((proposal) => ({ proposedQuarters: proposal.proposedHours * 4 })),
    });

    const response = await POST(request({ requestId: "223e4567-e89b-42d3-a456-426614174000" }) as never);

    expect(response.status).toBe(200);
    expect((await response.json()).idempotent).toBe(true);
    expect(mocks.createSet).not.toHaveBeenCalled();
  });

  it("herleest na een concurrente unieke setinsert de winnende payloadgelijke set", async () => {
    const duplicate = Object.assign(
      Object.create(Prisma.PrismaClientKnownRequestError.prototype),
      { code: "P2002", message: "Unique constraint failed" },
    );
    mocks.transaction
      .mockRejectedValueOnce(duplicate)
      .mockImplementationOnce(async (callback: (client: typeof tx) => unknown) => callback(tx));
    mocks.findSet.mockResolvedValue({
      id: "set-1",
      requestFingerprint: expectedFingerprint,
      proposals: steering.proposals.map((proposal) => ({ proposedQuarters: proposal.proposedHours * 4 })),
    });

    const response = await POST(request() as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ idempotent: true, proposalHours: 45 });
    expect(mocks.transaction).toHaveBeenCalledTimes(2);
  });

  it("autoriseert vóór een databasetransactie", async () => {
    mocks.getSession.mockResolvedValueOnce(null);
    expect((await POST(request() as never)).status).toBe(401);
    mocks.getSession.mockResolvedValueOnce({ user: { id: "internal", role: "INTERNAL" } });
    expect((await POST(request() as never)).status).toBe(403);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
