SET lock_timeout = '5s';
SET statement_timeout = '5min';

CREATE UNIQUE INDEX IF NOT EXISTS "ProcareImportRow_batchId_rowNumber_key"
ON public."ProcareImportRow"("batchId", "rowNumber");
