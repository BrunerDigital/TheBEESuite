import type { Prisma, UserRole } from "@prisma/client";

const NO_PLATFORM_TELEMETRY = "__platform_owner_only__";

export function canViewPlatformPaymentTelemetry(role: UserRole) {
  return role === "PLATFORM_OWNER";
}

export function stripeWebhookErrorWhereForViewer(role: UserRole): Prisma.StripeWebhookEventWhereInput {
  if (!canViewPlatformPaymentTelemetry(role)) return { id: NO_PLATFORM_TELEMETRY };
  return {
    OR: [
      { error: { not: null } },
      { status: { in: ["failed", "error"] } },
    ],
  };
}

export function stripeWebhookWhereForViewer(role: UserRole): Prisma.StripeWebhookEventWhereInput {
  return canViewPlatformPaymentTelemetry(role) ? {} : { id: NO_PLATFORM_TELEMETRY };
}
