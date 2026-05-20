ALTER TABLE "Guardian"
ADD COLUMN "checkInPinHash" TEXT,
ADD COLUMN "checkInPinSetAt" TIMESTAMP(3),
ADD COLUMN "checkInPinSetById" TEXT;

ALTER TABLE "CheckInOutLog"
ADD COLUMN "centerId" TEXT,
ADD COLUMN "classroomId" TEXT,
ADD COLUMN "guardianId" TEXT,
ADD COLUMN "pinVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "notes" TEXT;

ALTER TABLE "BillingAccount"
ADD COLUMN "ledgerSyncedAt" TIMESTAMP(3);

CREATE TABLE "ChildMedia" (
  "id" TEXT NOT NULL,
  "childId" TEXT NOT NULL,
  "classroomId" TEXT,
  "uploadedById" TEXT,
  "dailyReportId" TEXT,
  "url" TEXT NOT NULL,
  "storageKey" TEXT,
  "caption" TEXT,
  "mediaType" TEXT NOT NULL DEFAULT 'photo',
  "status" TEXT NOT NULL DEFAULT 'shared',
  "sharedWithParents" BOOLEAN NOT NULL DEFAULT true,
  "takenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ChildMedia_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LedgerEntry" (
  "id" TEXT NOT NULL,
  "billingAccountId" TEXT NOT NULL,
  "invoiceId" TEXT,
  "paymentId" TEXT,
  "type" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "balanceAfterCents" INTEGER,
  "effectiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sourceSystem" TEXT,
  "externalId" TEXT,
  "metadata" JSONB,

  CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProcareImportBatch" (
  "id" TEXT NOT NULL,
  "centerId" TEXT NOT NULL,
  "uploadedById" TEXT,
  "filename" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'completed',
  "summary" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ProcareImportBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProcareImportRow" (
  "id" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "rowNumber" INTEGER NOT NULL,
  "status" TEXT NOT NULL,
  "message" TEXT,
  "rawData" JSONB NOT NULL,
  "createdFamilyId" TEXT,
  "createdChildId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ProcareImportRow_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Guardian_checkInPinHash_idx" ON "Guardian"("checkInPinHash");
CREATE INDEX "CheckInOutLog_centerId_occurredAt_idx" ON "CheckInOutLog"("centerId", "occurredAt");
CREATE INDEX "CheckInOutLog_childId_occurredAt_idx" ON "CheckInOutLog"("childId", "occurredAt");
CREATE INDEX "CheckInOutLog_guardianId_occurredAt_idx" ON "CheckInOutLog"("guardianId", "occurredAt");
CREATE INDEX "ChildMedia_childId_createdAt_idx" ON "ChildMedia"("childId", "createdAt");
CREATE INDEX "ChildMedia_classroomId_createdAt_idx" ON "ChildMedia"("classroomId", "createdAt");
CREATE INDEX "LedgerEntry_billingAccountId_effectiveAt_idx" ON "LedgerEntry"("billingAccountId", "effectiveAt");
CREATE INDEX "LedgerEntry_invoiceId_idx" ON "LedgerEntry"("invoiceId");
CREATE INDEX "LedgerEntry_paymentId_idx" ON "LedgerEntry"("paymentId");
CREATE UNIQUE INDEX "LedgerEntry_sourceSystem_externalId_key" ON "LedgerEntry"("sourceSystem", "externalId");
CREATE INDEX "ProcareImportBatch_centerId_createdAt_idx" ON "ProcareImportBatch"("centerId", "createdAt");
CREATE INDEX "ProcareImportRow_batchId_status_idx" ON "ProcareImportRow"("batchId", "status");

ALTER TABLE "CheckInOutLog" ADD CONSTRAINT "CheckInOutLog_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "Center"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CheckInOutLog" ADD CONSTRAINT "CheckInOutLog_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CheckInOutLog" ADD CONSTRAINT "CheckInOutLog_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "Guardian"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ChildMedia" ADD CONSTRAINT "ChildMedia_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ChildMedia" ADD CONSTRAINT "ChildMedia_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ChildMedia" ADD CONSTRAINT "ChildMedia_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ChildMedia" ADD CONSTRAINT "ChildMedia_dailyReportId_fkey" FOREIGN KEY ("dailyReportId") REFERENCES "DailyReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_billingAccountId_fkey" FOREIGN KEY ("billingAccountId") REFERENCES "BillingAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProcareImportBatch" ADD CONSTRAINT "ProcareImportBatch_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "Center"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProcareImportBatch" ADD CONSTRAINT "ProcareImportBatch_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProcareImportRow" ADD CONSTRAINT "ProcareImportRow_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ProcareImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
