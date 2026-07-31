ALTER TABLE "Integration"
ADD COLUMN "centerId" TEXT,
ADD COLUMN "scopeKey" TEXT NOT NULL DEFAULT 'tenant';

ALTER TABLE "IntegrationCredential"
ADD COLUMN "centerId" TEXT,
ADD COLUMN "scopeKey" TEXT NOT NULL DEFAULT 'tenant';

DROP INDEX IF EXISTS "IntegrationCredential_tenantId_provider_key_key";

CREATE UNIQUE INDEX "Integration_tenantId_provider_scopeKey_key"
ON "Integration"("tenantId", "provider", "scopeKey");

CREATE INDEX "Integration_centerId_provider_idx"
ON "Integration"("centerId", "provider");

CREATE UNIQUE INDEX "IntegrationCredential_tenantId_provider_scopeKey_key_key"
ON "IntegrationCredential"("tenantId", "provider", "scopeKey", "key");

CREATE INDEX "IntegrationCredential_tenantId_provider_scopeKey_idx"
ON "IntegrationCredential"("tenantId", "provider", "scopeKey");

CREATE INDEX "IntegrationCredential_centerId_provider_idx"
ON "IntegrationCredential"("centerId", "provider");

ALTER TABLE "Integration"
ADD CONSTRAINT "Integration_centerId_fkey"
FOREIGN KEY ("centerId") REFERENCES "Center"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "IntegrationCredential"
ADD CONSTRAINT "IntegrationCredential_centerId_fkey"
FOREIGN KEY ("centerId") REFERENCES "Center"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Integration"
ADD CONSTRAINT "Integration_scopeKey_center_consistency"
CHECK (
  ("centerId" IS NULL AND "scopeKey" = 'tenant')
  OR ("centerId" IS NOT NULL AND "scopeKey" = 'center:' || "centerId")
);

ALTER TABLE "IntegrationCredential"
ADD CONSTRAINT "IntegrationCredential_scopeKey_center_consistency"
CHECK (
  ("centerId" IS NULL AND "scopeKey" = 'tenant')
  OR ("centerId" IS NOT NULL AND "scopeKey" = 'center:' || "centerId")
);
