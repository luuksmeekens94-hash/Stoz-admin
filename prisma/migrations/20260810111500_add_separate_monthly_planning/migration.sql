BEGIN;

CREATE TYPE "PlanningVersionStatus" AS ENUM ('CONCEPT', 'ARCHIVED');
CREATE TYPE "PlanningSourceStatus" AS ENUM ('RECONSTRUCTED_PENDING_APPROVED_XLSX', 'FORMALLY_CONFIRMED');
CREATE TYPE "PlanningReviewState" AS ENUM ('DRAFT', 'REVIEWED');
CREATE TYPE "PlanningAllocationSourceState" AS ENUM ('APPROVED_REMAINING', 'OUTSIDE_APPROVED_QUANTITY', 'DECISION_REQUIRED');

CREATE TABLE "PlanningVersion" (
  "id" TEXT NOT NULL,
  "revision" INTEGER NOT NULL,
  "status" "PlanningVersionStatus" NOT NULL DEFAULT 'CONCEPT',
  "sourceStatus" "PlanningSourceStatus" NOT NULL,
  "sourceReference" TEXT NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlanningVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MonthlyPlanAllocation" (
  "id" TEXT NOT NULL,
  "planningVersionId" TEXT NOT NULL,
  "monthStart" TIMESTAMP(3) NOT NULL,
  "budgetLineKey" TEXT NOT NULL,
  "roleCategory" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "workPackageId" TEXT NOT NULL,
  "activityId" TEXT NOT NULL,
  "plannedHours" DOUBLE PRECISION NOT NULL,
  "rationale" TEXT NOT NULL,
  "sourceState" "PlanningAllocationSourceState" NOT NULL,
  "reviewState" "PlanningReviewState" NOT NULL DEFAULT 'DRAFT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MonthlyPlanAllocation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlanningVersion_revision_key" ON "PlanningVersion"("revision");
CREATE INDEX "PlanningVersion_status_idx" ON "PlanningVersion"("status");
CREATE INDEX "PlanningVersion_createdById_idx" ON "PlanningVersion"("createdById");
CREATE INDEX "MonthlyPlanAllocation_planningVersionId_idx" ON "MonthlyPlanAllocation"("planningVersionId");
CREATE INDEX "MonthlyPlanAllocation_monthStart_idx" ON "MonthlyPlanAllocation"("monthStart");
CREATE UNIQUE INDEX "MonthlyPlanAllocation_planningVersionId_monthStart_budgetLi_key" ON "MonthlyPlanAllocation"("planningVersionId", "monthStart", "budgetLineKey", "workPackageId", "activityId");

ALTER TABLE "PlanningVersion" ADD CONSTRAINT "PlanningVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MonthlyPlanAllocation" ADD CONSTRAINT "MonthlyPlanAllocation_planningVersionId_fkey" FOREIGN KEY ("planningVersionId") REFERENCES "PlanningVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MonthlyPlanAllocation" ADD CONSTRAINT "MonthlyPlanAllocation_workPackageId_fkey" FOREIGN KEY ("workPackageId") REFERENCES "WorkPackage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MonthlyPlanAllocation" ADD CONSTRAINT "MonthlyPlanAllocation_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
