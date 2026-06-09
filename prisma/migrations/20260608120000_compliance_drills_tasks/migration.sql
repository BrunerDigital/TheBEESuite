CREATE TABLE IF NOT EXISTS "EmergencyDrillLog" (
  "id" TEXT NOT NULL,
  "centerId" TEXT NOT NULL,
  "drillType" TEXT NOT NULL,
  "conductedAt" TIMESTAMP(3) NOT NULL,
  "durationMinutes" INTEGER,
  "participants" TEXT,
  "outcome" TEXT NOT NULL DEFAULT 'completed',
  "notes" TEXT,
  "nextDueAt" TIMESTAMP(3),
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmergencyDrillLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ComplianceTask" (
  "id" TEXT NOT NULL,
  "centerId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'general',
  "priority" TEXT NOT NULL DEFAULT 'normal',
  "status" TEXT NOT NULL DEFAULT 'open',
  "dueAt" TIMESTAMP(3),
  "reminderAt" TIMESTAMP(3),
  "assignedToId" TEXT,
  "createdById" TEXT,
  "relatedResourceType" TEXT,
  "relatedResourceId" TEXT,
  "notes" TEXT,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ComplianceTask_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EmergencyDrillLog_centerId_fkey') THEN
    ALTER TABLE "EmergencyDrillLog" ADD CONSTRAINT "EmergencyDrillLog_centerId_fkey"
      FOREIGN KEY ("centerId") REFERENCES "Center"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EmergencyDrillLog_createdById_fkey') THEN
    ALTER TABLE "EmergencyDrillLog" ADD CONSTRAINT "EmergencyDrillLog_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ComplianceTask_centerId_fkey') THEN
    ALTER TABLE "ComplianceTask" ADD CONSTRAINT "ComplianceTask_centerId_fkey"
      FOREIGN KEY ("centerId") REFERENCES "Center"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ComplianceTask_assignedToId_fkey') THEN
    ALTER TABLE "ComplianceTask" ADD CONSTRAINT "ComplianceTask_assignedToId_fkey"
      FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ComplianceTask_createdById_fkey') THEN
    ALTER TABLE "ComplianceTask" ADD CONSTRAINT "ComplianceTask_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "EmergencyDrillLog_centerId_conductedAt_idx" ON "EmergencyDrillLog"("centerId", "conductedAt");
CREATE INDEX IF NOT EXISTS "EmergencyDrillLog_nextDueAt_idx" ON "EmergencyDrillLog"("nextDueAt");
CREATE INDEX IF NOT EXISTS "ComplianceTask_centerId_status_dueAt_idx" ON "ComplianceTask"("centerId", "status", "dueAt");
CREATE INDEX IF NOT EXISTS "ComplianceTask_assignedToId_status_dueAt_idx" ON "ComplianceTask"("assignedToId", "status", "dueAt");
CREATE INDEX IF NOT EXISTS "ComplianceTask_reminderAt_status_idx" ON "ComplianceTask"("reminderAt", "status");
