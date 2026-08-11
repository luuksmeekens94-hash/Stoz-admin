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

import { PATCH } from "@/app/api/planning/months/[monthKey]/route";

const tx = {
  planningVersion: { findFirst: mocks.findVersion },
  monthlyPlanAllocation: { updateMany: mocks.updateMany },
  auditEvent: { create: mocks.createAudit },
};

function approve(monthKey = "2026-09") {
  return PATCH(new Request(`http://localhost/api/planning/months/${monthKey}`, { method: "PATCH" }), {
    params: Promise.resolve({ monthKey }),
  });
}

describe("planning month approval route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
    mocks.transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx));
    mocks.findVersion.mockResolvedValue({
      id: "version-1",
      revision: 1,
      allocations: [
        {
          id: "allocation-1",
          plannedHours: 8,
          reviewState: "DRAFT",
          forecastEntries: [
            {
              plannedDate: new Date("2026-09-10T00:00:00.000Z"),
              executorName: "Fysiotherapieteam Fy-fit",
              plannedHours: 8,
            },
          ],
        },
      ],
    });
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.createAudit.mockResolvedValue({ id: "audit-1" });
  });

  it("keurt alle planregels transactioneel goed en schrijft één maandaudit", async () => {
    const response = await approve();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      allocationCount: 1,
      detailCount: 1,
      totalHours: 8,
      revision: 1,
      monthKey: "2026-09",
      idempotent: false,
    });
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        planningVersionId: "version-1",
        reviewState: "DRAFT",
      }),
      data: { reviewState: "REVIEWED" },
    });
    expect(mocks.createAudit).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entityType: "PlanningMonth",
        action: "APPROVED_MONTHLY_OPERATIONAL_FORECAST",
        actorUserId: "admin-1",
      }),
    });
  });

  it("is idempotent wanneer de volledige maand al is goedgekeurd", async () => {
    mocks.findVersion.mockResolvedValue({
      id: "version-1",
      revision: 1,
      allocations: [
        {
          id: "allocation-1",
          plannedHours: 8,
          reviewState: "REVIEWED",
          forecastEntries: [
            {
              plannedDate: new Date("2026-09-10T00:00:00.000Z"),
              executorName: "Team",
              plannedHours: 8,
            },
          ],
        },
      ],
    });

    const response = await approve();

    expect(response.status).toBe(200);
    expect((await response.json()).idempotent).toBe(true);
    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.createAudit).not.toHaveBeenCalled();
  });

  it("controleert authenticatie en autorisatie vóór de database", async () => {
    mocks.getSession.mockResolvedValueOnce(null);
    expect((await approve()).status).toBe(401);
    mocks.getSession.mockResolvedValueOnce({ user: { id: "user-1", role: "INTERNAL" } });
    expect((await approve()).status).toBe(403);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
