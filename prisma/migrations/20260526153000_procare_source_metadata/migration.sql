ALTER TABLE "Classroom"
ADD COLUMN IF NOT EXISTS "sourceSystem" TEXT,
ADD COLUMN IF NOT EXISTS "externalId" TEXT,
ADD COLUMN IF NOT EXISTS "customFields" JSONB;

ALTER TABLE "Family"
ADD COLUMN IF NOT EXISTS "sourceSystem" TEXT,
ADD COLUMN IF NOT EXISTS "externalId" TEXT,
ADD COLUMN IF NOT EXISTS "customFields" JSONB;

ALTER TABLE "Guardian"
ADD COLUMN IF NOT EXISTS "sourceSystem" TEXT,
ADD COLUMN IF NOT EXISTS "externalId" TEXT,
ADD COLUMN IF NOT EXISTS "customFields" JSONB;

ALTER TABLE "Child"
ADD COLUMN IF NOT EXISTS "sourceSystem" TEXT,
ADD COLUMN IF NOT EXISTS "externalId" TEXT,
ADD COLUMN IF NOT EXISTS "customFields" JSONB;

ALTER TABLE "AuthorizedPickup"
ADD COLUMN IF NOT EXISTS "sourceSystem" TEXT,
ADD COLUMN IF NOT EXISTS "externalId" TEXT,
ADD COLUMN IF NOT EXISTS "customFields" JSONB;

ALTER TABLE "EmergencyContact"
ADD COLUMN IF NOT EXISTS "sourceSystem" TEXT,
ADD COLUMN IF NOT EXISTS "externalId" TEXT,
ADD COLUMN IF NOT EXISTS "customFields" JSONB;

ALTER TABLE "StaffProfile"
ADD COLUMN IF NOT EXISTS "sourceSystem" TEXT,
ADD COLUMN IF NOT EXISTS "externalId" TEXT,
ADD COLUMN IF NOT EXISTS "customFields" JSONB;

ALTER TABLE "BillingAccount"
ADD COLUMN IF NOT EXISTS "sourceSystem" TEXT,
ADD COLUMN IF NOT EXISTS "externalId" TEXT,
ADD COLUMN IF NOT EXISTS "customFields" JSONB;

ALTER TABLE "Invoice"
ADD COLUMN IF NOT EXISTS "sourceSystem" TEXT,
ADD COLUMN IF NOT EXISTS "externalId" TEXT,
ADD COLUMN IF NOT EXISTS "customFields" JSONB;

ALTER TABLE "AttendanceRecord"
ADD COLUMN IF NOT EXISTS "sourceSystem" TEXT,
ADD COLUMN IF NOT EXISTS "externalId" TEXT,
ADD COLUMN IF NOT EXISTS "metadata" JSONB;

ALTER TABLE "CheckInOutLog"
ADD COLUMN IF NOT EXISTS "sourceSystem" TEXT,
ADD COLUMN IF NOT EXISTS "externalId" TEXT,
ADD COLUMN IF NOT EXISTS "metadata" JSONB;

CREATE INDEX IF NOT EXISTS "Classroom_centerId_sourceSystem_externalId_idx" ON "Classroom"("centerId", "sourceSystem", "externalId");
CREATE INDEX IF NOT EXISTS "Family_centerId_sourceSystem_externalId_idx" ON "Family"("centerId", "sourceSystem", "externalId");
CREATE INDEX IF NOT EXISTS "Guardian_sourceSystem_externalId_idx" ON "Guardian"("sourceSystem", "externalId");
CREATE INDEX IF NOT EXISTS "Child_sourceSystem_externalId_idx" ON "Child"("sourceSystem", "externalId");
CREATE INDEX IF NOT EXISTS "AuthorizedPickup_sourceSystem_externalId_idx" ON "AuthorizedPickup"("sourceSystem", "externalId");
CREATE INDEX IF NOT EXISTS "EmergencyContact_sourceSystem_externalId_idx" ON "EmergencyContact"("sourceSystem", "externalId");
CREATE INDEX IF NOT EXISTS "StaffProfile_centerId_sourceSystem_externalId_idx" ON "StaffProfile"("centerId", "sourceSystem", "externalId");
CREATE INDEX IF NOT EXISTS "BillingAccount_sourceSystem_externalId_idx" ON "BillingAccount"("sourceSystem", "externalId");
CREATE INDEX IF NOT EXISTS "Invoice_sourceSystem_externalId_idx" ON "Invoice"("sourceSystem", "externalId");
CREATE INDEX IF NOT EXISTS "AttendanceRecord_sourceSystem_externalId_idx" ON "AttendanceRecord"("sourceSystem", "externalId");
CREATE INDEX IF NOT EXISTS "AttendanceRecord_classroomId_date_idx" ON "AttendanceRecord"("classroomId", "date");
CREATE INDEX IF NOT EXISTS "CheckInOutLog_sourceSystem_externalId_idx" ON "CheckInOutLog"("sourceSystem", "externalId");
