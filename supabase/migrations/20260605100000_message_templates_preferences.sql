ALTER TABLE "Message"
  ADD COLUMN IF NOT EXISTS "assignedToId" TEXT,
  ADD COLUMN IF NOT EXISTS "templateId" TEXT,
  ADD COLUMN IF NOT EXISTS "replyToMessageId" TEXT,
  ADD COLUMN IF NOT EXISTS "threadKey" TEXT,
  ADD COLUMN IF NOT EXISTS "metadata" JSONB;

CREATE TABLE IF NOT EXISTS "MessageTemplate" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "centerId" TEXT,
  "name" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'general',
  "channel" TEXT NOT NULL DEFAULT 'portal',
  "mergeFields" JSONB,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MessageTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "NotificationPreference" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT,
  "role" "UserRole",
  "type" TEXT NOT NULL,
  "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
  "smsEnabled" BOOLEAN NOT NULL DEFAULT false,
  "pushEnabled" BOOLEAN NOT NULL DEFAULT true,
  "quietHours" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Message_assignedToId_fkey') THEN
    ALTER TABLE "Message" ADD CONSTRAINT "Message_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Message_templateId_fkey') THEN
    ALTER TABLE "Message" ADD CONSTRAINT "Message_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "MessageTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Message_replyToMessageId_fkey') THEN
    ALTER TABLE "Message" ADD CONSTRAINT "Message_replyToMessageId_fkey" FOREIGN KEY ("replyToMessageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MessageTemplate_tenantId_fkey') THEN
    ALTER TABLE "MessageTemplate" ADD CONSTRAINT "MessageTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MessageTemplate_centerId_fkey') THEN
    ALTER TABLE "MessageTemplate" ADD CONSTRAINT "MessageTemplate_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "Center"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MessageTemplate_createdById_fkey') THEN
    ALTER TABLE "MessageTemplate" ADD CONSTRAINT "MessageTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'NotificationPreference_tenantId_fkey') THEN
    ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'NotificationPreference_userId_fkey') THEN
    ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Message_familyId_createdAt_idx" ON "Message"("familyId", "createdAt");
CREATE INDEX IF NOT EXISTS "Message_threadKey_createdAt_idx" ON "Message"("threadKey", "createdAt");
CREATE INDEX IF NOT EXISTS "Message_assignedToId_readAt_createdAt_idx" ON "Message"("assignedToId", "readAt", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "MessageTemplate_tenantId_centerId_name_key" ON "MessageTemplate"("tenantId", "centerId", "name");
CREATE INDEX IF NOT EXISTS "MessageTemplate_tenantId_centerId_isActive_idx" ON "MessageTemplate"("tenantId", "centerId", "isActive");
CREATE UNIQUE INDEX IF NOT EXISTS "NotificationPreference_tenantId_userId_type_key" ON "NotificationPreference"("tenantId", "userId", "type");
CREATE UNIQUE INDEX IF NOT EXISTS "NotificationPreference_tenantId_role_type_key" ON "NotificationPreference"("tenantId", "role", "type");
CREATE INDEX IF NOT EXISTS "NotificationPreference_tenantId_role_idx" ON "NotificationPreference"("tenantId", "role");
CREATE INDEX IF NOT EXISTS "NotificationPreference_tenantId_userId_idx" ON "NotificationPreference"("tenantId", "userId");
