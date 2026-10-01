import { describe, expect, it } from "vitest";
import { shouldShowPlanningApprovalMonth } from "@/lib/planning-approval-visibility";

describe("planning approval visibility", () => {
  it("houdt een achterstallige conceptmaand zichtbaar zodat september alsnog kan worden goedgekeurd", () => {
    expect(shouldShowPlanningApprovalMonth({
      monthKey: "2026-09",
      currentMonth: "2026-10",
      reviewState: "DRAFT",
    })).toBe(true);
  });

  it("verbergt een al goedgekeurde afgelopen planmaand maar toont huidige en toekomstige maanden", () => {
    expect(shouldShowPlanningApprovalMonth({ monthKey: "2026-08", currentMonth: "2026-10", reviewState: "REVIEWED" })).toBe(false);
    expect(shouldShowPlanningApprovalMonth({ monthKey: "2026-10", currentMonth: "2026-10", reviewState: "REVIEWED" })).toBe(true);
    expect(shouldShowPlanningApprovalMonth({ monthKey: "2026-11", currentMonth: "2026-10", reviewState: "DRAFT" })).toBe(true);
  });
});
