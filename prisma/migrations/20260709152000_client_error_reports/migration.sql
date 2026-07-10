-- Server-side crash and client error aggregation. This table is intentionally
-- not exposed to browser Supabase clients; writes go through the Next.js API.
CREATE TABLE "ClientErrorReport" (
    "id" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "environment" TEXT NOT NULL DEFAULT 'production',
    "release" TEXT,
    "source" TEXT NOT NULL,
    "errorType" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'error',
    "message" TEXT,
    "stackSample" TEXT,
    "componentStack" TEXT,
    "path" TEXT,
    "tenantId" TEXT,
    "centerId" TEXT,
    "userId" TEXT,
    "userAgentHash" TEXT,
    "ipHash" TEXT,
    "metadata" JSONB,
    "occurrenceCount" INTEGER NOT NULL DEFAULT 1,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientErrorReport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClientErrorReport_dedupeKey_key" ON "ClientErrorReport"("dedupeKey");
CREATE INDEX "ClientErrorReport_environment_lastSeenAt_idx" ON "ClientErrorReport"("environment", "lastSeenAt");
CREATE INDEX "ClientErrorReport_fingerprint_lastSeenAt_idx" ON "ClientErrorReport"("fingerprint", "lastSeenAt");
CREATE INDEX "ClientErrorReport_tenantId_lastSeenAt_idx" ON "ClientErrorReport"("tenantId", "lastSeenAt");
CREATE INDEX "ClientErrorReport_userId_lastSeenAt_idx" ON "ClientErrorReport"("userId", "lastSeenAt");
CREATE INDEX "ClientErrorReport_path_lastSeenAt_idx" ON "ClientErrorReport"("path", "lastSeenAt");
CREATE INDEX "ClientErrorReport_resolvedAt_lastSeenAt_idx" ON "ClientErrorReport"("resolvedAt", "lastSeenAt");

ALTER TABLE "ClientErrorReport" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "ClientErrorReport" FROM anon;
REVOKE ALL ON TABLE "ClientErrorReport" FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "ClientErrorReport" TO service_role;

CREATE POLICY "ClientErrorReport_service_role_all"
ON "ClientErrorReport"
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
