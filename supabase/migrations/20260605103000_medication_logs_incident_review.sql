CREATE TABLE IF NOT EXISTS "MedicationLog" (
  "id" TEXT NOT NULL,
  "childId" TEXT NOT NULL,
  "administeredById" TEXT,
  "medicationName" TEXT NOT NULL,
  "dosage" TEXT NOT NULL,
  "route" TEXT,
  "administeredAt" TIMESTAMP(3) NOT NULL,
  "notes" TEXT,
  "parentNotified" BOOLEAN NOT NULL DEFAULT false,
  "status" TEXT NOT NULL DEFAULT 'administered',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MedicationLog_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MedicationLog_childId_fkey') THEN
    ALTER TABLE "MedicationLog" ADD CONSTRAINT "MedicationLog_childId_fkey"
      FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MedicationLog_administeredById_fkey') THEN
    ALTER TABLE "MedicationLog" ADD CONSTRAINT "MedicationLog_administeredById_fkey"
      FOREIGN KEY ("administeredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "MedicationLog_childId_administeredAt_idx" ON "MedicationLog"("childId", "administeredAt");
CREATE INDEX IF NOT EXISTS "MedicationLog_administeredById_administeredAt_idx" ON "MedicationLog"("administeredById", "administeredAt");
