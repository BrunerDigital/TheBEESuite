-- Store short, opaque parent-facing payment setup links so emails do not expose long signed tokens.
CREATE TABLE "PaymentMethodRequestLink" (
    "code" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "centerId" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentMethodRequestLink_pkey" PRIMARY KEY ("code")
);

CREATE INDEX "PaymentMethodRequestLink_expiresAt_idx" ON "PaymentMethodRequestLink"("expiresAt");
CREATE INDEX "PaymentMethodRequestLink_familyId_email_idx" ON "PaymentMethodRequestLink"("familyId", "email");
