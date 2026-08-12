import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  findEntry: vi.fn(),
  findAudit: vi.fn(),
  deleteEntries: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    hourEntry: { findFirst: mocks.findEntry, deleteMany: mocks.deleteEntries },
    auditEvent: { findFirst: mocks.findAudit },
  },
}));

import { DELETE, PATCH } from "@/app/api/hours/[id]/route";

const params = { params: Promise.resolve({ id: "entry-of-another-user" }) };

function patchRequest() {
  return new Request("http://localhost/api/hours/entry-of-another-user", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hours: 1 }),
  }) as NextRequest;
}

function deleteRequest() {
  return new Request("http://localhost/api/hours/entry-of-another-user", {
    method: "DELETE",
  }) as NextRequest;
}

describe("hour route authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ user: { id: "user-1", role: "TEAM" } });
    mocks.findEntry.mockResolvedValue(null);
  });

  it("filtert PATCH op eigenaar voordat reconstructieclassificatie wordt gelezen", async () => {
    const response = await PATCH(patchRequest(), params);

    expect(response.status).toBe(404);
    expect(mocks.findEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "entry-of-another-user", userId: "user-1" },
      }),
    );
    expect(mocks.findAudit).not.toHaveBeenCalled();
  });

  it("filtert DELETE op eigenaar voordat status of reconstructieclassificatie wordt gelezen", async () => {
    const response = await DELETE(deleteRequest(), params);

    expect(response.status).toBe(404);
    expect(mocks.findEntry).toHaveBeenCalledWith({
      where: { id: "entry-of-another-user", userId: "user-1" },
    });
    expect(mocks.findAudit).not.toHaveBeenCalled();
  });

  it("blokkeert verwijderen van een concept dat uit goedgekeurde planning is ontstaan", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
    mocks.findEntry.mockResolvedValue({
      id: "entry-of-another-user",
      status: "DRAFT",
      sourceForecastEntryId: "forecast-1",
      userId: "user-1",
      date: new Date("2026-08-10T00:00:00.000Z"),
      hours: 2,
      description: "Uitgevoerde implementatie",
      workPackageId: "wp-4",
      activityId: "activity-4-2",
      therapistId: null,
      updatedAt: new Date("2026-08-12T10:00:00.000Z"),
    });
    mocks.findAudit.mockResolvedValue(null);

    const response = await DELETE(deleteRequest(), params);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Een concept uit goedgekeurde planning kan worden gecorrigeerd, maar niet verwijderd.",
    });
    expect(mocks.deleteEntries).not.toHaveBeenCalled();
  });

  it("houdt werkpakket en activiteit gekoppeld aan de bronplanning", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
    mocks.findEntry.mockResolvedValue({
      id: "entry-of-another-user",
      status: "DRAFT",
      sourceForecastEntryId: "forecast-1",
      userId: "user-1",
      date: new Date("2026-08-10T00:00:00.000Z"),
      hours: 2,
      description: "Uitgevoerde implementatie",
      workPackageId: "wp-4",
      activityId: "activity-4-2",
      therapistId: null,
      updatedAt: new Date("2026-08-12T10:00:00.000Z"),
      user: { role: "ADMIN", active: true },
    });
    mocks.findAudit.mockResolvedValue(null);

    const request = new Request("http://localhost/api/hours/entry-of-another-user", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workPackageId: "wp-5" }),
    }) as NextRequest;
    const response = await PATCH(request, params);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Gebruik de afgeschermde planningurenroute voor wijzigingen en statusovergangen.",
    });
  });

  it("verwijst iedere wijziging of statusovergang van een planninguur naar de afgeschermde route", async () => {
    mocks.getSession.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
    mocks.findEntry.mockResolvedValue({
      id: "entry-of-another-user",
      status: "DRAFT",
      sourceForecastEntryId: "forecast-1",
      userId: "user-1",
      date: new Date("2026-08-10T00:00:00.000Z"),
      hours: 2,
      description: "Uitgevoerde implementatie",
      workPackageId: "wp-4",
      activityId: "activity-4-2",
      therapistId: null,
      updatedAt: new Date("2026-08-12T10:00:00.000Z"),
      user: { role: "ADMIN", active: true },
    });
    mocks.findAudit.mockResolvedValue(null);

    for (const body of [{ hours: 3 }, { status: "SUBMITTED" }]) {
      const response = await PATCH(new Request("http://localhost/api/hours/entry-of-another-user", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }) as NextRequest, params);
      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toMatchObject({
        error: expect.stringMatching(/afgeschermde planningurenroute/i),
      });
    }
  });
});
