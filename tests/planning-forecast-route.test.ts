import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  transaction: vi.fn(),
  findAllocation: vi.fn(),
  findForecast: vi.fn(),
  aggregateForecast: vi.fn(),
  createForecast: vi.fn(),
  updateForecast: vi.fn(),
  updateAllocation: vi.fn(),
  createAudit: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: mocks.transaction } }));

import { POST } from "@/app/api/planning/forecast/route";

const tx = {
  monthlyPlanAllocation: {
    findUnique: mocks.findAllocation,
    update: mocks.updateAllocation,
  },
  forecastEntry: {
    findFirst: mocks.findForecast,
    aggregate: mocks.aggregateForecast,
    create: mocks.createForecast,
    update: mocks.updateForecast,
  },
  auditEvent: { create: mocks.createAudit },
};

function post(body: string) {
  return new Request("http://localhost/api/planning/forecast", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

const validBody = {
  allocationId: "allocation-1",
  plannedDate: "2026-09-10",
  executorName: "Testuitvoerder",
  plannedHours: 2,
  note: "Voorbereiding implementatie",
};

describe("forecast planning route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
    mocks.transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx));
    mocks.findAllocation.mockResolvedValue({
      id: "allocation-1",
      plannedHours: 10,
      reviewState: "DRAFT",
      monthStart: new Date("2026-09-01T00:00:00.000Z"),
      planningVersion: {
        status: "CONCEPT",
        periodStart: new Date("2026-08-01T00:00:00.000Z"),
        periodEnd: new Date("2027-08-31T23:59:59.999Z"),
      },
    });
    mocks.findForecast.mockResolvedValue(null);
    mocks.aggregateForecast.mockImplementation(({ where }: { where: Record<string, unknown> }) =>
      Promise.resolve({ _sum: { plannedHours: "allocationId" in where ? 10 : 0 } }),
    );
    mocks.createForecast.mockResolvedValue({
      id: "forecast-1",
      allocationId: "allocation-1",
      plannedDate: new Date("2026-09-10T00:00:00.000Z"),
      executorName: "Testuitvoerder",
      plannedHours: 2,
      note: "Voorbereiding implementatie",
    });
    mocks.updateAllocation.mockResolvedValue({ id: "allocation-1" });
    mocks.createAudit.mockResolvedValue({ id: "audit-1" });
  });

  it("weigert ongeldige JSON gecontroleerd", async () => {
    const response = await POST(post("{"));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Ongeldige JSON" });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("blokkeert directe persoonsgegevens in de forecasttoelichting", async () => {
    const response = await POST(
      post(JSON.stringify({ ...validBody, note: "Cliëntnaam: Jan Jansen" })),
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringMatching(/persoonsgegevens/i),
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("vereist dat de datum binnen de gekozen forecastmaand valt", async () => {
    const response = await POST(
      post(JSON.stringify({ ...validBody, plannedDate: "2026-10-10" })),
    );
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Datum moet binnen de gekozen forecastmaand vallen.",
    });
    expect(mocks.createForecast).not.toHaveBeenCalled();
  });

  it("slaat datum, uitvoerder en uren met audit en maandtotaal transactioneel op", async () => {
    const response = await POST(post(JSON.stringify(validBody)));
    expect(response.status).toBe(201);
    expect(mocks.createForecast).toHaveBeenCalledWith({
      data: expect.objectContaining({
        allocationId: "allocation-1",
        plannedDate: new Date("2026-09-10T00:00:00.000Z"),
        executorName: "Testuitvoerder",
        plannedHours: 2,
      }),
    });
    expect(mocks.updateAllocation).toHaveBeenCalledWith({
      where: { id: "allocation-1" },
      data: { plannedHours: 12 },
    });
    expect(mocks.createAudit).toHaveBeenCalledOnce();
  });

  it("voorkomt dat dezelfde uitvoerder boven 24 uur op één datum uitkomt", async () => {
    mocks.findAllocation.mockResolvedValue({
      id: "allocation-1",
      plannedHours: 23,
      reviewState: "DRAFT",
      monthStart: new Date("2026-09-01T00:00:00.000Z"),
      planningVersion: {
        status: "CONCEPT",
        periodStart: new Date("2026-08-01T00:00:00.000Z"),
        periodEnd: new Date("2027-08-31T23:59:59.999Z"),
      },
    });
    mocks.aggregateForecast.mockResolvedValue({ _sum: { plannedHours: 23 } });
    mocks.findForecast.mockResolvedValue({
      id: "forecast-1",
      allocationId: "allocation-1",
      plannedDate: new Date("2026-09-10T00:00:00.000Z"),
      executorName: "Testuitvoerder",
      plannedHours: 23,
      note: null,
    });
    const response = await POST(post(JSON.stringify(validBody)));
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Per uitvoerder kan maximaal 24 uur op één datum worden gepland.",
    });
    expect(mocks.updateForecast).not.toHaveBeenCalled();
    expect(mocks.updateAllocation).not.toHaveBeenCalled();
    expect(mocks.createAudit).not.toHaveBeenCalled();
  });

  it("blokkeert mutatie wanneer detailregels en maandtotaal niet aansluiten", async () => {
    mocks.aggregateForecast.mockResolvedValue({ _sum: { plannedHours: 9.5 } });

    const response = await POST(post(JSON.stringify(validBody)));
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Forecasttotaal is inconsistent; wijziging is geblokkeerd.",
    });
    expect(mocks.createForecast).not.toHaveBeenCalled();
    expect(mocks.updateAllocation).not.toHaveBeenCalled();
    expect(mocks.createAudit).not.toHaveBeenCalled();
  });

  it("blokkeert uren toevoegen aan een forecastregel die al als urenconcept is gebruikt", async () => {
    mocks.findForecast.mockResolvedValue({
      id: "forecast-1",
      allocationId: "allocation-1",
      plannedDate: new Date("2026-09-10T00:00:00.000Z"),
      executorName: "Testuitvoerder",
      plannedHours: 1,
      note: null,
      materializedHourEntry: { id: "hour-1" },
    });

    const response = await POST(post(JSON.stringify(validBody)));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Deze forecastregel is al als urenconcept geregistreerd en kan niet meer worden gewijzigd.",
    });
    expect(mocks.updateForecast).not.toHaveBeenCalled();
    expect(mocks.updateAllocation).not.toHaveBeenCalled();
  });

  it("blokkeert toevoegen nadat de planmaand is goedgekeurd of de versie is gearchiveerd", async () => {
    mocks.findAllocation.mockResolvedValue({
      id: "allocation-1",
      plannedHours: 10,
      reviewState: "REVIEWED",
      monthStart: new Date("2026-09-01T00:00:00.000Z"),
      planningVersion: {
        status: "CONCEPT",
        periodStart: new Date("2026-08-01T00:00:00.000Z"),
        periodEnd: new Date("2027-08-31T23:59:59.999Z"),
      },
    });

    let response = await POST(post(JSON.stringify(validBody)));
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Deze planmaand is goedgekeurd en kan niet meer worden gewijzigd.",
    });

    mocks.findAllocation.mockResolvedValue({
      id: "allocation-1",
      plannedHours: 10,
      reviewState: "DRAFT",
      monthStart: new Date("2026-09-01T00:00:00.000Z"),
      planningVersion: {
        status: "ARCHIVED",
        periodStart: new Date("2026-08-01T00:00:00.000Z"),
        periodEnd: new Date("2027-08-31T23:59:59.999Z"),
      },
    });
    response = await POST(post(JSON.stringify(validBody)));
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Deze planningversie is niet meer wijzigbaar.",
    });
    expect(mocks.createForecast).not.toHaveBeenCalled();
  });

  it("telt dezelfde uitvoerder hoofdletterongevoelig over alle allocaties op de datum mee", async () => {
    mocks.aggregateForecast
      .mockResolvedValueOnce({ _sum: { plannedHours: 10 } })
      .mockResolvedValueOnce({ _sum: { plannedHours: 23 } });

    const response = await POST(post(JSON.stringify({
      ...validBody,
      executorName: "  testuitvoerder  ",
    })));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Per uitvoerder kan maximaal 24 uur op één datum worden gepland.",
    });
    expect(mocks.findForecast).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        allocationId: "allocation-1",
        executorName: { equals: "testuitvoerder", mode: "insensitive" },
      }),
    }));
    expect(mocks.createForecast).not.toHaveBeenCalled();
    expect(mocks.updateAllocation).not.toHaveBeenCalled();
    expect(mocks.createAudit).not.toHaveBeenCalled();
  });
});
