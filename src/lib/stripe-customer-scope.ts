import type { Prisma } from "@prisma/client";

function fields(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function clean(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stringFields(value: unknown): Prisma.InputJsonObject {
  return Object.fromEntries(
    Object.entries(fields(value)).flatMap(([key, item]) => {
      const normalized = clean(item);
      return normalized ? [[key, normalized]] : [];
    }),
  );
}

export function stripeCustomerIdForAccount(customFields: unknown, connectedAccountId?: string | null) {
  const custom = fields(customFields);
  const accountId = clean(connectedAccountId);
  const customerIdsByAccount = fields(custom.stripeCustomerIdsByConnectedAccount);
  const mappedCustomerId = accountId ? clean(customerIdsByAccount[accountId]) : null;
  if (mappedCustomerId) return mappedCustomerId;
  const scopedAccountId = clean(custom.stripeCustomerConnectedAccountId);
  const connectedCustomerId = clean(custom.stripeConnectedCustomerId);
  const primaryCustomerId = clean(custom.stripeCustomerId);

  if (accountId) {
    if (scopedAccountId === accountId) return connectedCustomerId || primaryCustomerId;
    return null;
  }

  if (scopedAccountId) return clean(custom.stripePlatformCustomerId);
  return primaryCustomerId || clean(custom.stripePlatformCustomerId);
}

export function stripeCustomerCustomFieldPatch(
  existingCustomFields: unknown,
  customerId: string,
  connectedAccountId?: string | null,
) {
  const custom = fields(existingCustomFields);
  const existingCustomerId = clean(custom.stripeCustomerId);
  const accountId = clean(connectedAccountId);

  if (accountId) {
    return {
      ...(existingCustomerId && clean(custom.stripeCustomerConnectedAccountId) !== accountId
        ? { stripePlatformCustomerId: clean(custom.stripePlatformCustomerId) || existingCustomerId }
        : {}),
      stripeCustomerId: customerId,
      stripeConnectedCustomerId: customerId,
      stripeCustomerConnectedAccountId: accountId,
      stripeCustomerScope: "connected",
      stripeCustomerIdsByConnectedAccount: {
        ...stringFields(custom.stripeCustomerIdsByConnectedAccount),
        [accountId]: customerId,
        ...(clean(custom.stripeCustomerConnectedAccountId) && existingCustomerId
          ? { [clean(custom.stripeCustomerConnectedAccountId)!]: existingCustomerId }
          : {}),
      },
    } satisfies Prisma.InputJsonObject;
  }

  return {
    stripeCustomerId: customerId,
    stripePlatformCustomerId: customerId,
    stripeCustomerConnectedAccountId: null,
    stripeCustomerScope: "platform",
  } satisfies Prisma.InputJsonObject;
}
