import { canAccessCenter, type CurrentUser } from "./auth";
import type { StripeConnectedAccountSnapshot } from "./integrations";
import { canOpenSchoolPaymentsReadonly } from "./school-payments-readonly-entry";
import { readStripeConnectAccountId } from "./stripe-connect-readiness";
import { verifyStripeConnectAccountBinding } from "./stripe-connect-setup";
import type { SchoolPaymentsReadAuthority } from "./school-payments-readonly-server";

type CenterBinding = { id: string; name: string; updatedAt: Date; customFields: unknown; organization: { tenantId: string } };
export async function schoolPaymentsBoundAuthority(user: CurrentUser, centerId: string, deps: {
  center(tenantId: string, centerId: string): Promise<CenterBinding | null>;
  account(tenantId: string, accountId: string): Promise<{ ok: boolean; account?: StripeConnectedAccountSnapshot }>;
}): Promise<SchoolPaymentsReadAuthority | null> {
  if (!canOpenSchoolPaymentsReadonly(user) || !canAccessCenter(user, centerId)) return null;
  const center = await deps.center(user.tenantId, centerId);
  if (!center || center.id !== centerId || center.organization.tenantId !== user.tenantId) return null;
  const fields = center.customFields && typeof center.customFields === "object" ? center.customFields as Record<string, unknown> : {};
  if (fields.stripeConnectAccountId && fields.stripeConnectedAccountId && fields.stripeConnectAccountId !== fields.stripeConnectedAccountId) return null;
  const accountId = readStripeConnectAccountId(fields);
  if (!accountId || !/^acct_[A-Za-z0-9_]+$/.test(accountId)) return null;
  const result = await deps.account(user.tenantId, accountId), account = result.account;
  if (!result.ok || !account || !verifyStripeConnectAccountBinding(accountId, account.id).ok
    || !["full", "express", "none"].includes(account.dashboard ?? "")
    || !(account.configurations.includes("merchant") || account.merchantCapabilityStatus || account.chargesEnabled)) return null;
  return { revision: center.updatedAt.toISOString(), historyBindings: [], scope: { tenantId: user.tenantId, centerId, accountId,
    schoolName: center.name, accountVerified: true, dashboard: account.dashboard as "full" | "express" | "none", chargeTopology: "connected_direct",
    readCapabilities: { paymentStatus: true, balances: true, payouts: true } } };
}
