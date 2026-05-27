-- Harden Stripe payment processing before enabling live Connect payments.
-- Payment customFields stores checkout totals, application fees, surcharge amounts, and provider metadata.
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "customFields" JSONB;

CREATE TABLE IF NOT EXISTS "StripeWebhookEvent" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "dedupeKey" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "objectId" TEXT,
  "livemode" BOOLEAN,
  "status" TEXT NOT NULL,
  "payload" JSONB,
  "error" TEXT,
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StripeWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "StripeWebhookEvent_eventId_key" ON "StripeWebhookEvent"("eventId");
CREATE UNIQUE INDEX IF NOT EXISTS "StripeWebhookEvent_dedupeKey_key" ON "StripeWebhookEvent"("dedupeKey");
CREATE INDEX IF NOT EXISTS "StripeWebhookEvent_type_createdAt_idx" ON "StripeWebhookEvent"("type", "createdAt");
CREATE INDEX IF NOT EXISTS "StripeWebhookEvent_objectId_idx" ON "StripeWebhookEvent"("objectId");

ALTER TABLE "StripeWebhookEvent" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "StripeWebhookEvent" FROM anon;
REVOKE ALL ON TABLE "StripeWebhookEvent" FROM authenticated;
