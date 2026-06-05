CREATE TABLE IF NOT EXISTS "IntegrationCredential" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "encryptedValue" TEXT NOT NULL,
  "lastFour" TEXT,
  "createdById" TEXT,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IntegrationCredential_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'IntegrationCredential_tenantId_fkey') THEN
    ALTER TABLE "IntegrationCredential" ADD CONSTRAINT "IntegrationCredential_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "IntegrationCredential_tenantId_provider_key_key" ON "IntegrationCredential"("tenantId", "provider", "key");
CREATE INDEX IF NOT EXISTS "IntegrationCredential_tenantId_provider_idx" ON "IntegrationCredential"("tenantId", "provider");
