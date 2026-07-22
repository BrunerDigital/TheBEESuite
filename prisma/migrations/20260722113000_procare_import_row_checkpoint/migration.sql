CREATE UNIQUE INDEX IF NOT EXISTS "ProcareImportRow_batchId_rowNumber_key"
ON "ProcareImportRow"("batchId", "rowNumber");
