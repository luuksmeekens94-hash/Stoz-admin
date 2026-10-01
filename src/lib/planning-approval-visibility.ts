export function shouldShowPlanningApprovalMonth(input: {
  monthKey: string;
  currentMonth: string;
  reviewState: "DRAFT" | "REVIEWED";
}) {
  return input.monthKey >= input.currentMonth || input.reviewState === "DRAFT";
}
