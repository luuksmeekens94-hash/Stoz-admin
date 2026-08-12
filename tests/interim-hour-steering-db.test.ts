import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findProposalSets: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    interimHourProposalSet: { findMany: mocks.findProposalSets },
  },
}));

import {
  INTERIM_CALCULATION_VERSION,
  loadPreparedInterimProposalKeys,
  resolveInterimBudgetCategory,
} from "@/lib/interim-hour-steering-db";

describe("interim steering database mapping", () => {
  beforeEach(() => {
    mocks.findProposalSets.mockReset();
    mocks.findProposalSets.mockResolvedValue([]);
  });

  it("beschouwt alleen voorstelsets van de huidige calculatieversie als klaargezet", async () => {
    await loadPreparedInterimProposalKeys("2026-08-12");

    expect(mocks.findProposalSets).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        asOf: new Date("2026-08-12T00:00:00.000Z"),
        calculationVersion: INTERIM_CALCULATION_VERSION,
      },
    }));
  });

  it("gebruikt de centrale e-mailfallback hoofdletterongevoelig voor iedere uitvoerder", () => {
    expect(resolveInterimBudgetCategory(
      { id: "external-without-allocation", email: "LTROMP@SYMBIOMARKETING.NL" },
      new Map(),
    )).toBe("Websitebouwer");
  });
});
