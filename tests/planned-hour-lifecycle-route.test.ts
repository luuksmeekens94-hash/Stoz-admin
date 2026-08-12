import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  transaction: vi.fn(),
  findEntry: vi.fn(),
  findPlanningAudits: vi.fn(),
  findActivity: vi.fn(),
  findUser: vi.fn(),
  findTherapist: vi.fn(),
  updateEntries: vi.fn(),
  findUpdated: vi.fn(),
  createAudit: vi.fn(),
  dbDate: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock("@/lib/hour-entry-db", () => ({ databaseAmsterdamDateKey: mocks.dbDate }));

import { PATCH } from "@/app/api/hours/planning/entries/[id]/route";

const tx = {
  hourEntry: {
    findUnique: mocks.findEntry,
    updateMany: mocks.updateEntries,
    findUniqueOrThrow: mocks.findUpdated,
  },
  auditEvent: { findMany: mocks.findPlanningAudits, create: mocks.createAudit },
  activity: { findUnique: mocks.findActivity },
  user: { findFirst: mocks.findUser },
  therapist: { findFirst: mocks.findTherapist },
};

const entry = {
  id: "hour-planned-1",
  sourceForecastEntryId: "forecast-1",
  status: "DRAFT",
  date: new Date("2026-08-10T00:00:00.000Z"),
  hours: 2.75,
  description: "Implementatiestappen uitgevoerd en afgestemd.",
  userId: "luuk",
  therapistId: null,
  workPackageId: "wp4",
  activityId: "a41",
  updatedAt: new Date("2026-08-12T10:00:00.000Z"),
  sourceForecastEntry: {
    id: "forecast-1",
    plannedDate: new Date("2026-08-10T00:00:00.000Z"),
    executorName: "Luuk Smeekens",
    plannedHours: 3,
  },
};

const materializationAudit = {
  action: "MATERIALIZED_REVIEWED_FORECAST",
  reason: "Agenda en opgeleverde implementatienotitie van 10 augustus 2026.",
  actorUserId: "admin-1",
  createdAt: new Date("2026-08-12T09:00:00.000Z"),
  beforeData: {
    sourceForecastEntryId: "forecast-1",
    plannedDate: "2026-08-10",
    plannedExecutorName: "Luuk Smeekens",
    plannedHours: 3,
  },
  afterData: { performedConfirmation: true },
};

function request(body: unknown) {
  return PATCH(new Request("http://localhost/api/hours/planning/entries/hour-planned-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }), { params: Promise.resolve({ id: "hour-planned-1" }) });
}

describe("planninggekoppelde uren lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
    mocks.transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx));
    mocks.findEntry.mockResolvedValue(entry);
    mocks.findPlanningAudits.mockResolvedValue([materializationAudit]);
    mocks.findActivity.mockResolvedValue({ workPackageId: "wp4" });
    mocks.findUser.mockResolvedValue({ id: "luuk", role: "ADMIN" });
    mocks.findTherapist.mockResolvedValue(null);
    mocks.updateEntries.mockResolvedValue({ count: 1 });
    mocks.findUpdated.mockResolvedValue(entry);
    mocks.createAudit.mockResolvedValue({ id: "audit-new" });
    mocks.dbDate.mockResolvedValue("2026-08-12");
  });

  it("is admin-only en weigert gewone of bronloze wijzigingen fail-closed", async () => {
    mocks.getSession.mockResolvedValueOnce({ user: { id: "luuk", role: "INTERNAL" } });
    expect((await request({ action: "correct" })).status).toBe(403);
    expect(mocks.transaction).not.toHaveBeenCalled();

    expect((await request({ action: "correct", hours: 3 })).status).toBe(400);
    expect(mocks.updateEntries).not.toHaveBeenCalled();
  });

  it("corrigeert het concept alleen met bron, reden en hernieuwde uitvoeringsbevestiging en auditeert de wijziging", async () => {
    const response = await request({
      action: "correct",
      date: "2026-08-11",
      hours: 3,
      description: "Implementatiestappen uitgevoerd, gecontroleerd en met het team afgestemd.",
      userId: "luuk",
      therapistId: null,
      sourceReference: "Agenda en bijgewerkte implementatienotitie van 11 augustus 2026.",
      correctionReason: "Werkelijke uitvoeringsdatum en duur gecorrigeerd na broncontrole.",
      performedConfirmation: true,
    });

    expect(response.status).toBe(200);
    expect(mocks.updateEntries).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: entry.id, sourceForecastEntryId: "forecast-1", status: "DRAFT" }),
      data: expect.objectContaining({
        date: new Date("2026-08-11T00:00:00.000Z"),
        hours: 3,
        description: expect.stringMatching(/gecontroleerd/),
        userId: "luuk",
        therapistId: null,
      }),
    });
    expect(mocks.createAudit).toHaveBeenCalledWith({ data: expect.objectContaining({
      entityType: "HourEntry",
      entityId: entry.id,
      action: "CORRECTED_REVIEWED_FORECAST_HOUR",
      reason: expect.stringMatching(/broncontrole/),
      beforeData: expect.objectContaining({ hours: 2.75 }),
      afterData: expect.objectContaining({
        hours: 3,
        sourceReference: expect.stringMatching(/implementatienotitie/),
        performedConfirmation: true,
      }),
      actorUserId: "admin-1",
    }) });
  });

  it.each([
    ["submit", "DRAFT", "SUBMITTED", "SUBMITTED_REVIEWED_FORECAST_HOUR"],
    ["approve", "SUBMITTED", "APPROVED", "APPROVED_REVIEWED_FORECAST_HOUR"],
    ["return_to_draft", "SUBMITTED", "DRAFT", "RETURNED_REVIEWED_FORECAST_HOUR_TO_DRAFT"],
  ] as const)("auditeert %s atomair", async (action, beforeStatus, afterStatus, auditAction) => {
    mocks.findEntry.mockResolvedValue({ ...entry, status: beforeStatus });
    mocks.findUpdated.mockResolvedValue({ ...entry, status: afterStatus });
    const payload = action === "approve"
      ? { action, reviewConfirmation: true, reason: "Bron en feitelijke uitvoering gecontroleerd voor goedkeuring." }
      : { action, reason: "Statuswijziging na controle van de gekoppelde planning en uitvoering." };

    const response = await request(payload);

    expect(response.status).toBe(200);
    expect(mocks.updateEntries).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: entry.id, sourceForecastEntryId: "forecast-1", status: beforeStatus }),
      data: expect.objectContaining({ status: afterStatus }),
    }));
    expect(mocks.createAudit).toHaveBeenCalledWith({ data: expect.objectContaining({
      action: auditAction,
      beforeData: expect.objectContaining({ status: beforeStatus }),
      afterData: expect.objectContaining({ status: afterStatus }),
      actorUserId: "admin-1",
    }) });
  });

  it("blokkeert goedkeuring zonder expliciete bewijsbeoordeling", async () => {
    mocks.findEntry.mockResolvedValue({ ...entry, status: "SUBMITTED" });
    const response = await request({ action: "approve", reviewConfirmation: false, reason: "Bron bekeken." });
    expect(response.status).toBe(400);
    expect(mocks.updateEntries).not.toHaveBeenCalled();
  });

  it("blokkeert een dubbele of inhoudelijk afwijkende creatie-audit fail-closed", async () => {
    mocks.findPlanningAudits.mockResolvedValue([materializationAudit, { ...materializationAudit }]);
    const response = await request({
      action: "submit",
      reason: "Statuswijziging na controle van de gekoppelde planning en uitvoering.",
    });
    expect(response.status).toBe(409);
    expect(mocks.updateEntries).not.toHaveBeenCalled();
  });

  it("gebruikt na een geldige correctie de nieuwste bronverwijzing in de statusaudit", async () => {
    mocks.findPlanningAudits.mockResolvedValue([
      materializationAudit,
      {
        action: "CORRECTED_REVIEWED_FORECAST_HOUR",
        reason: "Werkelijke duur aangepast na broncontrole.",
        actorUserId: "admin-1",
        createdAt: new Date("2026-08-12T10:00:00.000Z"),
        beforeData: { status: "DRAFT" },
        afterData: {
          sourceReference: "Definitieve agenda en implementatienotitie van 11 augustus 2026.",
          performedConfirmation: true,
        },
      },
    ]);
    const response = await request({
      action: "submit",
      reason: "Statuswijziging na controle van de gekoppelde planning en uitvoering.",
    });
    expect(response.status).toBe(200);
    expect(mocks.createAudit).toHaveBeenCalledWith({
      data: expect.objectContaining({
        beforeData: expect.objectContaining({
          sourceReference: "Definitieve agenda en implementatienotitie van 11 augustus 2026.",
        }),
      }),
    });
  });
});
