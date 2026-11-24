import "server-only";
import { getCurrentUser, getLeadScopeWhere } from "./auth";
import { prisma } from "./prisma";
import { listStripeBalanceTransactions, listStripePayouts, retrieveStripeConnectedAccount } from "./integrations";
import { schoolPaymentsBoundAuthority } from "./school-payments-readonly-authority";
import { canOpenSchoolPaymentsReadonly } from "./school-payments-readonly-entry";
import { readSchoolPaymentsSnapshot, type SchoolPaymentsWindow } from "./school-payments-readonly-adapter";
import type { SchoolPaymentsReadAuthority } from "./school-payments-readonly-server";

// Request-scoped adapters only. Importing this module performs no reads. Every
// call is behind the page's disabled-by-default server gate and existing grants.
// No status/onboarding route is invoked; those routes can write on GET.
export function schoolPaymentsRuntime(window: SchoolPaymentsWindow) {
  return {
    currentUser: getCurrentUser,
    schools: async (user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>) => {
      if (!canOpenSchoolPaymentsReadonly(user)) return [];
      return prisma.center.findMany({ where: { ...getLeadScopeWhere(user), status: "active", organization: { tenantId: user.tenantId } },
        select: { id: true, name: true }, orderBy: { name: "asc" } });
    },
    loadAuthority: (user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>, centerId: string) => schoolPaymentsBoundAuthority(user, centerId, {
      center: (tenantId, id) => prisma.center.findFirst({ where: { id, status: "active", organization: { tenantId } },
        select: { id: true, name: true, customFields: true, updatedAt: true, organization: { select: { tenantId: true } } } }),
      account: (tenantId, accountId) => retrieveStripeConnectedAccount(accountId, { tenantId }),
    }),
    read: (authority: SchoolPaymentsReadAuthority) => readSchoolPaymentsSnapshot(authority, window, {
      local: query => prisma.payment.findMany(query),
      balanceTransactions: async (scope, period) => {
        const r = await listStripeBalanceTransactions({ connectedAccountId: scope.accountId, tenantId: scope.tenantId,
          createdGte: period.start, createdLte: period.end, limit: 100, includeReadEvidence: true });
        return { ok: r.ok, hasMore: r.hasMore, pageComplete: r.pageComplete, rows: r.transactions };
      },
      payouts: async (scope, period) => {
        const r = await listStripePayouts({ connectedAccountId: scope.accountId, tenantId: scope.tenantId,
          createdGte: period.start, createdLte: period.end, limit: 100, includeReadEvidence: true });
        return { ok: r.ok, hasMore: r.hasMore, pageComplete: r.pageComplete, rows: r.payouts };
      },
    }),
  };
}
