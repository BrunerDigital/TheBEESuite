import { UserRole } from "@prisma/client";
import type { IntegrationProvider } from "@/lib/integration-setup";
import type { MarketingAccountCandidate } from "@/lib/marketing-account-discovery";

export type MarketingPortfolioCenter = {
  id: string;
  name: string;
  crmLocationId: string | null;
  city: string | null;
  state: string | null;
};

export type ExecutiveMarketingAssignment = {
  accountId: string;
  centerId: string;
};

export type ExecutiveMarketingAssignmentResult =
  | { ok: true; assignments: ExecutiveMarketingAssignment[] }
  | { ok: false; error: string };

export const MAX_EXECUTIVE_MARKETING_ASSIGNMENTS = 25;

const executiveMarketingRoles = new Set<UserRole>([
  UserRole.PLATFORM_OWNER,
  UserRole.BRAND_ADMIN,
  UserRole.REGIONAL_MANAGER,
]);

function normalized(value: string | null | undefined) {
  return (value ?? "")
    .toLocaleLowerCase("en-US")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function containsPhrase(value: string, phrase: string) {
  return phrase.length >= 4 && ` ${value} `.includes(` ${phrase} `);
}

export function canManageExecutiveMarketingPortfolio(role: UserRole) {
  return executiveMarketingRoles.has(role);
}

export function isManagerAssignedMarketingConnection(value: unknown) {
  const connection = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const oauth = connection.oauth && typeof connection.oauth === "object" && !Array.isArray(connection.oauth)
    ? connection.oauth as Record<string, unknown>
    : {};
  return oauth.assignedFromManagerScope === true;
}

function cleanIdentifier(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export function normalizeExecutiveMarketingAssignments(value: unknown): ExecutiveMarketingAssignmentResult {
  if (!Array.isArray(value) || !value.length) {
    return { ok: false, error: "Select at least one profile and school." };
  }
  if (value.length > MAX_EXECUTIVE_MARKETING_ASSIGNMENTS) {
    return {
      ok: false,
      error: `Import up to ${MAX_EXECUTIVE_MARKETING_ASSIGNMENTS} profiles at a time.`,
    };
  }

  const assignments = value.map((item) => {
    const row = item && typeof item === "object" && !Array.isArray(item)
      ? item as Record<string, unknown>
      : {};
    return {
      accountId: cleanIdentifier(row.accountId, 300),
      centerId: cleanIdentifier(row.centerId, 200),
    };
  });
  if (assignments.some((assignment) => !assignment.accountId || !assignment.centerId)) {
    return { ok: false, error: "Every selected profile must have an active school." };
  }
  if (new Set(assignments.map((assignment) => assignment.accountId)).size !== assignments.length) {
    return { ok: false, error: "Each provider profile can be imported only once in the same batch." };
  }
  if (new Set(assignments.map((assignment) => assignment.centerId)).size !== assignments.length) {
    return { ok: false, error: "Choose only one profile per school for this platform." };
  }
  return { ok: true, assignments };
}

function configString(config: Record<string, string | boolean>, key: string) {
  const value = config[key];
  return typeof value === "string" ? value.trim() : "";
}

export function marketingAccountIdFromConfig(
  provider: IntegrationProvider,
  config: Record<string, string | boolean>,
) {
  if (provider === "meta_social") return configString(config, "facebookPageId");
  if (provider === "meta_ads" || provider === "linkedin_ads") return configString(config, "adAccountId");
  if (provider === "google_ads") return configString(config, "customerId");
  if (provider === "tiktok_ads") return configString(config, "advertiserId");
  if (provider === "linkedin_social") return configString(config, "organizationId");
  if (provider === "x_social") return configString(config, "userId");
  if (provider === "tiktok_social") return configString(config, "openId");
  if (provider === "pinterest_social") return configString(config, "boardId");
  if (provider === "google_business") {
    const accountId = configString(config, "accountId");
    const locationId = configString(config, "locationId");
    return accountId && locationId ? `${accountId}:${locationId}` : "";
  }
  return "";
}

export function suggestMarketingAccount(
  center: MarketingPortfolioCenter,
  centers: MarketingPortfolioCenter[],
  candidates: MarketingAccountCandidate[],
) {
  if (!candidates.length) return null;
  const centerName = normalized(center.name);
  const crmLocationId = normalized(center.crmLocationId);
  const city = normalized(center.city);
  const state = normalized(center.state);
  const uniqueCity = Boolean(city) && centers.filter((item) => normalized(item.city) === city).length === 1;

  const scored = candidates.flatMap((candidate) => {
    const label = normalized(candidate.label);
    let score = 0;
    if (containsPhrase(label, centerName)) score = 100;
    else if (containsPhrase(label, crmLocationId)) score = 95;
    else if (uniqueCity && containsPhrase(label, city) && (!state || containsPhrase(label, state))) score = 85;
    else if (uniqueCity && containsPhrase(label, city)) score = 70;
    return score ? [{ candidate, score }] : [];
  }).sort((left, right) => right.score - left.score);

  if (!scored.length || (scored[1] && scored[1].score === scored[0].score)) return null;
  return scored[0].candidate;
}

export function suggestMarketingCenter(
  candidate: MarketingAccountCandidate,
  centers: MarketingPortfolioCenter[],
) {
  const matches = centers.filter((center) =>
    suggestMarketingAccount(center, centers, [candidate])?.id === candidate.id
  );
  return matches.length === 1 ? matches[0] : null;
}
