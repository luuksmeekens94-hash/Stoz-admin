BEGIN;

CREATE TABLE "InterimHourProposalSet" (
  "id" TEXT NOT NULL,
  "requestKey" TEXT NOT NULL,
  "requestFingerprint" TEXT NOT NULL,
  "asOf" DATE NOT NULL,
  "calculationVersion" TEXT NOT NULL,
  "sourceReference" TEXT NOT NULL,
  "attestedById" TEXT NOT NULL,
  "attestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InterimHourProposalSet_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InterimHourProposal" (
  "id" TEXT NOT NULL,
  "proposalSetId" TEXT NOT NULL,
  "budgetLineKey" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "workPackageId" TEXT NOT NULL,
  "activityId" TEXT NOT NULL,
  "targetQuarters" INTEGER NOT NULL,
  "registeredBaselineQuarters" INTEGER NOT NULL,
  "proposedQuarters" INTEGER NOT NULL,
  "rationale" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InterimHourProposal_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InterimHourProposal_quarter_totals_check" CHECK (
    "targetQuarters" >= 0 AND
    "registeredBaselineQuarters" >= 0 AND
    "proposedQuarters" > 0 AND
    "registeredBaselineQuarters" + "proposedQuarters" = "targetQuarters"
  )
);

ALTER TABLE "HourEntry" ADD COLUMN "historicalProposalId" TEXT;

CREATE INDEX "InterimHourProposalSet_asOf_idx" ON "InterimHourProposalSet"("asOf");
CREATE INDEX "InterimHourProposalSet_attestedById_idx" ON "InterimHourProposalSet"("attestedById");
CREATE UNIQUE INDEX "InterimHourProposalSet_attestedById_requestKey_key" ON "InterimHourProposalSet"("attestedById", "requestKey");
CREATE UNIQUE INDEX "InterimHourProposalSet_asOf_calculationVersion_key" ON "InterimHourProposalSet"("asOf", "calculationVersion");
CREATE UNIQUE INDEX "InterimHourProposal_proposalSetId_budgetLineKey_workPackage_key" ON "InterimHourProposal"("proposalSetId", "budgetLineKey", "workPackageId", "activityId");
CREATE INDEX "InterimHourProposal_proposalSetId_idx" ON "InterimHourProposal"("proposalSetId");
CREATE INDEX "InterimHourProposal_workPackageId_idx" ON "InterimHourProposal"("workPackageId");
CREATE INDEX "InterimHourProposal_activityId_idx" ON "InterimHourProposal"("activityId");
CREATE INDEX "HourEntry_historicalProposalId_idx" ON "HourEntry"("historicalProposalId");

ALTER TABLE "InterimHourProposalSet" ADD CONSTRAINT "InterimHourProposalSet_attestedById_fkey" FOREIGN KEY ("attestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InterimHourProposal" ADD CONSTRAINT "InterimHourProposal_proposalSetId_fkey" FOREIGN KEY ("proposalSetId") REFERENCES "InterimHourProposalSet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InterimHourProposal" ADD CONSTRAINT "InterimHourProposal_workPackageId_fkey" FOREIGN KEY ("workPackageId") REFERENCES "WorkPackage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InterimHourProposal" ADD CONSTRAINT "InterimHourProposal_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "HourEntry" ADD CONSTRAINT "HourEntry_historicalProposalId_fkey" FOREIGN KEY ("historicalProposalId") REFERENCES "InterimHourProposal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;