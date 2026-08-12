import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  transaction: vi.fn(),
  findEntries: vi.fn(),
  findAudits: vi.fn(),
  updateEntries: vi.fn(),
  createAudit: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/prisma", () => ({
  prisma: { $transaction: mocks.transaction },
}));

import { PATCH } from "@/app/api/hours/bulk/route";

const tx = {
  hourEntry: {
    findMany: mocks.findEntries,
    updateMany: mocks.updateEntries,
  },
  auditEvent: {
    findMany: mocks.findAudits,
    create: mocks.createAudit,
  },
};

function bulkRequest(body: string) {
  return new Request("http://localhost/api/hours/bulk", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body,
  }) as NextRequest;
}

describe("bulk hour route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
    mocks.transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) =>
      callback(tx),
    );
    mocks.findEntries.mockResolvedValue([{ id: "reconstruction-1" }]);
    mocks.findAudits.mockResolvedValue([{ entityId: "reconstruction-1" }]);
  });

  it.each(["submit", "approve"])(
    "blokkeert historische reconstructies in de generieke bulkactie %s",
    async (action) => {
      const response = await PATCH(
        bulkRequest(JSON.stringify({ action, ids: ["reconstruction-1"] })),
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        error: expect.stringMatching(/afzonderlijk/),
      });
      expect(mocks.updateEntries).not.toHaveBeenCalled();
      expect(mocks.createAudit).not.toHaveBeenCalled();
    },
  );

  it.each(["submit", "approve"])(
    "blokkeert uren uit goedgekeurde planning in de generieke bulkactie %s",
    async (action) => {
      mocks.findEntries.mockResolvedValue([{ id: "planned-hour-1", sourceForecastEntryId: "forecast-1" }]);
      mocks.findAudits.mockResolvedValue([]);

      const response = await PATCH(
        bulkRequest(JSON.stringify({ action, ids: ["planned-hour-1"] })),
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        error: expect.stringMatching(/afzonderlijk|goedgekeurde planning/i),
      });
      expect(mocks.updateEntries).not.toHaveBeenCalled();
      expect(mocks.createAudit).not.toHaveBeenCalled();
    },
  );

  it("blokkeert een legacy TEAM-concept zonder actieve therapeut bij bulkindienen", async () => {
    mocks.findEntries.mockResolvedValue([
      {
        id: "legacy-team-entry",
        status: "DRAFT",
        updatedAt: new Date("2026-08-11T08:00:00.000Z"),
        date: new Date("2026-08-11T00:00:00.000Z"),
        hours: 1,
        userId: "team-user",
        therapistId: null,
        workPackageId: "wp1",
        activityId: "activity-1",
        activity: { workPackageId: "wp1" },
        user: { role: "TEAM", active: true },
        therapist: null,
      },
    ]);
    mocks.findAudits.mockResolvedValue([]);

    const response = await PATCH(
      bulkRequest(JSON.stringify({ action: "submit", ids: ["legacy-team-entry"] })),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringMatching(/therapeut/i),
    });
    expect(mocks.updateEntries).not.toHaveBeenCalled();
  });

  it("geeft een gecontroleerde 400 op ongeldige JSON", async () => {
    const response = await PATCH(bulkRequest("{"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Ongeldige JSON-aanvraag." });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
