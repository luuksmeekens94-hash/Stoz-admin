BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "MonthlyPlanAllocation" allocation
    LEFT JOIN "ForecastEntry" detail ON detail."allocationId" = allocation."id"
    GROUP BY allocation."id", allocation."plannedHours"
    HAVING COUNT(detail."id") > 0
       AND ABS(COALESCE(SUM(detail."plannedHours"), 0) - allocation."plannedHours") > 0.001
  ) THEN
    RAISE EXCEPTION 'Forecastbackfill geblokkeerd: bestaande detailregels sluiten niet aan op het maandtotaal.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "MonthlyPlanAllocation" allocation
    WHERE allocation."plannedHours" < 0
       OR ABS(allocation."plannedHours" * 4 - ROUND((allocation."plannedHours" * 4)::numeric)::DOUBLE PRECISION) > 0.001
  ) THEN
    RAISE EXCEPTION 'Forecastbackfill geblokkeerd: maandtotalen moeten niet-negatieve kwartieruren zijn.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "MonthlyPlanAllocation" allocation
    WHERE allocation."plannedHours" > 0
      AND NOT EXISTS (
        SELECT 1 FROM "ForecastEntry" detail WHERE detail."allocationId" = allocation."id"
      )
      AND CEIL(allocation."plannedHours" / 24.0) > EXTRACT(
        DAY FROM (DATE_TRUNC('month', allocation."monthStart") + INTERVAL '1 month - 1 day')
      )
  ) THEN
    RAISE EXCEPTION 'Forecastbackfill geblokkeerd: maandtotaal past niet binnen maximaal 24 uur per kalenderdag.';
  END IF;
END $$;

CREATE TEMP TABLE "_ForecastBackfillTouched" (
  "allocationId" TEXT PRIMARY KEY,
  "plannedHours" DOUBLE PRECISION NOT NULL,
  "detailCount" INTEGER NOT NULL
) ON COMMIT DROP;

INSERT INTO "_ForecastBackfillTouched" ("allocationId", "plannedHours", "detailCount")
SELECT
  allocation."id",
  allocation."plannedHours",
  CEIL(allocation."plannedHours" / 24.0)::INTEGER
FROM "MonthlyPlanAllocation" allocation
WHERE allocation."plannedHours" > 0
  AND NOT EXISTS (
    SELECT 1 FROM "ForecastEntry" detail WHERE detail."allocationId" = allocation."id"
  );

INSERT INTO "ForecastEntry" (
  "id",
  "allocationId",
  "plannedDate",
  "executorName",
  "plannedHours",
  "note",
  "createdAt",
  "updatedAt"
)
SELECT
  'forecast-migration-' || MD5(allocation."id" || ':' || part."index"::TEXT),
  allocation."id",
  (allocation."monthStart"::DATE + (part."index" - 1))::DATE,
  COALESCE(NULLIF(BTRIM(allocation."roleCategory"), ''), 'Nog toe te wijzen'),
  LEAST(24.0, allocation."plannedHours" - ((part."index" - 1) * 24.0)),
  'Automatisch gemigreerd uit de bestaande maandallocatie; controleer de uitvoerder vóór uitvoering.',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "MonthlyPlanAllocation" allocation
JOIN "_ForecastBackfillTouched" touched ON touched."allocationId" = allocation."id"
CROSS JOIN LATERAL GENERATE_SERIES(1, touched."detailCount") AS part("index");

INSERT INTO "AuditEvent" (
  "id",
  "entityType",
  "entityId",
  "action",
  "reason",
  "beforeData",
  "afterData",
  "actorUserId",
  "createdAt"
)
SELECT
  'forecast-migration-audit-' || MD5(touched."allocationId"),
  'MonthlyPlanAllocation',
  touched."allocationId",
  'FORECAST_DETAILS_MIGRATED',
  'Bestaand maandtotaal transactioneel gemigreerd naar forecastdetails met verplichte datum, uitvoerder en uren.',
  JSONB_BUILD_OBJECT('plannedHours', touched."plannedHours", 'forecastEntryCount', 0),
  JSONB_BUILD_OBJECT('plannedHours', touched."plannedHours", 'forecastEntryCount', touched."detailCount"),
  NULL,
  CURRENT_TIMESTAMP
FROM "_ForecastBackfillTouched" touched;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "MonthlyPlanAllocation" allocation
    LEFT JOIN "ForecastEntry" detail ON detail."allocationId" = allocation."id"
    GROUP BY allocation."id", allocation."plannedHours"
    HAVING ABS(COALESCE(SUM(detail."plannedHours"), 0) - allocation."plannedHours") > 0.001
  ) THEN
    RAISE EXCEPTION 'Forecastbackfill teruggedraaid: detailregels sluiten na migratie niet aan op het maandtotaal.';
  END IF;
END $$;

COMMIT;
