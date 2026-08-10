BEGIN;

ALTER TABLE "HourEntry" ADD COLUMN "executionConfirmedAt" TIMESTAMP(3),
ADD COLUMN "isPlannedConcept" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "planningKey" TEXT;

CREATE UNIQUE INDEX "HourEntry_planningKey_key" ON "HourEntry"("planningKey");

COMMIT;
