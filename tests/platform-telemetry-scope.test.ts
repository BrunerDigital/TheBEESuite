import assert from "node:assert/strict";
import test from "node:test";
import { UserRole } from "@prisma/client";
import {
  canViewPlatformPaymentTelemetry,
  stripeWebhookErrorWhereForViewer,
  stripeWebhookWhereForViewer,
} from "../src/lib/platform-telemetry-scope";

test("only platform owners can load global Stripe webhook telemetry", () => {
  assert.equal(canViewPlatformPaymentTelemetry(UserRole.PLATFORM_OWNER), true);
  assert.equal(canViewPlatformPaymentTelemetry(UserRole.BRAND_ADMIN), false);
  assert.equal(canViewPlatformPaymentTelemetry(UserRole.REGIONAL_MANAGER), false);
  assert.deepEqual(stripeWebhookWhereForViewer(UserRole.BRAND_ADMIN), { id: "__platform_owner_only__" });
});

test("platform owner error telemetry retains operational failure filters", () => {
  assert.deepEqual(stripeWebhookWhereForViewer(UserRole.PLATFORM_OWNER), {});
  assert.deepEqual(stripeWebhookErrorWhereForViewer(UserRole.PLATFORM_OWNER), {
    OR: [
      { error: { not: null } },
      { status: { in: ["failed", "error"] } },
    ],
  });
});
