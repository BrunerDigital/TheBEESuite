import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { helpNavigationCardsFor } from "../src/lib/help-navigation";
import { canAccessModule, canAccessResolvedModuleRoute } from "../src/lib/rbac";

const source = (file: string) => readFileSync(file, "utf8");
test("Help labels only link to directly authorized canonical modules", () => {
  const all = ["guides", "support", "school-setup", "families", "attendance", "billing", "compliance", "reports"];
  const expected: Record<string, string[]> = {
    PLATFORM_OWNER: all, BRAND_ADMIN: all, REGIONAL_MANAGER: all, CENTER_DIRECTOR: all, ASSISTANT_DIRECTOR: all,
    TEACHER: ["guides", "support", "attendance"], BILLING_ADMIN: ["guides", "support", "billing"],
    READ_ONLY_AUDITOR: ["guides", "support", "families", "billing", "compliance", "reports"],
  };
  const moduleForCard: Record<string, string> = { "school-setup": "school-setup", families: "family-detail", attendance: "attendance", billing: "billing-invoices", compliance: "compliance", reports: "analytics" };
  for (const [role, keys] of Object.entries(expected)) for (const accessScope of ["center", "tenant"]) {
    const subject = { role, accessScope, centerIds: ["fake-school"] };
    const links = helpNavigationCardsFor(subject);
    assert.deepEqual(links.map(link => link.key), keys, `${role}/${accessScope}`);
    assert.equal(new Set(links.map(link => link.href)).size, links.length);
    for (const link of links.slice(2)) {
      assert.equal(canAccessModule(subject, moduleForCard[link.key]), true);
      assert.equal(canAccessResolvedModuleRoute(subject, new URL(link.href, "https://example.invalid").pathname.slice(1), moduleForCard[link.key]), true);
    }
  }
  for (const role of ["PARENT_GUARDIAN", "AUTHORIZED_PICKUP"]) assert.equal(canAccessModule(role, "help"), false);
});
test("Help fetches assigned alerts and scoped support only, not broader work queues", () => {
  const route = source("src/app/[slug]/page.tsx").split('if (slug === "help") {')[1].split("return null;")[0];
  assert.doesNotMatch(route, /prisma\.(task|message|document)|\.count\(/);
  for (const pattern of [/userId: user\.id/, /activeNotificationWhere\(today\)/, /tenantId: user\.tenantId/, /centerId: scopedCenterIds/, /take: 12/, /take: 25/, /helpNavigationCardsFor\(user\)/, /canManageOperations\(user\) && canAccessModule\(user, "announcements"\)/]) assert.match(route, pattern);
  const view = source("src/components/help-page.tsx");
  assert.doesNotMatch(view, /OperationsActionHub|StatCard|Unread|data\.stats/);
  assert.match(view, /aria-label="Help shortcuts"/);
  assert.match(view, /Up to 12 active notifications/);
  assert.match(view, /Up to 25 most recent support events/);
  assert.match(view, /href="\/announcements"/);
});
test("Announcement destination retains authorized school options without sending", () => {
  const route = source("src/app/[slug]/page.tsx").split('<AnnouncementsPage')[1].split('/>')[0];
  assert.match(route, /centers: centers\.map/);
  const view = source("src/components/live-ops-pages.tsx").split("export function AnnouncementsPage")[1].split("export type CampaignsPageData")[0];
  assert.match(view, /defaultEntity="announcement" centers=\{data\.centers\}/);
});
test("Authoritative pending verification survives return flags and offers only a read refresh", () => {
  const form = source("src/components/payment-method-request-form.tsx");
  assert.match(form, /const showPendingBankVerification = bankVerificationPending;/);
  assert.match(form, /focus === "instant-bank" && !showPendingBankVerification/);
  assert.doesNotMatch(form, /Connect your bank account to complete verification/);
  assert.equal((form.match(/disabled=\{isPending \|\| bankVerificationPending\}/g) ?? []).length, 2);
  assert.match(form, /onClick=\{\(\) => window\.location\.reload\(\)\}/);
  assert.match(form, /Check status/);
  assert.match(form, /disabled=\{isPending\}[^\n]*onClick=\{\(\) => window\.location\.reload/);
  assert.match(form, /setupMethods\.map/);
  assert.doesNotMatch(form, /order-[12]/);
  assert.match(form, /nextOpenInvoice && !reauthorization/);
  assert.match(source("src/app/api/billing/payment-method-request/session/route.ts"), /if \(currentFields\.stripeBankVerificationPending === true\)/);
});
test("Demo billing explanation does not suppress ordinary payment outages or mutation guards", () => {
  const portal = source("src/components/parent-portal-workspace.tsx");
  assert.match(portal, /appReviewMode \? \([\s\S]*?Demo billing preview[\s\S]*?\) : checkoutBlocked \? \([\s\S]*?Online Payments Are Temporarily Unavailable/);
  assert.match(portal, /Payments, saved-method changes and autopay changes are disabled/);
  assert.match(portal, /paymentsReadOnly/);
});

test("Public payment presentation stays connected to token validation and the real form", () => {
  const route = source("src/app/payment-method-form/[token]/page.tsx");
  assert.match(route, /InvalidPaymentSetupLink as InvalidLink, PublicPaymentPageShell/);
  assert.match(route, /if \(!validation\.ok\)[\s\S]*return <InvalidLink/);
  assert.match(route, /<PublicPaymentPageShell[\s\S]*<PaymentMethodRequestForm[\s\S]*<\/PublicPaymentPageShell>/);
  const shell = source("src/components/public-payment-page-shell.tsx");
  assert.match(shell, /children: ReactNode/);
  assert.match(shell, /\{children\}/);
  assert.doesNotMatch(shell, /fetch\(|prisma|\/api\//);
});
