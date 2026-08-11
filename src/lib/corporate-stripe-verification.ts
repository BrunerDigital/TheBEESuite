import { UserRole } from "@prisma/client";
import { canAccessCenter, type CurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readStripeConnectMigration } from "@/lib/stripe-connect-migration";

const CORPORATE_SCHOOLS_EMAIL = "corpschools@kidcityusa.com";
const corporateVerificationRoles = new Set<UserRole>([
  UserRole.PLATFORM_OWNER,
  UserRole.BRAND_ADMIN,
]);

export const CORPORATE_STRIPE_VERIFICATION_TARGETS = {
  cmp4ew5yx00046alw8i1yf63m: { school: "Cordera", accountId: "acct_1U2zAXGZOiFVCaG2" },
  cmp4ewd6p00386alw2ngcihed: { school: "Avon", accountId: "acct_1U31bWGpss446orz" },
  cmp4ewhbt00506alwam35am12: { school: "North Richland Hills", accountId: "acct_1U2zDmGoyxd1QwIu" },
  "85f871b5-b20d-4107-b5de-91d3014a1fb0": { school: "Corpus Christi", accountId: "acct_1U2zCsGlcTEcSaA2" },
  cmp4ewg8w004k6alwid0bwiur: { school: "Pisgah Forest", accountId: "acct_1U2zCaKIZA7QoGgs" },
  cmp4ewg4a004i6alwl5c6i3w4: { school: "Canton", accountId: "acct_1U2zCH2chpYNb3qS" },
  cmp4ew9h2001m6alwxssr4wr6: { school: "Oakleaf", accountId: "acct_1U2zBgK7L6OX7cUR" },
  cmp4ew8yo001e6alw32jneo3w: { school: "Beach Blvd", accountId: "acct_1U2zBOGetOO7UdiA" },
} as const;

export type CorporateStripeVerificationTarget = {
  school: string;
  accountId: string;
};

export function readCorporateStripeVerificationTarget(centerId: string) {
  return (CORPORATE_STRIPE_VERIFICATION_TARGETS as Record<string, CorporateStripeVerificationTarget>)[centerId] ?? null;
}

export function canUseCorporateStripeVerification(user: Pick<CurrentUser, "role">) {
  return corporateVerificationRoles.has(user.role);
}

export async function authorizeCorporateStripeVerificationCenter({
  user,
  center,
  now = new Date(),
}: {
  user: CurrentUser;
  center: { id: string; customFields: unknown; organization: { tenantId: string } };
  now?: Date;
}) {
  const expected = readCorporateStripeVerificationTarget(center.id);
  if (!expected) return { ok: false as const, reason: "not_approved" as const, expected: null };
  if (!canUseCorporateStripeVerification(user) || !canAccessCenter(user, center.id) || center.organization.tenantId !== user.tenantId) {
    return { ok: false as const, reason: "forbidden" as const, expected };
  }

  const portfolio = await prisma.user.findFirst({
    where: {
      email: CORPORATE_SCHOOLS_EMAIL,
      tenantId: user.tenantId,
      isActive: true,
      accessGrants: {
        some: {
          isActive: true,
          scopeType: "CENTER",
          centerId: center.id,
          OR: [{ startsAt: null }, { startsAt: { lte: now } }],
          AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: now } }] }],
        },
      },
    },
    select: { id: true },
  });
  if (!portfolio) return { ok: false as const, reason: "outside_portfolio" as const, expected };

  const migration = readStripeConnectMigration(center.customFields);
  if (migration.targetAccountId !== expected.accountId) {
    return { ok: false as const, reason: "target_changed" as const, expected };
  }
  return { ok: true as const, expected };
}

export function stripeVerificationState(account: {
  livemode: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  feesCollector?: "application" | "stripe" | null;
  lossesCollector?: "application" | "stripe" | null;
  currentlyDueRequirementFields: string[];
  pendingVerificationFields: string[];
}, payoutBankConfirmed: boolean) {
  if (account.livemode !== true || account.feesCollector !== "stripe" || account.lossesCollector !== "stripe") {
    return "stripe_verification_blocked" as const;
  }
  if (account.currentlyDueRequirementFields.length > 0) return "stripe_verification_required" as const;
  if (account.chargesEnabled && account.payoutsEnabled && payoutBankConfirmed) {
    return "stripe_verification_complete" as const;
  }
  if (account.pendingVerificationFields.length > 0) return "stripe_verification_pending" as const;
  return "stripe_verification_blocked" as const;
}

export function corporateStripeVerificationBindingIsValid({
  activeAccountId,
  sourceAccountId,
  targetAccountId,
  cutoverAt,
}: {
  activeAccountId: string | null;
  sourceAccountId: string;
  targetAccountId: string;
  cutoverAt: string | null;
}) {
  return activeAccountId === (cutoverAt ? targetAccountId : sourceAccountId);
}

export function corporateStripePayoutBankIsConfirmed(banks: Array<{
  currency: string | null;
  defaultForCurrency: boolean;
  last4: string | null;
}>) {
  return banks.some((bank) => bank.currency === "usd" && bank.defaultForCurrency && Boolean(bank.last4));
}
