ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "subject" TEXT;
ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "body" TEXT;
ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "templateKey" TEXT;
ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "scheduledAt" TIMESTAMP(3);
ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "sentAt" TIMESTAMP(3);
ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "Automation" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;

ALTER TABLE "Survey" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "Survey" ADD COLUMN IF NOT EXISTS "centerId" TEXT;
ALTER TABLE "Survey" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "Survey" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Survey" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "Review" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "Review" ADD COLUMN IF NOT EXISTS "centerId" TEXT;
ALTER TABLE "Review" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'new';
ALTER TABLE "Review" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Review" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS "SurveyResponse" (
  "id" TEXT NOT NULL,
  "surveyId" TEXT NOT NULL,
  "centerId" TEXT,
  "familyId" TEXT,
  "respondentName" TEXT,
  "respondentEmail" TEXT,
  "score" INTEGER NOT NULL,
  "comment" TEXT,
  "responseType" TEXT NOT NULL DEFAULT 'nps',
  "metadata" JSONB,
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SurveyResponse_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Campaign_tenantId_fkey') THEN
    ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Automation_tenantId_fkey') THEN
    ALTER TABLE "Automation" ADD CONSTRAINT "Automation_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Survey_tenantId_fkey') THEN
    ALTER TABLE "Survey" ADD CONSTRAINT "Survey_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Review_tenantId_fkey') THEN
    ALTER TABLE "Review" ADD CONSTRAINT "Review_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Review_centerId_fkey') THEN
    ALTER TABLE "Review" ADD CONSTRAINT "Review_centerId_fkey"
      FOREIGN KEY ("centerId") REFERENCES "Center"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Survey_centerId_fkey') THEN
    ALTER TABLE "Survey" ADD CONSTRAINT "Survey_centerId_fkey"
      FOREIGN KEY ("centerId") REFERENCES "Center"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SurveyResponse_surveyId_fkey') THEN
    ALTER TABLE "SurveyResponse" ADD CONSTRAINT "SurveyResponse_surveyId_fkey"
      FOREIGN KEY ("surveyId") REFERENCES "Survey"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SurveyResponse_centerId_fkey') THEN
    ALTER TABLE "SurveyResponse" ADD CONSTRAINT "SurveyResponse_centerId_fkey"
      FOREIGN KEY ("centerId") REFERENCES "Center"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SurveyResponse_familyId_fkey') THEN
    ALTER TABLE "SurveyResponse" ADD CONSTRAINT "SurveyResponse_familyId_fkey"
      FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Campaign_brandId_status_scheduledAt_idx" ON "Campaign"("brandId", "status", "scheduledAt");
CREATE INDEX IF NOT EXISTS "Campaign_tenantId_status_scheduledAt_idx" ON "Campaign"("tenantId", "status", "scheduledAt");
CREATE INDEX IF NOT EXISTS "Automation_tenantId_status_idx" ON "Automation"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "Review_tenantId_status_idx" ON "Review"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "Review_centerId_status_idx" ON "Review"("centerId", "status");
CREATE INDEX IF NOT EXISTS "Survey_tenantId_status_idx" ON "Survey"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "Survey_centerId_status_idx" ON "Survey"("centerId", "status");
CREATE INDEX IF NOT EXISTS "SurveyResponse_surveyId_submittedAt_idx" ON "SurveyResponse"("surveyId", "submittedAt");
CREATE INDEX IF NOT EXISTS "SurveyResponse_centerId_submittedAt_idx" ON "SurveyResponse"("centerId", "submittedAt");
CREATE INDEX IF NOT EXISTS "SurveyResponse_familyId_submittedAt_idx" ON "SurveyResponse"("familyId", "submittedAt");
