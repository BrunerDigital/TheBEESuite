-- Tenant, ownership, scoped access, and white-label hierarchy for multi-brand childcare SaaS rollouts.
ALTER TABLE "Center"
ADD COLUMN IF NOT EXISTS "ownerGroupId" TEXT;

CREATE TABLE IF NOT EXISTS "OwnerGroup" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "brandId" TEXT,
  "organizationId" TEXT,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "ownerType" TEXT NOT NULL DEFAULT 'franchisee',
  "billingEmail" TEXT,
  "contactName" TEXT,
  "phone" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active',
  "customFields" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "OwnerGroup_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "UserAccessGrant" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "brandId" TEXT,
  "organizationId" TEXT,
  "ownerGroupId" TEXT,
  "centerId" TEXT,
  "role" "UserRole" NOT NULL,
  "scopeType" TEXT NOT NULL,
  "permissions" JSONB,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "UserAccessGrant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "BrandAsset" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "brandId" TEXT,
  "ownerGroupId" TEXT,
  "centerId" TEXT,
  "assetType" TEXT NOT NULL,
  "url" TEXT,
  "storageKey" TEXT,
  "altText" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "BrandAsset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "BrandCustomization" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "brandId" TEXT,
  "organizationId" TEXT,
  "ownerGroupId" TEXT,
  "centerId" TEXT,
  "scopeType" TEXT NOT NULL,
  "brandName" TEXT NOT NULL,
  "logoUrlPlaceholder" TEXT,
  "faviconUrlPlaceholder" TEXT,
  "mascotUrlPlaceholder" TEXT,
  "primaryColor" TEXT NOT NULL DEFAULT '#f5b51b',
  "accentColor" TEXT NOT NULL DEFAULT '#10b981',
  "themeMode" TEXT NOT NULL DEFAULT 'dark',
  "emailSenderPlaceholder" TEXT,
  "customDomainPlaceholder" TEXT,
  "parentPortalName" TEXT,
  "loginScreenTitle" TEXT,
  "notificationFooterText" TEXT,
  "legalFooterText" TEXT,
  "termsUrl" TEXT,
  "privacyUrl" TEXT,
  "customCss" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "BrandCustomization_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "OwnerGroup_tenantId_slug_key" ON "OwnerGroup"("tenantId", "slug");
CREATE INDEX IF NOT EXISTS "OwnerGroup_brandId_idx" ON "OwnerGroup"("brandId");
CREATE INDEX IF NOT EXISTS "OwnerGroup_organizationId_idx" ON "OwnerGroup"("organizationId");
CREATE INDEX IF NOT EXISTS "OwnerGroup_status_idx" ON "OwnerGroup"("status");
CREATE INDEX IF NOT EXISTS "Center_ownerGroupId_idx" ON "Center"("ownerGroupId");

CREATE INDEX IF NOT EXISTS "UserAccessGrant_userId_isActive_idx" ON "UserAccessGrant"("userId", "isActive");
CREATE INDEX IF NOT EXISTS "UserAccessGrant_tenantId_scopeType_idx" ON "UserAccessGrant"("tenantId", "scopeType");
CREATE INDEX IF NOT EXISTS "UserAccessGrant_brandId_idx" ON "UserAccessGrant"("brandId");
CREATE INDEX IF NOT EXISTS "UserAccessGrant_organizationId_idx" ON "UserAccessGrant"("organizationId");
CREATE INDEX IF NOT EXISTS "UserAccessGrant_ownerGroupId_idx" ON "UserAccessGrant"("ownerGroupId");
CREATE INDEX IF NOT EXISTS "UserAccessGrant_centerId_idx" ON "UserAccessGrant"("centerId");

CREATE INDEX IF NOT EXISTS "BrandAsset_tenantId_assetType_idx" ON "BrandAsset"("tenantId", "assetType");
CREATE INDEX IF NOT EXISTS "BrandAsset_brandId_assetType_idx" ON "BrandAsset"("brandId", "assetType");
CREATE INDEX IF NOT EXISTS "BrandAsset_ownerGroupId_assetType_idx" ON "BrandAsset"("ownerGroupId", "assetType");
CREATE INDEX IF NOT EXISTS "BrandAsset_centerId_assetType_idx" ON "BrandAsset"("centerId", "assetType");

CREATE INDEX IF NOT EXISTS "BrandCustomization_tenantId_scopeType_idx" ON "BrandCustomization"("tenantId", "scopeType");
CREATE INDEX IF NOT EXISTS "BrandCustomization_brandId_scopeType_idx" ON "BrandCustomization"("brandId", "scopeType");
CREATE INDEX IF NOT EXISTS "BrandCustomization_organizationId_scopeType_idx" ON "BrandCustomization"("organizationId", "scopeType");
CREATE INDEX IF NOT EXISTS "BrandCustomization_ownerGroupId_scopeType_idx" ON "BrandCustomization"("ownerGroupId", "scopeType");
CREATE INDEX IF NOT EXISTS "BrandCustomization_centerId_scopeType_idx" ON "BrandCustomization"("centerId", "scopeType");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Center_ownerGroupId_fkey') THEN
    ALTER TABLE "Center" ADD CONSTRAINT "Center_ownerGroupId_fkey" FOREIGN KEY ("ownerGroupId") REFERENCES "OwnerGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OwnerGroup_tenantId_fkey') THEN
    ALTER TABLE "OwnerGroup" ADD CONSTRAINT "OwnerGroup_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OwnerGroup_brandId_fkey') THEN
    ALTER TABLE "OwnerGroup" ADD CONSTRAINT "OwnerGroup_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OwnerGroup_organizationId_fkey') THEN
    ALTER TABLE "OwnerGroup" ADD CONSTRAINT "OwnerGroup_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'UserAccessGrant_userId_fkey') THEN
    ALTER TABLE "UserAccessGrant" ADD CONSTRAINT "UserAccessGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'UserAccessGrant_tenantId_fkey') THEN
    ALTER TABLE "UserAccessGrant" ADD CONSTRAINT "UserAccessGrant_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'UserAccessGrant_brandId_fkey') THEN
    ALTER TABLE "UserAccessGrant" ADD CONSTRAINT "UserAccessGrant_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'UserAccessGrant_organizationId_fkey') THEN
    ALTER TABLE "UserAccessGrant" ADD CONSTRAINT "UserAccessGrant_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'UserAccessGrant_ownerGroupId_fkey') THEN
    ALTER TABLE "UserAccessGrant" ADD CONSTRAINT "UserAccessGrant_ownerGroupId_fkey" FOREIGN KEY ("ownerGroupId") REFERENCES "OwnerGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'UserAccessGrant_centerId_fkey') THEN
    ALTER TABLE "UserAccessGrant" ADD CONSTRAINT "UserAccessGrant_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "Center"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BrandAsset_tenantId_fkey') THEN
    ALTER TABLE "BrandAsset" ADD CONSTRAINT "BrandAsset_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BrandAsset_brandId_fkey') THEN
    ALTER TABLE "BrandAsset" ADD CONSTRAINT "BrandAsset_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BrandAsset_ownerGroupId_fkey') THEN
    ALTER TABLE "BrandAsset" ADD CONSTRAINT "BrandAsset_ownerGroupId_fkey" FOREIGN KEY ("ownerGroupId") REFERENCES "OwnerGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BrandAsset_centerId_fkey') THEN
    ALTER TABLE "BrandAsset" ADD CONSTRAINT "BrandAsset_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "Center"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BrandCustomization_tenantId_fkey') THEN
    ALTER TABLE "BrandCustomization" ADD CONSTRAINT "BrandCustomization_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BrandCustomization_brandId_fkey') THEN
    ALTER TABLE "BrandCustomization" ADD CONSTRAINT "BrandCustomization_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BrandCustomization_organizationId_fkey') THEN
    ALTER TABLE "BrandCustomization" ADD CONSTRAINT "BrandCustomization_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BrandCustomization_ownerGroupId_fkey') THEN
    ALTER TABLE "BrandCustomization" ADD CONSTRAINT "BrandCustomization_ownerGroupId_fkey" FOREIGN KEY ("ownerGroupId") REFERENCES "OwnerGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'BrandCustomization_centerId_fkey') THEN
    ALTER TABLE "BrandCustomization" ADD CONSTRAINT "BrandCustomization_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "Center"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "OwnerGroup" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UserAccessGrant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BrandAsset" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BrandCustomization" ENABLE ROW LEVEL SECURITY;
