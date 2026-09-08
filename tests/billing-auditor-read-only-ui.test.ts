import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { UserRole } from "@prisma/client";
import { canManageBilling } from "../src/lib/auth";
import { canAccessModule } from "../src/lib/rbac";

const billingPageSource = readFileSync("src/components/live-ops-pages.tsx", "utf8");
const ledgerSource = readFileSync("src/components/family-ledger-card.tsx", "utf8");
const pageLoaderSource = readFileSync("src/app/[slug]/page.tsx", "utf8");

test("billing auditor keeps reporting access while the page hides every billing mutation surface", () => {
  const auditor = { role: UserRole.READ_ONLY_AUDITOR, accessScope: "tenant" as const };
  assert.equal(canAccessModule(auditor, "billing-invoices"), true);
  assert.equal(canManageBilling(auditor), false);

  assert.match(pageLoaderSource, /readOnly: !canManageBilling\(user\)/);
  assert.match(billingPageSource, /data\.initialSelection\?\.workspace === "terminal" && !data\.readOnly/);
  assert.match(billingPageSource, /\{!data\.readOnly \? \([\s\S]*?Open Payment Terminal[\s\S]*?\) : null\}/);
  assert.match(billingPageSource, /Read-only billing view/);
  assert.match(billingPageSource, /Payment, invoice, enrollment, and billing-setup changes are hidden for auditor accounts\./);
  assert.match(billingPageSource, /\{!data\.readOnly \? \(\s*<BillingWorkbench/);
  assert.match(billingPageSource, /\{!data\.readOnly \? <TableHead>Payment Actions<\/TableHead> : null\}/);
  assert.match(billingPageSource, /\{!data\.readOnly \? \([\s\S]*?<InvoiceStoredPaymentButton invoice=\{invoice\} \/>[\s\S]*?\) : null\}/);
  assert.match(billingPageSource, /data\.readOnly \? \([\s\S]*?Read only[\s\S]*?Complete enrollment/);
  assert.match(billingPageSource, /data\.readOnly \? invoice\.number : \([\s\S]*?billingFamilyHref/);
  assert.match(billingPageSource, /data\.readOnly \? \([\s\S]*?<span className="font-medium">\{invoice\.billingAccount\.family\.name\}<\/span>/);
  assert.match(billingPageSource, /<AgencySubsidyWorkspace /);
  assert.match(billingPageSource, /<FamilyLedgerCard[\s\S]*?readOnly=\{data\.readOnly\}/);
  assert.match(ledgerSource, /\{!readOnly \? \([\s\S]*?Family profile[\s\S]*?\) : null\}/);
});

test("billing mutation APIs retain an explicit auditor-denial gate", () => {
  assert.equal(canManageBilling({ role: UserRole.READ_ONLY_AUDITOR }), false);

  const guardedRoutes = [
    ["invoices", "src/app/api/billing/invoices/route.ts", /if \(!canManageBilling\(user\)\)/],
    ["autopay", "src/app/api/billing/autopay/route.ts", /if \(!canManageBilling\(user\)\)/],
    ["checkout", "src/app/api/billing/checkout-session/route.ts", /if \(!userCanManageBilling && !userIsParentGuardian\)/],
    ["payment-method request", "src/app/api/billing/payment-method-requests/route.ts", /if \(!canManageBilling\(user\)\)/],
    ["tuition recovery", "src/app/api/billing/tuition-recovery/route.ts", /if \(!canManageBilling\(user\)\)/],
    ["tuition assignments", "src/app/api/billing/tuition-assignments/route.ts", /if \(!canManageBilling\(user\)\)/],
    ["terminal payment", "src/app/api/billing/terminal-payment/route.ts", /if \(!canManageBilling\(user\)\)/],
  ] as const;

  for (const [name, path, gate] of guardedRoutes) {
    assert.match(readFileSync(path, "utf8"), gate, `${name} lost its server-side billing-role denial`);
  }
});
