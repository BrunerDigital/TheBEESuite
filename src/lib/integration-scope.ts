import { UserRole } from "@prisma/client";
import type { CurrentUser } from "@/lib/auth";
import { isMarketingIntegrationProvider, type IntegrationProvider } from "@/lib/integration-setup";

export const TENANT_INTEGRATION_SCOPE = "tenant";

export function centerIntegrationScopeKey(centerId: string) {
  return `center:${centerId}`;
}

export function integrationScopeKey(centerId?: string | null) {
  return centerId ? centerIntegrationScopeKey(centerId) : TENANT_INTEGRATION_SCOPE;
}

export function integrationCenterIdForUser(
  user: Pick<CurrentUser, "role" | "primaryCenterId">,
  provider: IntegrationProvider,
) {
  if (!isMarketingIntegrationProvider(provider)) return null;
  if (user.role === UserRole.CENTER_DIRECTOR || user.role === UserRole.ASSISTANT_DIRECTOR) {
    return user.primaryCenterId;
  }
  return null;
}

export function integrationScopeForUser(
  user: Pick<CurrentUser, "role" | "primaryCenterId">,
  provider: IntegrationProvider,
) {
  const centerId = integrationCenterIdForUser(user, provider);
  return {
    centerId,
    scopeKey: integrationScopeKey(centerId),
  };
}
