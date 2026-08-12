import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  transaction: vi.fn(),
  findForecast: vi.fn(),
  aggregateForecast: vi.fn(),
  deleteForecast: vi.fn(),
  findAllocation: vi.fn(),
  updateAllocation: vi.fn(),
  createAudit: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: mocks.transaction } }));

import { DELETE } from "@/app/api/planning/forecast/[id]/route";

const tx = {
  forecastEntry: {
    findUnique: mocks.findForecast,
    aggregate: mocks.aggregateForecast,
    delete: mocks.deleteForecast,
  },
  monthlyPlanAllocation: {
    findUnique: mocks.findAllocation,
    update: mocks.updateAllocation,
  },
  auditEvent: { create: mocks.createAudit },
};

function remove(id = "forecast-1") {
  return DELETE(new Request(`http://localhost/api/planning/forecast/${id}`, { method: "DELETE" }), {
    params: Promise.resolve({ id }),
  });
}

describe("forecast delete route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
    mocks.transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx));
    mocks.findForecast.mockResolvedValue({
      id: "forecast-1",
      allocationId: "allocation-1",
      plannedDate: new Date("2026-09-10T00:00:00.000Z"),
      executorName: "Testuitvoerder",
      plannedHours: 2,
      note: null,
      materializedHourEntry: null,
    });
    mocks.findAllocation.mockResolvedValue({
      id: "allocation-1",
      plannedHours: 10,
      reviewState: "DRAFT",
      planningVersion: { status: "CONCEPT" },
    });
    mocks.aggregateForecast.mockResolvedValue({ _sum: { plannedHours: 10 } });
    mocks.deleteForecast.mockResolvedValue({ id: "forecast-1" });
    mocks.updateAllocation.mockResolvedValue({ id: "allocation-1", plannedHours: 8 });
    mocks.createAudit.mockResolvedValue({ id: "audit-1" });
  });

  it("verwijdert detail, herberekent maandtotaal en schrijft audit atomair", async () => {
    const response = await remove();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, id: "forecast-1" });
    expect(mocks.deleteForecast).toHaveBeenCalledWith({ where: { id: "forecast-1" } });
    expect(mocks.updateAllocation).toHaveBeenCalledWith({
      where: { id: "allocation-1" },
      data: { plannedHours: 8 },
    });
    expect(mocks.createAudit).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "FORECAST_ENTRY_DELETED",
        beforeData: expect.objectContaining({ allocationPlannedHours: 10 }),
        afterData: { allocationPlannedHours: 8 },
      }),
    });
  });

  it("blokkeert verwijdering bij een bestaand verschil tussen detail- en maandtotaal", async () => {
    mocks.aggregateForecast.mockResolvedValue({ _sum: { plannedHours: 9.5 } });

    const response = await remove();

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Forecasttotaal is inconsistent; verwijderen is geblokkeerd.",
    });
    expect(mocks.deleteForecast).not.toHaveBeenCalled();
    expect(mocks.updateAllocation).not.toHaveBeenCalled();
    expect(mocks.createAudit).not.toHaveBeenCalled();
  });

  it("blokkeert verwijderen nadat de maand is goedgekeurd of versie is gearchiveerd", async () => {
    mocks.findAllocation.mockResolvedValue({
      id: "allocation-1",
      plannedHours: 10,
      reviewState: "REVIEWED",
      planningVersion: { status: "CONCEPT" },
    });
    const reviewedResponse = await remove();
    expect(reviewedResponse.status).toBe(409);
    await expect(reviewedResponse.json()).resolves.toEqual({
      error: "Deze planmaand is goedgekeurd en kan niet meer worden gewijzigd.",
    });

    mocks.findAllocation.mockResolvedValue({
      id: "allocation-1",
      plannedHours: 10,
      reviewState: "DRAFT",
      planningVersion: { status: "ARCHIVED" },
    });
    const archivedResponse = await remove();
    expect(archivedResponse.status).toBe(409);
    await expect(archivedResponse.json()).resolves.toEqual({
      error: "Deze planningversie is niet meer wijzigbaar.",
    });
    expect(mocks.deleteForecast).not.toHaveBeenCalled();
  });

  it("blokkeert verwijderen van een forecastregel die al als urenconcept is gebruikt", async () => {
    mocks.findForecast.mockResolvedValue({
      id: "forecast-1",
      allocationId: "allocation-1",
      plannedDate: new Date("2026-09-10T00:00:00.000Z"),
      executorName: "Testuitvoerder",
      plannedHours: 2,
      note: null,
      materializedHourEntry: { id: "hour-1" },
    });

    const response = await remove();

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Deze forecastregel is al als urenconcept geregistreerd en kan niet meer worden verwijderd.",
    });
    expect(mocks.deleteForecast).not.toHaveBeenCalled();
    expect(mocks.updateAllocation).not.toHaveBeenCalled();
  });

  it("vereist adminrechten voordat forecastgegevens worden geladen", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("FORBIDDEN"));

    const response = await remove();

    expect(response.status).toBe(403);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
