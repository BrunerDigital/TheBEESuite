-- Record user-initiated privacy/account deletion requests without destructively
-- removing childcare, billing, safety, custody, or audit records at request time.
CREATE TABLE "DataDeletionRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "centerId" TEXT,
    "familyId" TEXT,
    "guardianId" TEXT,
    "userId" TEXT,
    "requestType" TEXT NOT NULL DEFAULT 'account_deletion',
    "status" TEXT NOT NULL DEFAULT 'pending_verification',
    "source" TEXT NOT NULL DEFAULT 'parent_portal',
    "requesterEmail" TEXT,
    "requesterName" TEXT,
    "details" TEXT,
    "retentionNoticeAccepted" BOOLEAN NOT NULL DEFAULT false,
    "schoolReviewRequired" BOOLEAN NOT NULL DEFAULT true,
    "verifiedAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "deniedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataDeletionRequest_pkey" PRIMARY KEY ("id")
);

-- Keep privacy request records out of the Supabase Data API unless explicitly
-- accessed through the server-side service path.
ALTER TABLE "DataDeletionRequest" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."DataDeletionRequest" FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."DataDeletionRequest" TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'DataDeletionRequest'
      AND policyname = 'internal_service_role_full_access'
  ) THEN
    CREATE POLICY "internal_service_role_full_access" ON public."DataDeletionRequest"
      FOR ALL TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

CREATE INDEX "DataDeletionRequest_tenantId_status_createdAt_idx" ON "DataDeletionRequest"("tenantId", "status", "createdAt");
CREATE INDEX "DataDeletionRequest_userId_status_idx" ON "DataDeletionRequest"("userId", "status");
CREATE INDEX "DataDeletionRequest_guardianId_status_idx" ON "DataDeletionRequest"("guardianId", "status");
CREATE INDEX "DataDeletionRequest_familyId_status_idx" ON "DataDeletionRequest"("familyId", "status");
CREATE INDEX "DataDeletionRequest_centerId_status_idx" ON "DataDeletionRequest"("centerId", "status");

ALTER TABLE "DataDeletionRequest" ADD CONSTRAINT "DataDeletionRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DataDeletionRequest" ADD CONSTRAINT "DataDeletionRequest_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "Center"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DataDeletionRequest" ADD CONSTRAINT "DataDeletionRequest_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DataDeletionRequest" ADD CONSTRAINT "DataDeletionRequest_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "Guardian"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DataDeletionRequest" ADD CONSTRAINT "DataDeletionRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
