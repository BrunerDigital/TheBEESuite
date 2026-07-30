-- Keep this filename aligned with the migration version applied in Supabase production.
SET lock_timeout = '5s';
SET statement_timeout = '5min';

CREATE TABLE public."RefundRequest" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "centerId" TEXT NOT NULL,
  "familyId" TEXT NOT NULL,
  "requestedById" TEXT NOT NULL,
  "reviewedById" TEXT,
  "amountCents" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "selectedPaymentIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "status" TEXT NOT NULL DEFAULT 'pending',
  "decisionReason" TEXT,
  "failureReason" TEXT,
  "processedAmountCents" INTEGER NOT NULL DEFAULT 0,
  "allocations" JSONB,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" TIMESTAMP(3),
  "processedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "RefundRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RefundRequest_amountCents_positive" CHECK ("amountCents" > 0),
  CONSTRAINT "RefundRequest_processedAmountCents_nonnegative" CHECK ("processedAmountCents" >= 0),
  CONSTRAINT "RefundRequest_status_valid" CHECK ("status" IN ('pending', 'processing', 'approved', 'denied'))
);

CREATE INDEX "RefundRequest_tenantId_status_requestedAt_idx"
ON public."RefundRequest"("tenantId", "status", "requestedAt");

CREATE INDEX "RefundRequest_centerId_status_requestedAt_idx"
ON public."RefundRequest"("centerId", "status", "requestedAt");

CREATE INDEX "RefundRequest_familyId_requestedAt_idx"
ON public."RefundRequest"("familyId", "requestedAt");

CREATE INDEX "RefundRequest_requestedById_status_idx"
ON public."RefundRequest"("requestedById", "status");

ALTER TABLE public."RefundRequest"
ADD CONSTRAINT "RefundRequest_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES public."Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE public."RefundRequest"
ADD CONSTRAINT "RefundRequest_centerId_fkey"
FOREIGN KEY ("centerId") REFERENCES public."Center"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE public."RefundRequest"
ADD CONSTRAINT "RefundRequest_familyId_fkey"
FOREIGN KEY ("familyId") REFERENCES public."Family"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE public."RefundRequest"
ADD CONSTRAINT "RefundRequest_requestedById_fkey"
FOREIGN KEY ("requestedById") REFERENCES public."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE public."RefundRequest"
ADD CONSTRAINT "RefundRequest_reviewedById_fkey"
FOREIGN KEY ("reviewedById") REFERENCES public."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

REVOKE ALL ON TABLE public."RefundRequest" FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."RefundRequest" TO service_role;
ALTER TABLE public."RefundRequest" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access"
ON public."RefundRequest"
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
