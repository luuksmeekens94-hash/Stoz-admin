BEGIN;

CREATE TABLE "ForecastEntry" (
  "id" TEXT NOT NULL,
  "allocationId" TEXT NOT NULL,
  "plannedDate" DATE NOT NULL,
  "executorName" TEXT NOT NULL,
  "plannedHours" DOUBLE PRECISION NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ForecastEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ForecastEntry_allocationId_plannedDate_executorName_key"
  ON "ForecastEntry"("allocationId", "plannedDate", "executorName");
CREATE INDEX "ForecastEntry_plannedDate_idx" ON "ForecastEntry"("plannedDate");
CREATE INDEX "ForecastEntry_executorName_idx" ON "ForecastEntry"("executorName");

ALTER TABLE "ForecastEntry"
  ADD CONSTRAINT "ForecastEntry_allocationId_fkey"
  FOREIGN KEY ("allocationId") REFERENCES "MonthlyPlanAllocation"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
