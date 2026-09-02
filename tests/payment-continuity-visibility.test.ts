import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PaymentStatus } from "@prisma/client";
import { currentOrOutstandingFamilyWhere } from "@/lib/corporate-view-scope";
import { currentlyEnrolledChildWhere } from "@/lib/enrollment-status";

const page = readFileSync(new URL("../src/app/[slug]/page.tsx", import.meta.url), "utf8");
const parentPortal = readFileSync(new URL("../src/components/parent-portal-workspace.tsx", import.meta.url), "utf8");
const billingWorkbench = readFileSync(new URL("../src/components/billing-workbench.tsx", import.meta.url), "utf8");

test("payment continuity includes current families and past families with a payable balance or invoice", () => {
  assert.deepEqual(currentOrOutstandingFamilyWhere(), {
    OR: [
      { children: { some: currentlyEnrolledChildWhere() } },
      {
        billingAccount: {
          is: {
            OR: [
              { balanceCents: { gt: 0 } },
              { invoices: { some: { status: { in: [PaymentStatus.OPEN, PaymentStatus.FAILED] } } } },
            ],
          },
        },
      },
    ],
  });
});

test("parent payment continuity keeps guardian and tenant scopes fail-closed", () => {
  assert.match(page, /linkedParentFamilies[\s\S]*AND: \[[\s\S]*parentPortalFamilyScopeWhere\(\{ userId: user\.id \}\)[\s\S]*parentPortalTenantFamilyWhere\(parentPortalTenantCenterIds\)[\s\S]*currentOrOutstandingFamilyWhere\(\)/);
  assert.match(page, /requestedFamilyId: selectedParentFamilyId[\s\S]*parentPortalTenantFamilyWhere\(parentPortalTenantCenterIds\)[\s\S]*currentOrOutstandingFamilyWhere\(\)/);
});

test("past parent accounts land on payments without restoring classroom or autopay access", () => {
  assert.match(page, /paymentContinuityAccess = Boolean\(family && family\.children\.length === 0\)/);
  assert.match(page, /linkedParentFamilies\.find\(\(item\) => item\.children\.length > 0\)\?\.id \?\? linkedParentFamilies\[0\]\?\.id/);
  assert.match(page, /resolvedParentPortalView = paymentContinuityAccess \? "payments" : parentPortalView/);
  assert.match(page, /paymentContinuityAccess=\{paymentContinuityAccess\}/);
  assert.match(parentPortal, /Your billing access remains available/);
  assert.match(parentPortal, /autopayUnavailable = paymentContinuityAccess/);
  assert.match(parentPortal, /Autopay unavailable/);
  assert.match(parentPortal, /one-time payment does not reactivate enrollment or autopay/);
  assert.match(parentPortal, /!paymentContinuityAccess \? \([\s\S]*Billing settings/);
});

test("payment continuity is isolated from general parent mutations and non-payment data", () => {
  const familyScope = readFileSync(new URL("../src/lib/parent-portal-family-scope.ts", import.meta.url), "utf8");
  const checkoutRoute = readFileSync(new URL("../src/app/api/billing/checkout-session/route.ts", import.meta.url), "utf8");
  const familyPaymentRoute = readFileSync(new URL("../src/app/api/billing/family-payment/route.ts", import.meta.url), "utf8");
  assert.match(familyScope, /getParentPortalPaymentFamilyScope[\s\S]*parentPortalTenantFamilyWhere\(tenantCenterIds\)[\s\S]*currentOrOutstandingFamilyWhere\(\)/);
  assert.match(checkoutRoute, /getParentPortalPaymentFamilyScope\(user\.id, user\.tenantId,/);
  assert.match(familyPaymentRoute, /method === "saved_method"[\s\S]*getParentPortalFamilyScope[\s\S]*getParentPortalPaymentFamilyScope/);
  assert.match(page, /familyId: parentPortalContentFamilyId/);
  assert.match(page, /messages=\{paymentContinuityAccess \? \[\] : signedMessages\}/);
  assert.match(page, /accountDeletionRequest=\{paymentContinuityAccess \? null : accountDeletionRequest\}/);
});

test("director billing finds past payable accounts but keeps them payment-only", () => {
  assert.match(page, /workbenchFamilyWhere[\s\S]*currentOrOutstandingFamilyWhere\(\)/);
  assert.match(page, /accountCategory: family\.children\.length \? "current" as const : "past" as const/);
  assert.match(billingWorkbench, /Past family payment access/);
  assert.match(billingWorkbench, /effectivePaymentTarget\.startsWith\("invoice:"\) && !selectedFamilyIsPast/);
  assert.match(billingWorkbench, /disabled=\{isPending \|\| !selectedBillingAccount \|\| directorPaymentAmountCents <= 0\}[\s\S]*Digital Terminal/);
  assert.match(billingWorkbench, /Create Invoice[\s\S]*Past family payment access|selectedFamilyIsPast[\s\S]*Create Invoice/);
});
