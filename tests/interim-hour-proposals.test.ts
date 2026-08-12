import { describe, expect, it } from "vitest";
import {
  parseInterimProposalRequest,
  validateInterimProposalRequest,
} from "@/lib/interim-hour-proposals";
import { buildInterimHoursSteering } from "@/lib/interim-hour-steering";

const current = buildInterimHoursSteering([
  { budgetCategory: "Praktijkmanager", workPackageCode: "WP1", activityCode: "A1.1", hours: 172 },
  { budgetCategory: "Praktijkmanager", workPackageCode: "WP2", activityCode: "A2.2", hours: 8 },
  { budgetCategory: "Praktijkmanager", workPackageCode: "WP3", activityCode: "A3.1", hours: 2 },
  { budgetCategory: "Extern adviseur", workPackageCode: "WP1", activityCode: "A1.1", hours: 97 },
  { budgetCategory: "Extern adviseur", workPackageCode: "WP2", activityCode: "A2.2", hours: 120.5 },
  { budgetCategory: "Fysiotherapeuten", workPackageCode: "WP2", activityCode: "A2.2", hours: 68 },
  { budgetCategory: "Fysiotherapeuten", workPackageCode: "WP3", activityCode: "A3.1", hours: 28 },
  { budgetCategory: "Websitebouwer", workPackageCode: "WP2", activityCode: "A2.1", hours: 56 },
]);

const valid = {
  requestId: "123e4567-e89b-42d3-a456-426614174000",
  asOf: "2026-08-12",
  proposals: current.proposals,
};

describe("aanvulvoorstelset", () => {
  it("accepteert alleen de actuele, volledige ontbrekende scopes", () => {
    const parsed = parseInterimProposalRequest(valid);
    expect(validateInterimProposalRequest(parsed, current).proposals).toEqual(current.proposals);
  });

  it("weigert gemanipuleerde uren en een onvolledige set", () => {
    expect(() => validateInterimProposalRequest({
      ...valid,
      proposals: [{ ...valid.proposals[0], proposedHours: 99 }],
    }, current)).toThrow(/niet meer actueel/i);
  });

  it("weigert onbekende velden", () => {
    expect(() => parseInterimProposalRequest({ ...valid, createHourEntries: true })).toThrow(/onbekend veld/i);
  });
});
