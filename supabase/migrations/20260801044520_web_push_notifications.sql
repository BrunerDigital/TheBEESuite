SET lock_timeout = '5s';
SET statement_timeout = '5min';

CREATE TABLE public."WebPushSubscription" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "deviceSessionId" TEXT,
  "endpointHash" TEXT NOT NULL,
  "endpoint" TEXT NOT NULL,
  "p256dh" TEXT NOT NULL,
  "auth" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3),
  "userAgentHash" TEXT,
  "platform" TEXT NOT NULL DEFAULT 'web',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSuccessAt" TIMESTAMP(3),
  "lastFailureAt" TIMESTAMP(3),
  "failureCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WebPushSubscription_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WebPushSubscription_failureCount_nonnegative" CHECK ("failureCount" >= 0)
);

CREATE TABLE public."WebPushDelivery" (
  "id" TEXT NOT NULL,
  "notificationId" TEXT NOT NULL,
  "subscriptionId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastAttemptAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "responseStatus" INTEGER,
  "errorCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WebPushDelivery_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WebPushDelivery_attempts_nonnegative" CHECK ("attempts" >= 0),
  CONSTRAINT "WebPushDelivery_status_valid"
    CHECK ("status" IN ('pending', 'processing', 'retry', 'delivered', 'failed', 'cancelled', 'skipped'))
);

CREATE UNIQUE INDEX "WebPushSubscription_endpointHash_key"
ON public."WebPushSubscription"("endpointHash");

CREATE INDEX "WebPushSubscription_tenantId_userId_isActive_idx"
ON public."WebPushSubscription"("tenantId", "userId", "isActive");

CREATE INDEX "WebPushSubscription_deviceSessionId_isActive_idx"
ON public."WebPushSubscription"("deviceSessionId", "isActive");

CREATE UNIQUE INDEX "WebPushDelivery_notificationId_subscriptionId_key"
ON public."WebPushDelivery"("notificationId", "subscriptionId");

CREATE INDEX "WebPushDelivery_status_nextAttemptAt_createdAt_idx"
ON public."WebPushDelivery"("status", "nextAttemptAt", "createdAt");

CREATE INDEX "WebPushDelivery_subscriptionId_status_idx"
ON public."WebPushDelivery"("subscriptionId", "status");

ALTER TABLE public."WebPushSubscription"
ADD CONSTRAINT "WebPushSubscription_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES public."Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE public."WebPushSubscription"
ADD CONSTRAINT "WebPushSubscription_userId_fkey"
FOREIGN KEY ("userId") REFERENCES public."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE public."WebPushSubscription"
ADD CONSTRAINT "WebPushSubscription_deviceSessionId_fkey"
FOREIGN KEY ("deviceSessionId") REFERENCES public."DeviceSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE public."WebPushDelivery"
ADD CONSTRAINT "WebPushDelivery_notificationId_fkey"
FOREIGN KEY ("notificationId") REFERENCES public."Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE public."WebPushDelivery"
ADD CONSTRAINT "WebPushDelivery_subscriptionId_fkey"
FOREIGN KEY ("subscriptionId") REFERENCES public."WebPushSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

REVOKE ALL ON TABLE public."WebPushSubscription" FROM anon, authenticated;
REVOKE ALL ON TABLE public."WebPushDelivery" FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."WebPushSubscription" TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public."WebPushDelivery" TO service_role;

ALTER TABLE public."WebPushSubscription" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."WebPushDelivery" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access"
ON public."WebPushSubscription"
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "service_role_full_access"
ON public."WebPushDelivery"
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.queue_web_push_delivery()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF NEW."userId" IS NULL
    OR NEW."archivedAt" IS NOT NULL
    OR (NEW."expiresAt" IS NOT NULL AND NEW."expiresAt" <= CURRENT_TIMESTAMP)
  THEN
    RETURN NEW;
  END IF;

  INSERT INTO public."WebPushDelivery" (
    "id",
    "notificationId",
    "subscriptionId",
    "status",
    "attempts",
    "nextAttemptAt",
    "createdAt",
    "updatedAt"
  )
  SELECT
    'wpd_' || md5(
      NEW."id" || ':' || subscription."id" || ':' ||
      clock_timestamp()::text || ':' || random()::text
    ),
    NEW."id",
    subscription."id",
    'pending',
    0,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  FROM public."WebPushSubscription" AS subscription
  INNER JOIN public."User" AS app_user
    ON app_user."id" = NEW."userId"
    AND app_user."tenantId" = subscription."tenantId"
    AND app_user."isActive" = true
  LEFT JOIN public."DeviceSession" AS device_session
    ON device_session."id" = subscription."deviceSessionId"
  WHERE subscription."userId" = NEW."userId"
    AND subscription."isActive" = true
    AND (
      subscription."deviceSessionId" IS NULL
      OR (
        device_session."userId" = subscription."userId"
        AND device_session."tenantId" = subscription."tenantId"
        AND device_session."revokedAt" IS NULL
      )
    )
  ON CONFLICT ("notificationId", "subscriptionId") DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.queue_web_push_delivery() FROM PUBLIC;

CREATE TRIGGER "Notification_queue_web_push_delivery"
AFTER INSERT ON public."Notification"
FOR EACH ROW
EXECUTE FUNCTION public.queue_web_push_delivery();
