import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  transaction: vi.fn(),
  findVersion: vi.fn(),
  findForecasts: vi.fn(),
  findExisting: vi.fn(),
  findPriorDecisions: vi.fn(),
  findUsers: vi.fn(),
  findTherapists: vi.fn(),
  createEntry: vi.fn(),
  updateEntries: vi.fn(),
  createAudit: vi.fn(),
  dbDate: vi.fn(),
  assertNoOverlap: vi.fn(),
  validateTargets: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock("@/lib/hour-entry-db", () => ({ databaseAmsterdamDateKey: mocks.dbDate }));
vi.mock("@/lib/historical-reconstruction-db", () => ({
  assertNoOrdinaryEntryOverlapsHistoricalReconstruction: mocks.assertNoOverlap,
  validateHistoricalReconstructionTargetsForScopes: mocks.validateTargets,
}));

import { POST } from "@/app/api/hours/planning/months/[monthKey]/reconcile/route";

const tx = {
  planningVersion: { findFirst: mocks.findVersion },
  forecastEntry: { findMany: mocks.findForecasts },
  hourEntry: { findMany: mocks.findExisting, create: mocks.createEntry, updateMany: mocks.updateEntries },
  auditEvent: { findMany: mocks.findPriorDecisions, create: mocks.createAudit },
  user: { findMany: mocks.findUsers },
  therapist: { findMany: mocks.findTherapists },
};

const forecast = {
  id: "forecast-1",
  plannedDate: new Date("2026-08-10T00:00:00.000Z"),
  executorName: "Luuk Smeekens",
  plannedHours: 3,
  note: "Monitoring en projectindicatoren ingericht en gecontroleerd.",
  allocation: {
    reviewState: "REVIEWED",
    workPackageId: "wp6",
    activityId: "activity-6-1",
    workPackage: { code: "WP6" },
    activity: { code: "A6.1", name: "Monitoring", workPackageId: "wp6" },
    planningVersion: { id: "version-1", status: "CONCEPT", revision: 1 },
  },
};
const body = {
  sourceReference: "Agenda en opgeleverde projectnotities voor augustus 2026 gecontroleerd.",
  performedConfirmation: true,
  rows: [{ forecastEntryId: "forecast-1", userId: "luuk", therapistId: null }],
};
function post(payload: unknown = body, monthKey = "2026-08") {
  return POST(new Request(`http://localhost/api/hours/planning/months/${monthKey}/reconcile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }), { params: Promise.resolve({ monthKey }) });
}

describe("planning month reconciliation route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
    mocks.transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx));
    mocks.findVersion.mockResolvedValue({ id: "version-1", revision: 1 });
    mocks.findForecasts.mockResolvedValue([forecast]);
    mocks.findExisting.mockResolvedValue([]);
    mocks.findPriorDecisions.mockResolvedValue([]);
    mocks.findUsers.mockResolvedValue([{ id: "luuk", role: "ADMIN", active: true }]);
    mocks.findTherapists.mockResolvedValue([]);
    mocks.dbDate.mockResolvedValue("2026-10-01");
    mocks.createEntry.mockResolvedValue({ id: "hour-1" });
    mocks.updateEntries.mockResolvedValue({ count: 1 });
    mocks.createAudit.mockResolvedValue({ id: "audit-1" });
    mocks.assertNoOverlap.mockResolvedValue(undefined);
    mocks.validateTargets.mockResolvedValue(undefined);
  });

  it("registreert en keurt alle openstaande maandregels transactioneel goed met audittrail", async () => {
    const response = await post();

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ monthKey: "2026-08", approvedCount: 1, approvedHours: 3 });
    expect(mocks.findForecasts).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ allocation: expect.objectContaining({ planningVersionId: "version-1" }) }),
    }));
    expect(mocks.createEntry).toHaveBeenCalledWith({ data: expect.objectContaining({
      date: forecast.plannedDate,
      hours: 3,
      userId: "luuk",
      sourceForecastEntryId: "forecast-1",
      status: "DRAFT",
    }) });
    expect(mocks.updateEntries).toHaveBeenNthCalledWith(1, {
      where: { id: "hour-1", status: "DRAFT", sourceForecastEntryId: "forecast-1" },
      data: { status: "SUBMITTED" },
    });
    expect(mocks.updateEntries).toHaveBeenNthCalledWith(2, {
      where: { id: "hour-1", status: "SUBMITTED", sourceForecastEntryId: "forecast-1" },
      data: expect.objectContaining({ status: "APPROVED", approvedBy: "admin-1" }),
    });
    expect(mocks.createAudit).toHaveBeenCalledWith({ data: expect.objectContaining({
      entityType: "HourEntry",
      action: "MATERIALIZED_REVIEWED_FORECAST",
      actorUserId: "admin-1",
      afterData: expect.objectContaining({ performedConfirmation: true, status: "DRAFT" }),
    }) });
    expect(mocks.createAudit).toHaveBeenCalledWith({ data: expect.objectContaining({
      entityType: "HourEntry",
      action: "APPROVED_REVIEWED_FORECAST_HOUR",
      actorUserId: "admin-1",
    }) });
    expect(mocks.assertNoOverlap).toHaveBeenCalledOnce();
    expect(mocks.validateTargets).toHaveBeenCalledOnce();
  });

  it("weigert gedeeltelijke maanden, toekomstige regels en ontbrekende bevestiging fail-closed", async () => {
    expect((await post({ ...body, rows: [] })).status).toBe(409);
    expect(mocks.createEntry).not.toHaveBeenCalled();

    mocks.dbDate.mockResolvedValueOnce("2026-08-09");
    expect((await post()).status).toBe(400);

    expect((await post({ ...body, performedConfirmation: false })).status).toBe(400);
    expect((await post(body, "2026-10")).status).toBe(400);
  });

  it("weigert hergebruik, ongeldige uitvoerders en niet-beheerders", async () => {
    mocks.findExisting.mockResolvedValueOnce([{ id: "hour-existing", sourceForecastEntryId: "forecast-1", status: "DRAFT", hours: 3 }]);
    expect((await post()).status).toBe(409);

    mocks.findUsers.mockResolvedValueOnce([]);
    expect((await post()).status).toBe(400);

    mocks.getSession.mockResolvedValueOnce({ user: { id: "user-1", role: "INTERNAL" } });
    expect((await post()).status).toBe(403);
  });

  it("neemt bij een deels eerder goedgekeurde maand de werkelijke bestaande uren op in de maandaudit", async () => {
    const secondForecast = {
      ...forecast,
      id: "forecast-2",
      plannedDate: new Date("2026-08-17T00:00:00.000Z"),
      plannedHours: 2,
    };
    mocks.findForecasts.mockResolvedValueOnce([forecast, secondForecast]);
    mocks.findExisting.mockResolvedValueOnce([
      { id: "hour-existing", sourceForecastEntryId: "forecast-1", status: "APPROVED", hours: 2.5 },
    ]);
    mocks.findPriorDecisions.mockResolvedValueOnce([{ entityId: "forecast-1" }]);

    const response = await post({
      ...body,
      rows: [{ forecastEntryId: "forecast-2", userId: "luuk", therapistId: null }],
    });

    expect(response.status).toBe(201);
    expect(mocks.createAudit).toHaveBeenCalledWith({ data: expect.objectContaining({
      entityType: "PlanningMonth",
      action: "APPROVED_MONTHLY_FORECAST_AS_ACTUALS",
      afterData: expect.objectContaining({ approvedCount: 2, approvedHours: 4.5 }),
    }) });
  });
});
