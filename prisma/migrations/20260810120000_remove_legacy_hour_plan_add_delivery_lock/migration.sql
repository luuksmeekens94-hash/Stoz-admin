BEGIN;

CREATE TYPE "InvoiceVatTreatment" AS ENUM ('PENDING', 'EXCLUDED', 'INCLUDED_CONFIRMED');

ALTER TABLE "Invoice"
ADD COLUMN "confirmedBudgetLineId" TEXT,
ADD COLUMN "vatTreatment" "InvoiceVatTreatment" NOT NULL DEFAULT 'PENDING',
ADD COLUMN "classificationReason" TEXT,
ADD COLUMN "classifiedAt" TIMESTAMP(3),
ADD COLUMN "classifiedById" TEXT;

CREATE INDEX "Invoice_confirmedBudgetLineId_idx" ON "Invoice"("confirmedBudgetLineId");

-- Survey delivery claims prevent concurrent token rotation or duplicate sends.
ALTER TABLE "SurveyInvitation"
ADD COLUMN "deliveryLockedAt" TIMESTAMP(3);

-- The preferred architecture keeps all future planning outside HourEntry.
-- Live verification on 2026-08-10 found zero rows using these transition fields.
DROP INDEX "HourEntry_planningKey_key";
ALTER TABLE "HourEntry"
DROP COLUMN "executionConfirmedAt",
DROP COLUMN "isPlannedConcept",
DROP COLUMN "planningKey";

COMMIT;
