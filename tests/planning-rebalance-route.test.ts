import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  transaction: vi.fn(),
  findVersion: vi.fn(),
  findAudit: vi.fn(),
  findWorkPackages: vi.fn(),
  findActivities: vi.fn(),
  findBudgetAllocations: vi.fn(),
  findContributors: vi.fn(),
  findOperationalExecutors: vi.fn(),
  deleteMany: vi.fn(),
  createAllocation: vi.fn(),
  createAudit: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    budgetAllocation: { findMany: mocks.findBudgetAllocations },
    hourEntry: { findMany: mocks.findContributors },
    workPackage: { findMany: mocks.findWorkPackages },
    activity: { findMany: mocks.findActivities },
    user: { findMany: mocks.findOperationalExecutors },
    $transaction: mocks.transaction,
  },
}));

import { POST } from "@/app/api/planning/rebalance/route";

const tx = {
  planningVersion: { findFirst: mocks.findVersion },
  auditEvent: { findFirst: mocks.findAudit, create: mocks.createAudit },
  monthlyPlanAllocation: { deleteMany: mocks.deleteMany, create: mocks.createAllocation },
};

function request(body: unknown = { reason: "Toekomstplanning herijken volgens de actuele projectfase." }) {
  return POST(new Request("http://localhost/api/planning/rebalance", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }));
}

function allocation(month: string, reviewState: "DRAFT" | "REVIEWED", hours = 10) {
  return {
    id: `${month}-${reviewState}`,
    monthStart: new Date(`${month}-01T00:00:00.000Z`),
    budgetLineKey: "PRACTICE_PROJECT_MANAGEMENT",
    roleCategory: "Praktijkmanagement",
    label: "Praktijkmanager en praktijkhouders · projectmanagement",
    workPackageId: "wp1",
    activityId: "a11",
    plannedHours: hours,
    rationale: "Bestaande operationele onderbouwing.",
    sourceState: "OPERATIONAL_FORECAST",
    reviewState,
    forecastEntries: [{
      id: `${month}-forecast-1`,
      plannedDate: new Date(`${month}-10T00:00:00.000Z`),
      executorName: "Heidi Staring",
      plannedHours: hours,
      note: "Bestaande concrete planningdetailregel.",
      materializedHourEntry: null,
    }],
  };
}

describe("future planning rebalance route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
    mocks.transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx));
    mocks.findVersion.mockResolvedValue({
      id: "version-1",
      revision: 1,
      allocations: [allocation("2026-08", "REVIEWED", 26), allocation("2026-09", "DRAFT")],
    });
    mocks.findAudit.mockResolvedValue(null);
    mocks.findWorkPackages.mockResolvedValue([
      { id: "wp1", code: "WP1" }, { id: "wp3", code: "WP3" },
      { id: "wp4", code: "WP4" }, { id: "wp5", code: "WP5" }, { id: "wp6", code: "WP6" },
    ]);
    mocks.findActivities.mockResolvedValue([
      { id: "a11", code: "A1.1", workPackage: { code: "WP1" } },
      { id: "a32", code: "A3.2", workPackage: { code: "WP3" } },
      { id: "a41", code: "A4.1", workPackage: { code: "WP4" } },
      { id: "a42", code: "A4.2", workPackage: { code: "WP4" } },
      { id: "a51", code: "A5.1", workPackage: { code: "WP5" } },
      { id: "a52", code: "A5.2", workPackage: { code: "WP5" } },
      { id: "a61", code: "A6.1", workPackage: { code: "WP6" } },
      { id: "a62", code: "A6.2", workPackage: { code: "WP6" } },
    ]);
    mocks.findBudgetAllocations.mockResolvedValue([
      { category: "Praktijkmanager", user: { id: "heidi", name: "Heidi Staring", active: true } },
      { category: "Extern adviseur", user: { id: "luuk", name: "Luuk Smeekens", active: true } },
      { category: "Front/backoffice", user: { id: "frontoffice", name: "Frontoffice Test", active: true } },
    ]);
    mocks.findContributors.mockResolvedValue([
      { userId: "heidi", user: { name: "Heidi Staring" }, therapist: null },
      { userId: "luuk", user: { name: "Luuk Smeekens" }, therapist: null },
      { userId: "team", user: { name: "Fysiotherapeuten Fy-fit" }, therapist: { name: "Anouk Peters" } },
    ]);
    mocks.findOperationalExecutors.mockResolvedValue([
      { name: "Marion Brouwer", active: true },
      { name: "Sjoerd Hendriks", active: true },
    ]);
    mocks.deleteMany.mockResolvedValue({ count: 1 });
    mocks.createAllocation.mockResolvedValue({ id: "new-allocation" });
    mocks.createAudit.mockResolvedValue({ id: "audit-1" });
  });

  it("bewaart augustus en vervangt uitsluitend toekomstige DRAFT-maanden met audit", async () => {
    const response = await request();

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload).toMatchObject({ revision: 1, reviewedMonthsPreserved: ["2026-08"], idempotent: false });
    expect(mocks.deleteMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        planningVersionId: "version-1",
        reviewState: "DRAFT",
        monthStart: { gte: new Date("2026-09-01T00:00:00.000Z"), lte: new Date("2027-08-01T00:00:00.000Z") },
      }),
    });
    expect(mocks.createAllocation).toHaveBeenCalled();
    expect(mocks.createAllocation.mock.calls.every(([input]) => input.data.reviewState === "DRAFT")).toBe(true);
    expect(mocks.createAllocation.mock.calls.every(([input]) => input.data.monthStart >= new Date("2026-09-01T00:00:00.000Z"))).toBe(true);
    const frontofficeExecutors = mocks.createAllocation.mock.calls
      .filter(([input]) => input.data.roleCategory === "Front/backoffice")
      .flatMap(([input]) => input.data.forecastEntries.create.map((entry: { executorName: string }) => entry.executorName));
    expect(new Set(frontofficeExecutors)).toEqual(new Set(["Marion Brouwer", "Sjoerd Hendriks"]));
    expect(mocks.createAudit).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entityType: "PlanningVersion",
        entityId: "version-1:future-rebalance-2026-08-v2",
        action: "REBALANCED_FUTURE_OPERATIONAL_FORECAST",
        actorUserId: "admin-1",
        beforeData: expect.objectContaining({
          allocations: [expect.objectContaining({
            id: "2026-09-DRAFT",
            monthStart: "2026-09-01",
            budgetLineKey: "PRACTICE_PROJECT_MANAGEMENT",
            workPackageId: "wp1",
            activityId: "a11",
            forecastEntries: [expect.objectContaining({
              id: "2026-09-forecast-1",
              plannedDate: "2026-09-10",
              executorName: "Heidi Staring",
              plannedHours: 10,
              note: "Bestaande concrete planningdetailregel.",
            })],
          })],
        }),
      }),
    });
    expect(mocks.transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        isolationLevel: "Serializable",
        maxWait: 10_000,
        timeout: 30_000,
      }),
    );
  });

  it("blokkeert gemengde maandstatus en plannen met gematerialiseerde DRAFT-details", async () => {
    mocks.findVersion.mockResolvedValueOnce({
      id: "version-1",
      revision: 1,
      allocations: [allocation("2026-09", "DRAFT"), allocation("2026-09", "REVIEWED")],
    });
    expect((await request()).status).toBe(409);
    expect(mocks.deleteMany).not.toHaveBeenCalled();

    mocks.findVersion.mockResolvedValueOnce({
      id: "version-1",
      revision: 1,
      allocations: [{
        ...allocation("2026-09", "DRAFT"),
        forecastEntries: [{ plannedHours: 10, materializedHourEntry: { id: "hour-1" } }],
      }],
    });
    expect((await request()).status).toBe(409);
    expect(mocks.deleteMany).not.toHaveBeenCalled();
  });

  it("bewaart ook een toekomstige REVIEWED-maand en vervangt alleen latere DRAFT-maanden", async () => {
    mocks.findVersion.mockResolvedValue({
      id: "version-1",
      revision: 1,
      allocations: [
        allocation("2026-08", "REVIEWED", 26),
        allocation("2026-09", "REVIEWED", 12),
        allocation("2026-10", "DRAFT", 10),
      ],
    });

    const response = await request();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      reviewedMonthsPreserved: ["2026-08", "2026-09"],
      replacedAllocationCount: 1,
    });
    expect(mocks.createAllocation.mock.calls.every(([input]) =>
      input.data.monthStart.toISOString().slice(0, 7) === "2026-10"
    )).toBe(true);
    expect(mocks.createAudit).toHaveBeenCalledWith({
      data: expect.objectContaining({
        beforeData: expect.objectContaining({
          months: ["2026-10"],
          allocations: [expect.objectContaining({ id: "2026-10-DRAFT" })],
        }),
        afterData: expect.objectContaining({ reviewedMonthsPreserved: ["2026-08", "2026-09"] }),
      }),
    });
  });

  it("laat een oude herverdelingsaudit een inhoudelijk gewijzigde DRAFT-planning niet opslokken", async () => {
    mocks.findAudit.mockResolvedValue({
      id: "audit-existing",
      afterData: { stateFingerprint: "oude-planningfingerprint" },
    });

    const response = await request();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ idempotent: false, revision: 1 });
    expect(mocks.deleteMany).toHaveBeenCalledTimes(1);
    expect(mocks.createAllocation).toHaveBeenCalled();
  });

  it("weigert ongeldige reden en controleert admin vóór databasewerk", async () => {
    expect((await request({ reason: "kort" })).status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();

    mocks.requireAdmin.mockRejectedValueOnce(new Error("FORBIDDEN"));
    expect((await request()).status).toBe(403);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("blokkeert vóór verwijdering wanneer een forecastrol geen echte uitvoerder heeft", async () => {
    mocks.findBudgetAllocations.mockResolvedValue([
      { category: "Praktijkmanager", user: { id: "heidi", name: "Heidi Staring", active: true } },
      { category: "Extern adviseur", user: { id: "luuk", name: "Luuk Smeekens", active: true } },
    ]);
    mocks.findOperationalExecutors.mockResolvedValue([]);

    const response = await request();

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringMatching(/echte uitvoerder/i) });
    expect(mocks.deleteMany).not.toHaveBeenCalled();
    expect(mocks.createAllocation).not.toHaveBeenCalled();
  });
});
