-- Link Twilio SMS delivery attempts and callbacks to portal messages.
ALTER TABLE "IntegrationDelivery" ADD COLUMN IF NOT EXISTS "messageId" TEXT;
ALTER TABLE "IntegrationDelivery" ADD COLUMN IF NOT EXISTS "providerMessageId" TEXT;
ALTER TABLE "IntegrationDelivery" ADD COLUMN IF NOT EXISTS "direction" TEXT NOT NULL DEFAULT 'outbound';
ALTER TABLE "IntegrationDelivery" ADD COLUMN IF NOT EXISTS "recipient" TEXT;
ALTER TABLE "IntegrationDelivery" ADD COLUMN IF NOT EXISTS "sender" TEXT;

CREATE INDEX IF NOT EXISTS "IntegrationDelivery_messageId_idx" ON "IntegrationDelivery"("messageId");
CREATE UNIQUE INDEX IF NOT EXISTS "IntegrationDelivery_provider_providerMessageId_key" ON "IntegrationDelivery"("provider", "providerMessageId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'IntegrationDelivery_messageId_fkey'
  ) THEN
    ALTER TABLE "IntegrationDelivery" ADD CONSTRAINT "IntegrationDelivery_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
