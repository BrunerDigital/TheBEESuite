ALTER TABLE "Center"
ADD COLUMN "crmLocationId" TEXT,
ADD COLUMN "locationId" TEXT,
ADD COLUMN "city" TEXT,
ADD COLUMN "state" TEXT,
ADD COLUMN "postalCode" TEXT,
ADD COLUMN "email" TEXT,
ADD COLUMN "status" TEXT NOT NULL DEFAULT 'active',
ADD COLUMN "sourceSystem" TEXT,
ADD COLUMN "externalId" TEXT,
ADD COLUMN "customFields" JSONB;

ALTER TABLE "Lead"
ADD COLUMN "externalId" TEXT,
ADD COLUMN "parentFirstName" TEXT,
ADD COLUMN "parentLastName" TEXT,
ADD COLUMN "email" TEXT,
ADD COLUMN "phone" TEXT;

CREATE INDEX "Center_crmLocationId_idx" ON "Center"("crmLocationId");
CREATE INDEX "Center_locationId_idx" ON "Center"("locationId");
CREATE INDEX "Center_state_city_idx" ON "Center"("state", "city");
CREATE UNIQUE INDEX "Lead_centerId_externalId_key" ON "Lead"("centerId", "externalId");
CREATE INDEX "Lead_centerId_stage_idx" ON "Lead"("centerId", "stage");
CREATE INDEX "Lead_email_idx" ON "Lead"("email");
CREATE INDEX "Lead_createdAt_idx" ON "Lead"("createdAt");
