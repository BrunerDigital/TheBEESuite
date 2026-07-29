import assert from "node:assert/strict";
import test from "node:test";
import { UserRole } from "@prisma/client";
import {
  canManageExecutiveMarketingPortfolio,
  suggestMarketingAccount,
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
