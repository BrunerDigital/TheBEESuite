import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { UserRole } from "@prisma/client";
import {
  canManageExecutiveMarketingPortfolio,
  isManagerAssignedMarketingConnection,
  marketingAccountIdFromConfig,
  MAX_EXECUTIVE_MARKETING_ASSIGNMENTS,
  normalizeExecutiveMarketingAssignments,
  suggestMarketingAccount,
  suggestMarketingCenter,
  type MarketingPortfolioCenter,
} from "@/lib/executive-marketing";

const centers: MarketingPortfolioCenter[] = [
  {
    id: "sarasota",
    name: "Kid City USA - Sarasota",
    crmLocationId: "FL | Sarasota",
    city: "Sarasota",
    state: "FL",
  },
  {
    id: "beach",
    name: "Kid City USA - Beach Boulevard",
    crmLocationId: "FL | Beach Boulevard",
    city: "Jacksonville",
    state: "FL",
  },
];

test("executive marketing portfolio is limited to executive roles", () => {
  assert.equal(canManageExecutiveMarketingPortfolio(UserRole.PLATFORM_OWNER), true);
  assert.equal(canManageExecutiveMarketingPortfolio(UserRole.BRAND_ADMIN), true);
  assert.equal(canManageExecutiveMarketingPortfolio(UserRole.REGIONAL_MANAGER), true);
  assert.equal(canManageExecutiveMarketingPortfolio(UserRole.CENTER_DIRECTOR), false);
  assert.equal(canManageExecutiveMarketingPortfolio(UserRole.ASSISTANT_DIRECTOR), false);
});

test("profile suggestions use strong school identifiers", () => {
  const suggestion = suggestMarketingAccount(centers[0], centers, [
    { id: "beach-page", label: "Kid City USA Beach Boulevard", kind: "Facebook Page" },
    { id: "sarasota-page", label: "Kid City USA Sarasota", kind: "Facebook Page" },
  ]);
  assert.equal(suggestion?.id, "sarasota-page");
});

test("profile suggestions fail closed when matches are ambiguous", () => {
  const suggestion = suggestMarketingAccount(centers[0], centers, [
    { id: "one", label: "Sarasota FL", kind: "Google Business location" },
    { id: "two", label: "Sarasota FL Main", kind: "Google Business location" },
  ]);
  assert.equal(suggestion, null);
});

test("only explicit manager-assigned OAuth metadata activates delegated protections", () => {
  assert.equal(isManagerAssignedMarketingConnection({ oauth: { assignedFromManagerScope: true } }), true);
  assert.equal(isManagerAssignedMarketingConnection({ oauth: { assignedFromManagerScope: false } }), false);
  assert.equal(isManagerAssignedMarketingConnection({ oauth: {} }), false);
  assert.equal(isManagerAssignedMarketingConnection(null), false);
});

test("school suggestions fail closed unless one school matches a profile", () => {
  assert.equal(suggestMarketingCenter(
    { id: "sarasota-page", label: "Kid City USA Sarasota", kind: "Facebook Page" },
    centers,
  )?.id, "sarasota");
  assert.equal(suggestMarketingCenter(
    { id: "generic-page", label: "Kid City USA", kind: "Facebook Page" },
    centers,
  ), null);
});

test("bulk profile assignments are normalized and bounded", () => {
  assert.deepEqual(normalizeExecutiveMarketingAssignments([
    { accountId: " page-1 ", centerId: " school-1 " },
    { accountId: "page-2", centerId: "school-2" },
  ]), {
    ok: true,
    assignments: [
      { accountId: "page-1", centerId: "school-1" },
      { accountId: "page-2", centerId: "school-2" },
    ],
  });

  const tooMany = Array.from({ length: MAX_EXECUTIVE_MARKETING_ASSIGNMENTS + 1 }, (_, index) => ({
    accountId: `page-${index}`,
    centerId: `school-${index}`,
  }));
  assert.equal(normalizeExecutiveMarketingAssignments(tooMany).ok, false);
});

test("bulk profile assignments reject duplicate profiles and duplicate schools", () => {
  assert.deepEqual(normalizeExecutiveMarketingAssignments([
    { accountId: "page-1", centerId: "school-1" },
    { accountId: "page-1", centerId: "school-2" },
  ]), {
    ok: false,
    error: "Each provider profile can be imported only once in the same batch.",
  });
  assert.deepEqual(normalizeExecutiveMarketingAssignments([
    { accountId: "page-1", centerId: "school-1" },
    { accountId: "page-2", centerId: "school-1" },
  ]), {
    ok: false,
    error: "Choose only one profile per school for this platform.",
  });
});

test("provider setup config resolves back to the imported profile id", () => {
  assert.equal(marketingAccountIdFromConfig("meta_social", { facebookPageId: "page-1" }), "page-1");
  assert.equal(marketingAccountIdFromConfig("google_business", {
    accountId: "business-1",
    locationId: "location-1",
  }), "business-1:location-1");
  assert.equal(marketingAccountIdFromConfig("google_ads", { customerId: "1234567890" }), "1234567890");
  assert.equal(marketingAccountIdFromConfig("microsoft_ads", { accountId: "account-1" }), "account-1");
});

test("executive batch import revalidates tenant schools and saves atomically", () => {
  const route = readFileSync(
    new URL("../src/app/api/integrations/executive-marketing/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(route, /action === "assign_many"/);
  assert.match(route, /organization: \{ tenantId: user\.tenantId \}/);
  assert.match(route, /activeCenterCount !== assignments\.length/);
  assert.match(route, /prisma\.\$transaction/);
  assert.match(route, /integration\.executive\.profile_assigned/);
});

test("director self-service OAuth remains school scoped", () => {
  const startRoute = readFileSync(
    new URL("../src/app/api/integrations/oauth/[provider]/start/route.ts", import.meta.url),
    "utf8",
  );
  const selectionRoute = readFileSync(
    new URL("../src/app/api/integrations/oauth/[provider]/select-account/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(startRoute, /UserRole\.CENTER_DIRECTOR/);
  assert.match(startRoute, /integrationScopeForUser\(user, provider\)/);
  assert.match(selectionRoute, /UserRole\.CENTER_DIRECTOR/);
  assert.match(selectionRoute, /scope\.scopeKey/);
  assert.match(selectionRoute, /scope\.centerId/);
});

test("manager-assigned profiles stay bound until a director completes their own OAuth", () => {
  const setupRoute = readFileSync(
    new URL("../src/app/api/integrations/setup/route.ts", import.meta.url),
    "utf8",
  );
  const selectionRoute = readFileSync(
    new URL("../src/app/api/integrations/oauth/[provider]/select-account/route.ts", import.meta.url),
    "utf8",
  );
  const callbackRoute = readFileSync(
    new URL("../src/app/api/integrations/oauth/[provider]/callback/route.ts", import.meta.url),
    "utf8",
  );
  const credentialStore = readFileSync(
    new URL("../src/lib/integration-credentials.ts", import.meta.url),
    "utf8",
  );

  assert.match(setupRoute, /isDirectorRole\(user\.role\) && isManagerAssignedMarketingConnection\(existing\?\.configPlaceholder\)/);
  assert.match(setupRoute, /Reconnect this platform with your own provider login/);
  assert.match(selectionRoute, /isDirectorRole\(user\.role\) && isManagerAssignedMarketingConnection\(existing\.configPlaceholder\)/);
  assert.match(callbackRoute, /replacingManagerAssignment \? \{\} : readIntegrationConfig/);
  assert.match(callbackRoute, /replaceTenantIntegrationCredentials/);
  assert.match(callbackRoute, /isManagerAssignedMarketingConnection\(existing\?\.configPlaceholder\)/);
  assert.match(credentialStore, /integrationCredential\.deleteMany/);
  assert.match(credentialStore, /integrationCredential\.create/);
});
