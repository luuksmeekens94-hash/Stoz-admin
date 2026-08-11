UPDATE "MonthlyPlanAllocation"
SET "sourceState" = 'OPERATIONAL_FORECAST'
WHERE "sourceState" = 'APPROVED_REMAINING';
