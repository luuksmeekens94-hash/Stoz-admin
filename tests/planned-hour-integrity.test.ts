import { describe, expect, it } from "vitest";
import { buildReviewedForecastHourReview } from "@/lib/planned-hour-integrity";

const source = {
  id: "forecast-1",
  plannedDate: new Date("2026-08-10T00:00:00.000Z"),
  executorName: "Luuk Smeekens",
  plannedHours: 3,
};
const creation = {
  action: "MATERIALIZED_REVIEWED_FORECAST",
  reason: "Agenda en implementatienotitie van 10 augustus 2026.",
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

describe("planninguurintegriteit", () => {
  it("vereist exact één creatie-audit die overeenkomt met de bronforecast", () => {
    expect(buildReviewedForecastHourReview({
      sourceForecastEntryId: "forecast-1",
      sourceForecast: source,
      audits: [creation],
      actorNameById: new Map(),
    }).integrity).toBe("VALID");
    expect(buildReviewedForecastHourReview({
      sourceForecastEntryId: "forecast-1",
      sourceForecast: source,
      audits: [creation, { ...creation }],
      actorNameById: new Map(),
    }).integrity).toBe("INVALID");
    expect(buildReviewedForecastHourReview({
      sourceForecastEntryId: "forecast-1",
      sourceForecast: { ...source, plannedHours: 4 },
      audits: [creation],
      actorNameById: new Map(),
    }).integrity).toBe("INVALID");
  });

  it("promoveert alleen een complete latere correctie tot actuele bronverwijzing", () => {
    const result = buildReviewedForecastHourReview({
      sourceForecastEntryId: "forecast-1",
      sourceForecast: source,
      audits: [
        creation,
        {
          action: "CORRECTED_REVIEWED_FORECAST_HOUR",
          reason: "Werkelijke duur aangepast na broncontrole.",
          actorUserId: "admin-1",
          createdAt: new Date("2026-08-12T10:00:00.000Z"),
          beforeData: {},
          afterData: {
            sourceReference: "Definitieve agenda en implementatienotitie van 11 augustus 2026.",
            performedConfirmation: true,
          },
        },
      ],
      actorNameById: new Map([["admin-1", "Beheerder"]]),
    });
    expect(result).toMatchObject({
      integrity: "VALID",
      sourceReference: "Definitieve agenda en implementatienotitie van 11 augustus 2026.",
    });
  });
});