-- Rebalance the existing operational forecast after the project owner confirmed
-- that physiotherapists take over part of the future practice-management and
-- external-management implementation work. The total end-state remains close
-- to the original total effort while role distribution may differ.
DO $$
DECLARE
  version_id TEXT;
  matched_count INTEGER;
  mismatch_count INTEGER;
BEGIN
  SELECT "id" INTO version_id
  FROM "PlanningVersion"
  WHERE "status" = 'CONCEPT'
  ORDER BY "revision" DESC
  LIMIT 1;

  IF version_id IS NULL THEN
    RETURN;
  END IF;

  CREATE TEMP TABLE forecast_rebalance_target (
    budget_line_key TEXT NOT NULL,
    month_start DATE NOT NULL,
    old_hours DOUBLE PRECISION NOT NULL,
    new_hours DOUBLE PRECISION NOT NULL,
    PRIMARY KEY (budget_line_key, month_start)
  ) ON COMMIT DROP;

  INSERT INTO forecast_rebalance_target (budget_line_key, month_start, old_hours, new_hours) VALUES
    ('PRACTICE_IMPLEMENTATION', '2026-08-01', 8, 5),
    ('PRACTICE_IMPLEMENTATION', '2026-09-01', 14, 8),
    ('PRACTICE_IMPLEMENTATION', '2026-10-01', 15, 8),
    ('PRACTICE_IMPLEMENTATION', '2026-11-01', 15, 8),
    ('PRACTICE_IMPLEMENTATION', '2026-12-01', 14, 8),
    ('PRACTICE_IMPLEMENTATION', '2027-01-01', 17, 10),
    ('PRACTICE_IMPLEMENTATION', '2027-02-01', 16, 8),
    ('PRACTICE_IMPLEMENTATION', '2027-03-01', 10, 5),
    ('PRACTICE_IMPLEMENTATION', '2027-04-01', 9, 5),
    ('PRACTICE_IMPLEMENTATION', '2027-05-01', 8, 4),
    ('PRACTICE_IMPLEMENTATION', '2027-06-01', 5, 3),
    ('PRACTICE_IMPLEMENTATION', '2027-07-01', 3, 2),
    ('PRACTICE_IMPLEMENTATION', '2027-08-01', 3, 3),
    ('EXTERNAL_PROJECT_MANAGEMENT', '2026-08-01', 6, 5),
    ('EXTERNAL_PROJECT_MANAGEMENT', '2026-09-01', 11, 7),
    ('EXTERNAL_PROJECT_MANAGEMENT', '2026-10-01', 12, 8),
    ('EXTERNAL_PROJECT_MANAGEMENT', '2026-11-01', 12, 8),
    ('EXTERNAL_PROJECT_MANAGEMENT', '2026-12-01', 11.5, 7.5),
    ('EXTERNAL_PROJECT_MANAGEMENT', '2027-01-01', 13, 8),
    ('EXTERNAL_PROJECT_MANAGEMENT', '2027-02-01', 13, 8),
    ('EXTERNAL_PROJECT_MANAGEMENT', '2027-03-01', 9, 5),
    ('EXTERNAL_PROJECT_MANAGEMENT', '2027-04-01', 8, 4),
    ('EXTERNAL_PROJECT_MANAGEMENT', '2027-05-01', 6, 3),
    ('EXTERNAL_PROJECT_MANAGEMENT', '2027-06-01', 3, 2),
    ('EXTERNAL_PROJECT_MANAGEMENT', '2027-07-01', 2, 2),
    ('EXTERNAL_PROJECT_MANAGEMENT', '2027-08-01', 1, 1),
    ('INTERNAL_TRAINER', '2026-08-01', 6, 6),
    ('INTERNAL_TRAINER', '2026-09-01', 8, 7),
    ('INTERNAL_TRAINER', '2026-10-01', 6, 5);

  SELECT COUNT(*) INTO matched_count
  FROM "MonthlyPlanAllocation" allocation
  JOIN forecast_rebalance_target target
    ON target.budget_line_key = allocation."budgetLineKey"
   AND target.month_start = allocation."monthStart"::date
  WHERE allocation."planningVersionId" = version_id
    AND allocation."sourceState" = 'OPERATIONAL_FORECAST';

  IF matched_count <> (SELECT COUNT(*) FROM forecast_rebalance_target) THEN
    RAISE EXCEPTION 'Forecast rebalance aborted: expected % target allocations, found %.',
      (SELECT COUNT(*) FROM forecast_rebalance_target), matched_count;
  END IF;

  SELECT COUNT(*) INTO mismatch_count
  FROM "MonthlyPlanAllocation" allocation
  JOIN forecast_rebalance_target target
    ON target.budget_line_key = allocation."budgetLineKey"
   AND target.month_start = allocation."monthStart"::date
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(entry."plannedHours"), 0)::DOUBLE PRECISION AS detail_hours
    FROM "ForecastEntry" entry
    WHERE entry."allocationId" = allocation."id"
  ) details ON TRUE
  WHERE allocation."planningVersionId" = version_id
    AND (
      ABS(allocation."plannedHours" - target.old_hours) > 0.001
      OR ABS(details.detail_hours - target.old_hours) > 0.001
      OR target.new_hours > target.old_hours
    );

  IF mismatch_count > 0 THEN
    RAISE EXCEPTION 'Forecast rebalance aborted: % target allocations differ from the expected source state.', mismatch_count;
  END IF;

  WITH ranked_entries AS (
    SELECT
      entry."id",
      entry."plannedHours" AS entry_hours,
      (target.old_hours - target.new_hours) AS reduction_hours,
      COALESCE(
        SUM(entry."plannedHours") OVER (
          PARTITION BY allocation."id"
          ORDER BY entry."plannedDate" DESC, entry."id" DESC
          ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
        ),
        0
      )::DOUBLE PRECISION AS later_entry_hours
    FROM "ForecastEntry" entry
    JOIN "MonthlyPlanAllocation" allocation ON allocation."id" = entry."allocationId"
    JOIN forecast_rebalance_target target
      ON target.budget_line_key = allocation."budgetLineKey"
     AND target.month_start = allocation."monthStart"::date
    WHERE allocation."planningVersionId" = version_id
  )
  UPDATE "ForecastEntry" entry
  SET
    "plannedHours" = entry."plannedHours" - LEAST(
      ranked.entry_hours,
      GREATEST(0, ranked.reduction_hours - ranked.later_entry_hours)
    ),
    "updatedAt" = CURRENT_TIMESTAMP
  FROM ranked_entries ranked
  WHERE entry."id" = ranked."id";

  DELETE FROM "ForecastEntry"
  WHERE "allocationId" IN (
    SELECT allocation."id"
    FROM "MonthlyPlanAllocation" allocation
    JOIN forecast_rebalance_target target
      ON target.budget_line_key = allocation."budgetLineKey"
     AND target.month_start = allocation."monthStart"::date
    WHERE allocation."planningVersionId" = version_id
  )
  AND "plannedHours" <= 0.001;

  UPDATE "MonthlyPlanAllocation" allocation
  SET
    "plannedHours" = target.new_hours,
    "reviewState" = 'DRAFT',
    "updatedAt" = CURRENT_TIMESTAMP
  FROM forecast_rebalance_target target
  WHERE allocation."planningVersionId" = version_id
    AND allocation."budgetLineKey" = target.budget_line_key
    AND allocation."monthStart"::date = target.month_start;

  SELECT COUNT(*) INTO mismatch_count
  FROM "MonthlyPlanAllocation" allocation
  JOIN forecast_rebalance_target target
    ON target.budget_line_key = allocation."budgetLineKey"
   AND target.month_start = allocation."monthStart"::date
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(entry."plannedHours"), 0)::DOUBLE PRECISION AS detail_hours
    FROM "ForecastEntry" entry
    WHERE entry."allocationId" = allocation."id"
  ) details ON TRUE
  WHERE allocation."planningVersionId" = version_id
    AND (
      ABS(allocation."plannedHours" - target.new_hours) > 0.001
      OR ABS(details.detail_hours - target.new_hours) > 0.001
    );

  IF mismatch_count > 0 THEN
    RAISE EXCEPTION 'Forecast rebalance failed: % allocation/detail totals do not match after update.', mismatch_count;
  END IF;

  INSERT INTO "AuditEvent" (
    "id", "entityType", "entityId", "action", "reason", "beforeData", "afterData", "createdAt"
  ) VALUES (
    'rebalance_' || md5(version_id || clock_timestamp()::text),
    'PlanningVersion',
    version_id,
    'REBALANCED_OPERATIONAL_FORECAST',
    'Besluit projecteigenaar 11 augustus 2026: fysiotherapeuten nemen meer implementatiewerk over van praktijkmanagement en externe projectleiding; de totale eindinzet blijft ongeveer op de oorspronkelijke projectomvang.',
    jsonb_build_object('forecastHours', 497.5, 'distribution', 'original remaining role distribution'),
    jsonb_build_object('forecastHours', 396.5, 'distribution', 'confirmed operational role redistribution'),
    CURRENT_TIMESTAMP
  );
END $$;
