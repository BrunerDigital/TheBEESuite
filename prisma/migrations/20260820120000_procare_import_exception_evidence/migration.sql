ALTER TABLE "ProcareImportRow"
ADD COLUMN "resolutionCategory" TEXT,
ADD COLUMN "resolutionReason" TEXT,
ADD COLUMN "resolutionEvidenceReference" TEXT,
ADD COLUMN "resolvedBy" TEXT,
ADD COLUMN "resolvedAt" TIMESTAMP(3);
