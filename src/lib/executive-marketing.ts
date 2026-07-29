import { UserRole } from "@prisma/client";
import type { MarketingAccountCandidate } from "@/lib/marketing-account-discovery";

export type MarketingPortfolioCenter = {
  id: string;
  name: string;
  crmLocationId: string | null;
  city: string | null;
  state: string | null;
};

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
