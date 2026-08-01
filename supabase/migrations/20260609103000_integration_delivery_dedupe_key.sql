-- Add a durable dedupe key so cron-triggered external deliveries send once per channel/window.
ALTER TABLE "IntegrationDelivery" ADD COLUMN IF NOT EXISTS "dedupeKey" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "IntegrationDelivery_dedupeKey_key" ON "IntegrationDelivery"("dedupeKey");
