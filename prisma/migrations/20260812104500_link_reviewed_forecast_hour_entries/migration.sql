-- Link exactly one materialized draft hour entry to its reviewed forecast detail.
ALTER TABLE "HourEntry" ADD COLUMN "sourceForecastEntryId" TEXT;

CREATE UNIQUE INDEX "HourEntry_sourceForecastEntryId_key"
ON "HourEntry"("sourceForecastEntryId");

ALTER TABLE "HourEntry"
ADD CONSTRAINT "HourEntry_sourceForecastEntryId_fkey"
FOREIGN KEY ("sourceForecastEntryId") REFERENCES "ForecastEntry"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
