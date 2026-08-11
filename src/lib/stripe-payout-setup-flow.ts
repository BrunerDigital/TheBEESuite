import { stripeConnectReadinessFromFields } from "@/lib/stripe-connect-readiness";
import { readStripeConnectMigration } from "@/lib/stripe-connect-migration";

export const CORPORATE_STRIPE_PORTFOLIO_EMAIL = "corpschools@kidcityusa.com";
export const CORPORATE_STRIPE_PORTFOLIO_PATH = "/stripe-reauthorization/corporate";
export const PAYOUT_SETUP_SETTINGS_PATH = "/billing-settings#payout-setup";

type PayoutSetupCenter = {
  id: string;
  customFields: unknown;
  stripeReauthorizationAvailable?: boolean;
};

export function stripeReauthorizationHref(centerId: string) {
  return `/stripe-reauthorization?center=${encodeURIComponent(centerId)}`;
}

export function stripePayoutSetupIsComplete(customFields: unknown) {
  const migration = readStripeConnectMigration(customFields);
  if (migration.targetAccountId && !migration.cutoverAt) {
    return migration.status === "ready_for_cutover";
  }
  return stripeConnectReadinessFromFields(customFields).status === "ready";
}

export function stripePayoutSetupFlowForCenters(
  centers: PayoutSetupCenter[],
  options: { userEmail?: string | null } = {},
) {
  const migrationCenters = centers.filter((center) => {
    const migration = readStripeConnectMigration(center.customFields);
    return Boolean(migration.sourceAccountId && migration.targetAccountId && !migration.cutoverAt);
  });
  const pendingMigrationCenters = migrationCenters.filter(
    (center) => !stripePayoutSetupIsComplete(center.customFields),
  );
  const corporatePortfolio = options.userEmail?.trim().toLowerCase() === CORPORATE_STRIPE_PORTFOLIO_EMAIL;
  const href = corporatePortfolio && migrationCenters.length
    ? CORPORATE_STRIPE_PORTFOLIO_PATH
    : migrationCenters.length === 1 && migrationCenters[0].stripeReauthorizationAvailable !== false
      ? stripeReauthorizationHref(migrationCenters[0].id)
      : PAYOUT_SETUP_SETTINGS_PATH;

  return {
    href,
    complete: centers.length > 0 && centers.every((center) => stripePayoutSetupIsComplete(center.customFields)),
    replacementInProgress: pendingMigrationCenters.length > 0,
    migrationCenterCount: migrationCenters.length,
    pendingMigrationCenterCount: pendingMigrationCenters.length,
  };
}
