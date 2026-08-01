SET lock_timeout = '5s';
SET statement_timeout = '5min';

CREATE INDEX "WebPushSubscription_userId_isActive_idx"
ON public."WebPushSubscription"("userId", "isActive");
