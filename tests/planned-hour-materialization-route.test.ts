import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  transaction: vi.fn(),
  findForecast: vi.fn(),
  findExisting: vi.fn(),
  findPriorAudit: vi.fn(),
  findUser: vi.fn(),
  findTherapist: vi.fn(),
  createEntry: vi.fn(),
  createAudit: vi.fn(),
  dbDate: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock("@/lib/hour-entry-db", () => ({ databaseAmsterdamDateKey: mocks.dbDate }));

import { POST } from "@/app/api/hours/planning/[forecastEntryId]/entries/route";

const tx = {
  forecastEntry: { findUnique: mocks.findForecast },
  hourEntry: { findUnique: mocks.findExisting, create: mocks.createEntry },
  auditEvent: { findFirst: mocks.findPriorAudit, create: mocks.createAudit },
  user: { findFirst: mocks.findUser },
  therapist: { findFirst: mocks.findTherapist },
};

const forecast = {
  id: "forecast-1",
  plannedDate: new Date("2026-08-10T00:00:00.000Z"),
  executorName: "Luuk Smeekens",
  plannedHours: 3,
  note: "Indicatoren en inrichting van de gebruiksmonitoring.",
  allocation: {
    reviewState: "REVIEWED",
    workPackageId: "wp6",
    activityId: "activity-6-1",
    roleCategory: "Extern adviseur",
    workPackage: { code: "WP6" },
    activity: { code: "A6.1", name: "Monitoring", workPackageId: "wp6" },
    planningVersion: { id: "version-1", status: "CONCEPT", revision: 1 },
  },
};

const body = {
  userId: "luuk",
  therapistId: null,
  date: "2026-08-10",
  hours: 2.75,
  description: "Monitoring ingericht en de eerste projectindicatoren gecontroleerd.",
  sourceReference: "Agenda en opgeleverde monitoringsnotitie van 10 augustus 2026.",
  performedConfirmation: true,
};

function post(payload: unknown = body) {
  return POST(new Request("http://localhost/api/hours/planning/forecast-1/entries", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }), { params: Promise.resolve({ forecastEntryId: "forecast-1" }) });
}

describe("reviewed forecast materialization route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "admin", role: "ADMIN" } });
    mocks.transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx));
    mocks.findForecast.mockResolvedValue(forecast);
    mocks.findExisting.mockResolvedValue(null);
    mocks.findPriorAudit.mockResolvedValue(null);
    mocks.findUser.mockResolvedValue({ id: "luuk", role: "ADMIN", active: true });
    mocks.findTherapist.mockResolvedValue(null);
    mocks.dbDate.mockResolvedValue("2026-08-12");
    mocks.createEntry.mockResolvedValue({ id: "hour-1", status: "DRAFT", hours: 2.75 });
    mocks.createAudit.mockResolvedValue({ id: "audit-1" });
  });

  it("maakt na uitvoering één gekoppeld concept met gecorrigeerde waarden en audit", async () => {
    const response = await post();
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({ id: "hour-1", status: "DRAFT", sourceForecastEntryId: "forecast-1" });
    expect(mocks.createEntry).toHaveBeenCalledWith({ data: expect.objectContaining({
      date: new Date("2026-08-10T00:00:00.000Z"),
      hours: 2.75,
      userId: "luuk",
      workPackageId: "wp6",
      activityId: "activity-6-1",
      sourceForecastEntryId: "forecast-1",
      status: "DRAFT",
    }) });
    expect(mocks.createAudit).toHaveBeenCalledWith({ data: expect.objectContaining({
      entityType: "HourEntry",
      entityId: "hour-1",
      action: "MATERIALIZED_REVIEWED_FORECAST",
      reason: body.sourceReference,
      beforeData: expect.objectContaining({ plannedHours: 3, plannedDate: "2026-08-10" }),
      afterData: expect.objectContaining({ actualHours: 2.75, performedConfirmation: true }),
      actorUserId: "admin",
    }) });
  });

  it("blokkeert toekomstige uitvoering, ontbrekende bevestiging en niet-goedgekeurde planning", async () => {
    mocks.dbDate.mockResolvedValueOnce("2026-08-09");
    expect((await post()).status).toBe(400);
    expect(mocks.createEntry).not.toHaveBeenCalled();

    expect((await post({ ...body, performedConfirmation: false })).status).toBe(400);
    mocks.findForecast.mockResolvedValueOnce({ ...forecast, allocation: { ...forecast.allocation, reviewState: "DRAFT" } });
    expect((await post()).status).toBe(409);
  });

  it("weigert een tweede concept of hergebruik na verwijdering", async () => {
    mocks.findExisting.mockResolvedValueOnce({ id: "hour-existing", status: "DRAFT" });
    expect((await post()).status).toBe(409);
    mocks.findPriorAudit.mockResolvedValueOnce({ id: "audit-old" });
    expect((await post()).status).toBe(409);
    expect(mocks.createEntry).not.toHaveBeenCalled();
  });

  it("is admin-only en valideert de serverbron in plaats van client-WP of activiteit", async () => {
    mocks.getSession.mockResolvedValueOnce({ user: { id: "user", role: "INTERNAL" } });
    expect((await post()).status).toBe(403);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.createEntry).not.toHaveBeenCalled();
  });
});
