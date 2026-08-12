import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  transaction: vi.fn(),
  findWorkPackages: vi.fn(),
  findActivities: vi.fn(),
  findBudgetAllocations: vi.fn(),
  findContributors: vi.fn(),
  countVersions: vi.fn(),
  createVersion: vi.fn(),
  createAudit: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    workPackage: { findMany: mocks.findWorkPackages },
    activity: { findMany: mocks.findActivities },
    budgetAllocation: { findMany: mocks.findBudgetAllocations },
    hourEntry: { findMany: mocks.findContributors },
    $transaction: mocks.transaction,
  },
}));

import { POST } from "@/app/api/planning/versions/route";

const tx = {
  planningVersion: { count: mocks.countVersions, create: mocks.createVersion },
  auditEvent: { create: mocks.createAudit },
};

function configuredActivities() {
  return [
    ["WP1", "A1.1"], ["WP3", "A3.2"], ["WP4", "A4.1"], ["WP4", "A4.2"],
    ["WP5", "A5.1"], ["WP5", "A5.2"], ["WP6", "A6.1"], ["WP6", "A6.2"],
  ].map(([workPackageCode, code]) => ({
    id: `${workPackageCode}-${code}`,
    code,
    workPackage: { code: workPackageCode },
  }));
}

describe("planning version route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
    mocks.findWorkPackages.mockResolvedValue(
      ["WP1", "WP3", "WP4", "WP5", "WP6"].map((code) => ({ id: code.toLowerCase(), code })),
    );
    mocks.findActivities.mockResolvedValue(configuredActivities());
    mocks.findBudgetAllocations.mockResolvedValue([
      { category: "Praktijkmanager", user: { id: "heidi", name: "Heidi Staring", active: true } },
      { category: "Extern adviseur", user: { id: "luuk", name: "Luuk Smeekens", active: true } },
      { category: "Front/backoffice", user: { id: "frontoffice", name: "Frontoffice Test", active: true } },
    ]);
    mocks.findContributors.mockResolvedValue([
      { userId: "heidi", user: { name: "Heidi Staring" }, therapist: null, workPackage: { code: "WP3" } },
      { userId: "luuk", user: { name: "Luuk Smeekens" }, therapist: null, workPackage: { code: "WP6" } },
      { userId: "team", user: { name: "Fysiotherapeuten Fy-fit" }, therapist: { name: "Anouk Peters", active: true }, workPackage: { code: "WP4" } },
    ]);
    mocks.transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx));
    mocks.countVersions.mockResolvedValue(0);
    mocks.createVersion.mockResolvedValue({ id: "version-1", revision: 1 });
    mocks.createAudit.mockResolvedValue({ id: "audit-1" });
  });

  it("maakt forecastdetails uitsluitend met echte actieve databaseactoren", async () => {
    const response = await POST();

    expect(response.status).toBe(201);
    expect(mocks.createVersion).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        allocations: expect.objectContaining({
          create: expect.arrayContaining([
            expect.objectContaining({
              roleCategory: "Front/backoffice",
              forecastEntries: expect.objectContaining({
                create: expect.arrayContaining([
                  expect.objectContaining({ executorName: "Frontoffice Test" }),
                ]),
              }),
            }),
          ]),
        }),
      }),
    }));
    const serialized = JSON.stringify(mocks.createVersion.mock.calls[0][0]);
    expect(serialized).not.toMatch(/nog toe te wijzen|onbekend/i);
  });

  it("blokkeert vóór databasecreatie wanneer een forecastrol geen echte uitvoerder heeft", async () => {
    mocks.findBudgetAllocations.mockResolvedValue([
      { category: "Praktijkmanager", user: { id: "heidi", name: "Heidi Staring", active: true } },
      { category: "Extern adviseur", user: { id: "luuk", name: "Luuk Smeekens", active: true } },
    ]);

    const response = await POST();

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: expect.stringMatching(/echte uitvoerder/i) });
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.createVersion).not.toHaveBeenCalled();
  });
});
