import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  transaction: vi.fn(),
  findVersion: vi.fn(),
  updateMany: vi.fn(),
  createAudit: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: mocks.transaction } }));

import { POST } from "@/app/api/planning/months/[monthKey]/reopen/route";

const tx = {
  planningVersion: { findFirst: mocks.findVersion },
  monthlyPlanAllocation: { updateMany: mocks.updateMany },
  auditEvent: { create: mocks.createAudit },
};

function reopen(body: unknown = { reason: "Verdeling over uitvoerders en werkzaamheden corrigeren." }) {
  return POST(new Request("http://localhost/api/planning/months/2026-08/reopen", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }), { params: Promise.resolve({ monthKey: "2026-08" }) });
}

describe("planning month reopen route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
    mocks.transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx));
    mocks.findVersion.mockResolvedValue({
      id: "version-1",
      revision: 1,
      allocations: [
        { id: "allocation-1", reviewState: "REVIEWED" },
        { id: "allocation-2", reviewState: "REVIEWED" },
      ],
    });
    mocks.updateMany.mockResolvedValue({ count: 2 });
    mocks.createAudit.mockResolvedValue({ id: "audit-1" });
  });

  it("heropent een volledig goedgekeurde maand transactioneel met reden en audit", async () => {
    const response = await reopen();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      monthKey: "2026-08",
      revision: 1,
      allocationCount: 2,
      reviewState: "DRAFT",
    });
    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ reviewState: "REVIEWED" }),
      data: { reviewState: "DRAFT" },
    }));
    expect(mocks.createAudit).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entityType: "PlanningMonth",
        action: "REOPENED_MONTHLY_OPERATIONAL_FORECAST",
        reason: "Verdeling over uitvoerders en werkzaamheden corrigeren.",
        actorUserId: "admin-1",
      }),
    });
  });

  it("weigert een te korte reden en een maand die niet volledig goedgekeurd is", async () => {
    expect((await reopen({ reason: "kort" })).status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();

    mocks.findVersion.mockResolvedValueOnce({
      id: "version-1",
      revision: 1,
      allocations: [{ id: "allocation-1", reviewState: "DRAFT" }],
    });
    expect((await reopen()).status).toBe(409);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("controleert adminrechten vóór de database", async () => {
    mocks.getSession.mockResolvedValueOnce(null);
    expect((await reopen()).status).toBe(401);
    mocks.getSession.mockResolvedValueOnce({ user: { id: "user-1", role: "INTERNAL" } });
    expect((await reopen()).status).toBe(403);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
