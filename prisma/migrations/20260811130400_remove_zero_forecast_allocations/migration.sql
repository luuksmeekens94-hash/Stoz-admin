-- Remove legacy zero-hour placeholders. They are not operational forecasts and
-- would otherwise make one-click month approval look incomplete.
DO $$
DECLARE
  version_id TEXT;
  removed_count INTEGER;
BEGIN
  SELECT "id" INTO version_id
  FROM "PlanningVersion"
  WHERE "status" = 'CONCEPT'
  ORDER BY "revision" DESC
  LIMIT 1;

  IF version_id IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "MonthlyPlanAllocation" allocation
    JOIN "ForecastEntry" entry ON entry."allocationId" = allocation."id"
    WHERE allocation."planningVersionId" = version_id
      AND allocation."plannedHours" <= 0
  ) THEN
    RAISE EXCEPTION 'Zero-hour forecast cleanup aborted: a zero-hour allocation still has forecast details.';
  END IF;

  DELETE FROM "MonthlyPlanAllocation"
  WHERE "planningVersionId" = version_id
    AND "plannedHours" <= 0;
  GET DIAGNOSTICS removed_count = ROW_COUNT;

  IF removed_count > 0 THEN
    INSERT INTO "AuditEvent" (
      "id", "entityType", "entityId", "action", "reason", "beforeData", "afterData", "createdAt"
    ) VALUES (
      'zero_cleanup_' || md5(version_id || clock_timestamp()::text),
      'PlanningVersion',
      version_id,
      'REMOVED_ZERO_HOUR_FORECAST_PLACEHOLDERS',
      'Nulregels zonder forecastdetails verwijderd uit de operationele maandplanning.',
      jsonb_build_object('zeroHourAllocationCount', removed_count),
      jsonb_build_object('zeroHourAllocationCount', 0),
      CURRENT_TIMESTAMP
    );
  END IF;
END $$;
