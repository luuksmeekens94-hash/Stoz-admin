BEGIN;

CREATE TYPE "SurveyCampaignStatus" AS ENUM ('DRAFT', 'ACTIVE', 'CLOSED');
CREATE TYPE "SurveyTemplateCode" AS ENUM ('THERAPIST_BASELINE');
CREATE TYPE "SurveyDeliveryStatus" AS ENUM ('PREPARED', 'SENT', 'FAILED');

CREATE TABLE "SurveyCampaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "templateCode" "SurveyTemplateCode" NOT NULL DEFAULT 'THERAPIST_BASELINE',
    "status" "SurveyCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "closesAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SurveyCampaign_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SurveyInvitation" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "therapistId" TEXT,
    "recipientName" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "tokenHash" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SurveyInvitation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SurveyDelivery" (
    "id" TEXT NOT NULL,
    "invitationId" TEXT NOT NULL,
    "status" "SurveyDeliveryStatus" NOT NULL,
    "provider" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "failureCode" TEXT,
    "failureMessage" TEXT,
    CONSTRAINT "SurveyDelivery_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SurveyResponse" (
    "id" TEXT NOT NULL,
    "invitationId" TEXT NOT NULL,
    "answers" JSONB NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SurveyResponse_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "beforeData" JSONB,
    "afterData" JSONB,
    "actorUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SurveyCampaign_status_idx" ON "SurveyCampaign"("status");
CREATE INDEX "SurveyCampaign_createdById_idx" ON "SurveyCampaign"("createdById");
CREATE UNIQUE INDEX "SurveyInvitation_tokenHash_key" ON "SurveyInvitation"("tokenHash");
CREATE INDEX "SurveyInvitation_campaignId_idx" ON "SurveyInvitation"("campaignId");
CREATE INDEX "SurveyInvitation_therapistId_idx" ON "SurveyInvitation"("therapistId");
CREATE INDEX "SurveyInvitation_expiresAt_idx" ON "SurveyInvitation"("expiresAt");
CREATE UNIQUE INDEX "SurveyInvitation_campaignId_recipientEmail_key" ON "SurveyInvitation"("campaignId", "recipientEmail");
CREATE INDEX "SurveyDelivery_invitationId_idx" ON "SurveyDelivery"("invitationId");
CREATE INDEX "SurveyDelivery_status_idx" ON "SurveyDelivery"("status");
CREATE UNIQUE INDEX "SurveyResponse_invitationId_key" ON "SurveyResponse"("invitationId");
CREATE INDEX "AuditEvent_entityType_entityId_idx" ON "AuditEvent"("entityType", "entityId");
CREATE INDEX "AuditEvent_createdAt_idx" ON "AuditEvent"("createdAt");

ALTER TABLE "SurveyCampaign" ADD CONSTRAINT "SurveyCampaign_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SurveyInvitation" ADD CONSTRAINT "SurveyInvitation_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "SurveyCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SurveyInvitation" ADD CONSTRAINT "SurveyInvitation_therapistId_fkey" FOREIGN KEY ("therapistId") REFERENCES "Therapist"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SurveyDelivery" ADD CONSTRAINT "SurveyDelivery_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "SurveyInvitation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SurveyResponse" ADD CONSTRAINT "SurveyResponse_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "SurveyInvitation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
