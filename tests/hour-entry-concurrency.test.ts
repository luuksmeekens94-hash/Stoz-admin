import { describe, expect, it } from "vitest";
import {
  HourEntryConcurrencyError,
  assertHourEntryCasUpdated,
  buildHourEntryBulkCasWhere,
  buildHourEntryCasWhere,
} from "@/lib/hour-entry-concurrency";

describe("hour entry compare-and-swap", () => {
  const snapshot = {
    id: "hour-1",
    status: "DRAFT" as const,
    updatedAt: new Date("2026-08-10T10:00:00.000Z"),
  };

  it("verankert iedere mutatie aan id, verwachte status en updatedAt", () => {
    expect(buildHourEntryCasWhere(snapshot)).toEqual({
      id: "hour-1",
      status: "DRAFT",
      updatedAt: new Date("2026-08-10T10:00:00.000Z"),
    });
  });

  it("blokkeert een mutatie zodra de snapshot gelijktijdig is gewijzigd", () => {
    expect(() => assertHourEntryCasUpdated(0)).toThrow(HourEntryConcurrencyError);
    expect(() => assertHourEntryCasUpdated(1)).not.toThrow();
  });

  it("verankert een bulkmutatie per afzonderlijke snapshot en vereist exact alle updates", () => {
    const second = { ...snapshot, id: "hour-2", updatedAt: new Date("2026-08-10T10:01:00.000Z") };
    expect(buildHourEntryBulkCasWhere([snapshot, second])).toEqual({
      OR: [buildHourEntryCasWhere(snapshot), buildHourEntryCasWhere(second)],
    });
    expect(() => assertHourEntryCasUpdated(1, 2)).toThrow(HourEntryConcurrencyError);
    expect(() => assertHourEntryCasUpdated(2, 2)).not.toThrow();
  });
});
