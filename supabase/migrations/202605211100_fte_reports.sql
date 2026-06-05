-- Weekly FTE reporting submitted from The BEE Suite.
CREATE TABLE IF NOT EXISTS "FteReport" (
  "id" TEXT NOT NULL,
  "centerId" TEXT NOT NULL,
  "submittedById" TEXT,
  "weekStart" TIMESTAMP(3) NOT NULL,
  "weekEnd" TIMESTAMP(3),
  "enrolledCount" INTEGER NOT NULL DEFAULT 0,
  "fullTimeCount" INTEGER NOT NULL DEFAULT 0,
  "partTimeCount" INTEGER NOT NULL DEFAULT 0,
  "fteCount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "infants" INTEGER NOT NULL DEFAULT 0,
  "toddlers" INTEGER NOT NULL DEFAULT 0,
  "twos" INTEGER NOT NULL DEFAULT 0,
  "preschool" INTEGER NOT NULL DEFAULT 0,
  "preK" INTEGER NOT NULL DEFAULT 0,
  "schoolAge" INTEGER NOT NULL DEFAULT 0,
  "notes" TEXT,
  "status" TEXT NOT NULL DEFAULT 'submitted',
  "source" TEXT NOT NULL DEFAULT 'manual',
  "sourceMetadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FteReport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "FteReport_centerId_weekStart_key" ON "FteReport"("centerId", "weekStart");
CREATE INDEX IF NOT EXISTS "FteReport_weekStart_idx" ON "FteReport"("weekStart");
CREATE INDEX IF NOT EXISTS "FteReport_status_idx" ON "FteReport"("status");

DO $$ BEGIN
  ALTER TABLE "FteReport" ADD CONSTRAINT "FteReport_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "Center"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "FteReport" ADD CONSTRAINT "FteReport_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
