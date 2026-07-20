CREATE TABLE "SendGridEventReceipt" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "providerMessageId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "matchedDeliveries" INTEGER NOT NULL DEFAULT 0,
    "occurredAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SendGridEventReceipt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SendGridEventReceipt_eventId_key" ON "SendGridEventReceipt"("eventId");
CREATE INDEX "SendGridEventReceipt_providerMessageId_idx" ON "SendGridEventReceipt"("providerMessageId");
CREATE INDEX "SendGridEventReceipt_eventType_processedAt_idx" ON "SendGridEventReceipt"("eventType", "processedAt");

REVOKE ALL ON TABLE public."SendGridEventReceipt" FROM anon, authenticated;
ALTER TABLE public."SendGridEventReceipt" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_full_access" ON public."SendGridEventReceipt"
  FOR ALL TO service_role USING (true) WITH CHECK (true);
