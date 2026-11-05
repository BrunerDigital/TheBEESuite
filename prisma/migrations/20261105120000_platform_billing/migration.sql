-- CreateTable
CREATE TABLE "PlatformBillingAccount" (
    "id" TEXT NOT NULL,
    "billerTenantId" TEXT NOT NULL,
    "customerTenantId" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "stripeCustomerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformBillingAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformBillingCharge" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "recurringKey" TEXT,
    "stripeCheckoutSessionId" TEXT,
    "checkoutUrl" TEXT,
    "checkoutExpiresAt" TIMESTAMP(3),
    "stripePaymentIntentId" TEXT,
    "refundedAmountCents" INTEGER NOT NULL DEFAULT 0,
    "stripeSubscriptionId" TEXT,
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "currentPeriodEnd" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "providerUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformBillingCharge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformBillingInvoice" (
    "id" TEXT NOT NULL,
    "chargeId" TEXT NOT NULL,
    "stripeInvoiceId" TEXT NOT NULL,
    "number" TEXT,
    "status" TEXT NOT NULL,
    "amountDueCents" INTEGER NOT NULL,
    "amountPaidCents" INTEGER NOT NULL,
    "hostedInvoiceUrl" TEXT,
    "paidAt" TIMESTAMP(3),
    "providerUpdatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformBillingInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlatformBillingAccount_stripeCustomerId_key" ON "PlatformBillingAccount"("stripeCustomerId");

-- CreateIndex
CREATE INDEX "PlatformBillingAccount_billerTenantId_createdAt_idx" ON "PlatformBillingAccount"("billerTenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformBillingAccount_billerTenantId_customerTenantId_key" ON "PlatformBillingAccount"("billerTenantId", "customerTenantId");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformBillingCharge_requestKey_key" ON "PlatformBillingCharge"("requestKey");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformBillingCharge_recurringKey_key" ON "PlatformBillingCharge"("recurringKey");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformBillingCharge_stripeCheckoutSessionId_key" ON "PlatformBillingCharge"("stripeCheckoutSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformBillingCharge_stripePaymentIntentId_key" ON "PlatformBillingCharge"("stripePaymentIntentId");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformBillingCharge_stripeSubscriptionId_key" ON "PlatformBillingCharge"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "PlatformBillingCharge_accountId_createdAt_idx" ON "PlatformBillingCharge"("accountId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformBillingInvoice_stripeInvoiceId_key" ON "PlatformBillingInvoice"("stripeInvoiceId");

-- CreateIndex
CREATE INDEX "PlatformBillingInvoice_chargeId_createdAt_idx" ON "PlatformBillingInvoice"("chargeId", "createdAt");

-- AddForeignKey
ALTER TABLE "PlatformBillingAccount" ADD CONSTRAINT "PlatformBillingAccount_billerTenantId_fkey" FOREIGN KEY ("billerTenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformBillingAccount" ADD CONSTRAINT "PlatformBillingAccount_customerTenantId_fkey" FOREIGN KEY ("customerTenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformBillingCharge" ADD CONSTRAINT "PlatformBillingCharge_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "PlatformBillingAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformBillingInvoice" ADD CONSTRAINT "PlatformBillingInvoice_chargeId_fkey" FOREIGN KEY ("chargeId") REFERENCES "PlatformBillingCharge"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Financial invariants and server-only access, matching the existing Prisma service boundary.
ALTER TABLE "PlatformBillingCharge" ADD CONSTRAINT "PlatformBillingCharge_valid_amount" CHECK ("amountCents" BETWEEN 50 AND 99999999 AND "currency" = 'usd');
ALTER TABLE "PlatformBillingCharge" ADD CONSTRAINT "PlatformBillingCharge_valid_kind" CHECK ("kind" IN ('ONE_TIME', 'MONTHLY'));
ALTER TABLE "PlatformBillingCharge" ADD CONSTRAINT "PlatformBillingCharge_valid_refund" CHECK ("refundedAmountCents" BETWEEN 0 AND "amountCents");
ALTER TABLE "PlatformBillingCharge" ADD CONSTRAINT "PlatformBillingCharge_recurring_slot" CHECK ("recurringKey" IS NULL OR ("kind" = 'MONTHLY' AND "recurringKey" = "accountId"));

ALTER TABLE "PlatformBillingAccount" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PlatformBillingCharge" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PlatformBillingInvoice" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "PlatformBillingAccount", "PlatformBillingCharge", "PlatformBillingInvoice" FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "PlatformBillingAccount", "PlatformBillingCharge", "PlatformBillingInvoice" TO service_role;
CREATE POLICY "PlatformBillingAccount_service_role_all" ON "PlatformBillingAccount" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "PlatformBillingCharge_service_role_all" ON "PlatformBillingCharge" FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "PlatformBillingInvoice_service_role_all" ON "PlatformBillingInvoice" FOR ALL TO service_role USING (true) WITH CHECK (true);
