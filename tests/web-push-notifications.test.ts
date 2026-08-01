import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  safeWebPushPlatform,
  webPushBody,
  webPushHref,
  webPushPreferenceType,
} from "@/lib/web-push-policy";

test("stored notification types map to fail-closed app alert preferences", () => {
  const examples = new Map([
    ["message", "messages"],
    ["privacy_deletion_request", "messages"],
    ["parent_request", "messages"],
    ["record_change", "messages"],
    ["payment_dunning", "billing"],
    ["refund_decision", "billing"],
    ["document_expiration", "documents"],
    ["signature_request", "documents"],
    ["incident", "incidents"],
    ["parent_media", "photos"],
    ["classroom_activity", "classroom"],
    ["registration_next_steps", "enrollment"],
    ["fte_due", "fte_reports"],
  ]);

  for (const [notificationType, preferenceType] of examples) {
    assert.equal(webPushPreferenceType(notificationType), preferenceType);
  }
  assert.equal(webPushPreferenceType("unclassified_sensitive_event"), null);
});

test("push copy is generic and role links stay inside the application", () => {
  assert.equal(webPushBody("billing"), "A billing or tuition update is ready in The BEE Suite.");
  assert.equal(webPushHref("billing", "PARENT_GUARDIAN"), "/parent-portal#billing");
  assert.equal(webPushHref("photos", "TEACHER"), "/classroom-dashboard");
  assert.equal(webPushHref("fte_reports", "CENTER_DIRECTOR"), "/fte-reports");

  for (const type of ["messages", "billing", "documents", "incidents", "photos", "classroom", "enrollment", "fte_reports"] as const) {
    assert.doesNotMatch(webPushBody(type), /child name|family name|account number|invoice number/i);
  }
  assert.equal(safeWebPushPlatform("IOS"), "ios");
  assert.equal(safeWebPushPlatform("unexpected"), "web");
});

test("web push outbox queues only new user-bound notifications for active scoped subscriptions", () => {
  const schema = readFileSync("prisma/schema.prisma", "utf8");
  const migration = readFileSync("prisma/migrations/20260801044520_web_push_notifications/migration.sql", "utf8");
  const mirror = readFileSync("supabase/migrations/20260801044520_web_push_notifications.sql", "utf8");
  const userIndexMigration = readFileSync("prisma/migrations/20260801044601_web_push_subscription_user_index/migration.sql", "utf8");
  const userIndexMirror = readFileSync("supabase/migrations/20260801044601_web_push_subscription_user_index.sql", "utf8");

  assert.match(schema, /model WebPushSubscription/);
  assert.match(schema, /model WebPushDelivery/);
  assert.equal(mirror, migration);
  assert.equal(userIndexMirror, userIndexMigration);
  assert.match(migration, /AFTER INSERT ON public\."Notification"/);
  assert.match(migration, /IF NEW\."userId" IS NULL/);
  assert.match(migration, /subscription\."isActive" = true/);
  assert.match(migration, /app_user\."tenantId" = subscription\."tenantId"/);
  assert.match(migration, /device_session\."revokedAt" IS NULL/);
  assert.doesNotMatch(migration, /INSERT INTO public\."WebPushDelivery"[\s\S]*FROM public\."Notification"/);
  assert.match(migration, /REVOKE ALL ON TABLE public\."WebPushSubscription" FROM anon, authenticated/);
  assert.match(migration, /ALTER TABLE public\."WebPushDelivery" ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /SECURITY DEFINER\s+SET search_path = pg_catalog, pg_temp/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.queue_web_push_delivery\(\) FROM PUBLIC/);
  assert.match(userIndexMigration, /"WebPushSubscription_userId_isActive_idx"/);
});

test("subscription, logout, dispatcher, and service worker keep device delivery bounded", () => {
  const subscriptionRoute = readFileSync("src/app/api/notifications/push-subscription/route.ts", "utf8");
  const logoutRoute = readFileSync("src/app/api/auth/logout/route.ts", "utf8");
  const dispatcher = readFileSync("src/lib/web-push.ts", "utf8");
  const serviceWorker = readFileSync("public/sw.js", "utf8");
  const vercel = JSON.parse(readFileSync("vercel.json", "utf8")) as { crons: Array<{ path: string; schedule: string }> };

  assert.match(subscriptionRoute, /sameOrigin\(request\)/);
  assert.match(subscriptionRoute, /tenantId: user\.tenantId/);
  assert.match(subscriptionRoute, /userId: user\.id/);
  assert.match(subscriptionRoute, /deviceSessionId: user\.deviceSessionId/);
  assert.match(subscriptionRoute, /subscription_rebound/);
  assert.match(logoutRoute, /device_session_logout/);
  assert.match(logoutRoute, /webPushSubscription\.updateMany/);
  assert.match(dispatcher, /subscription\.tenantId !== user\.tenantId/);
  assert.match(dispatcher, /push_preference_disabled/);
  assert.match(dispatcher, /webPushBody\(preferenceType\)/);
  assert.doesNotMatch(dispatcher, /body:\s*notification\.body/);
  assert.match(serviceWorker, /addEventListener\("push"/);
  assert.match(serviceWorker, /showNotification/);
  assert.match(serviceWorker, /setAppBadge/);
  assert.match(serviceWorker, /addEventListener\("notificationclick"/);
  assert.deepEqual(
    vercel.crons.find((cron) => cron.path === "/api/cron/web-push"),
    { path: "/api/cron/web-push", schedule: "* * * * *" },
  );
});
