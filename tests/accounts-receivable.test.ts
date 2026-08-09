import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  accountBalanceCenterIds,
  buildAccountsReceivableSnapshot,
  buildAccountsReceivableSummary,
  canViewAccountBalances,
  isExecutiveAccountBalanceView,
  type AccountsReceivableFamilyRow,
} from "../src/lib/accounts-receivable";

const asOf = new Date("2026-07-28T16:00:00.000Z");
const families: AccountsReceivableFamilyRow[] = [
  {
    id: "harris",
    name: "Harris Family",
    centerId: "kokomo",
    billingAccount: {
      id: "billing-harris",
      balanceCents: 14200,
      invoices: [
        { id: "harris-overdue", dueDate: new Date("2026-07-21T12:00:00.000Z") },
        { id: "harris-future", dueDate: new Date("2026-08-04T12:00:00.000Z") },
      ],
    },
  },
  {
    id: "davis",
    name: "Davis Family",
    centerId: "kokomo",
    billingAccount: {
      id: "billing-davis",
      balanceCents: 32000,
      invoices: [],
    },
  },
  {
    id: "credit",
    name: "Credit Family",
    centerId: "kokomo",
    billingAccount: {
      id: "billing-credit",
      balanceCents: -25000,
      invoices: [],
    },
  },
  {
    id: "new-family",
    name: "New Family",
    centerId: "kokomo",
    billingAccount: null,
  },
];

test("school account snapshot puts the supplied current families with balances owed first", () => {
  const snapshot = buildAccountsReceivableSnapshot(
    families,
    { kokomo: "Kid City USA - Kokomo" },
    asOf,
  );

  assert.deepEqual(snapshot.accounts.map((account) => account.familyId), [
    "davis",
    "harris",
    "credit",
    "new-family",
  ]);
  assert.equal(snapshot.totalAccountCount, 4);
  assert.equal(snapshot.owingAccountCount, 2);
  assert.equal(snapshot.currentAccountCount, 1);
  assert.equal(snapshot.creditAccountCount, 1);
  assert.equal(snapshot.overdueAccountCount, 1);
  assert.equal(snapshot.totalOwedCents, 46200);
  assert.equal(snapshot.totalCreditCents, -25000);
  assert.equal(snapshot.netBalanceCents, 21200);
  assert.deepEqual(snapshot.schools.map((school) => school.centerId), ["kokomo"]);
  assert.equal(snapshot.schools[0]?.owingAccountCount, 2);

  const harris = snapshot.accounts.find((account) => account.familyId === "harris");
  assert.equal(harris?.centerName, "Kid City USA - Kokomo");
  assert.equal(harris?.openInvoiceCount, 2);
  assert.equal(harris?.overdueInvoiceCount, 1);
  assert.equal(harris?.oldestOpenDueDate, "2026-07-21T12:00:00.000Z");

  const newFamily = snapshot.accounts.find((account) => account.familyId === "new-family");
  assert.equal(newFamily?.status, "current");
  assert.equal(newFamily?.hasBillingAccount, false);
  assert.equal(newFamily?.balanceCents, 0);
});

test("director and executive account visibility remains limited to authorized centers", () => {
  assert.equal(canViewAccountBalances("CENTER_DIRECTOR"), true);
  assert.equal(canViewAccountBalances("ASSISTANT_DIRECTOR"), true);
  assert.equal(canViewAccountBalances("BILLING_ADMIN"), true);
  assert.equal(canViewAccountBalances("BRAND_ADMIN"), true);
  assert.equal(canViewAccountBalances("REGIONAL_MANAGER"), true);
  assert.equal(canViewAccountBalances("READ_ONLY_AUDITOR"), true);
  assert.equal(canViewAccountBalances("TEACHER"), false);
  assert.equal(isExecutiveAccountBalanceView({ role: "BRAND_ADMIN", accessScope: "tenant" }), true);
  assert.equal(isExecutiveAccountBalanceView({ role: "REGIONAL_MANAGER", accessScope: "scoped" }), false);

  assert.deepEqual(accountBalanceCenterIds({
    role: "CENTER_DIRECTOR",
    primaryCenterId: "kokomo",
    centerIds: ["kokomo", "other-school"],
  }), ["kokomo"]);
  assert.deepEqual(accountBalanceCenterIds({
    role: "ASSISTANT_DIRECTOR",
    primaryCenterId: null,
    centerIds: ["kokomo"],
  }), []);
  assert.deepEqual(accountBalanceCenterIds({
    role: "BILLING_ADMIN",
    centerIds: ["kokomo", "kokomo", "muncie"],
  }), ["kokomo", "muncie"]);
  assert.deepEqual(accountBalanceCenterIds({
    role: "TEACHER",
    primaryCenterId: "kokomo",
    centerIds: ["kokomo"],
  }), []);
  assert.deepEqual(accountBalanceCenterIds({
    role: "BRAND_ADMIN",
    centerIds: ["kokomo", "muncie"],
  }), ["kokomo", "muncie"]);
});

test("executive account summary rolls family balances up by visible school", () => {
  const summary = buildAccountsReceivableSummary([
    ...families,
    {
      id: "muncie-family",
      centerId: "muncie",
      name: "Muncie Family",
      billingAccount: {
        id: "billing-muncie",
        balanceCents: 50000,
        invoices: [{ id: "muncie-overdue", dueDate: new Date("2026-07-20T12:00:00.000Z") }],
      },
    },
  ], {
    kokomo: "Kid City USA - Kokomo",
    muncie: "Kid City USA - Muncie",
  }, asOf);

  assert.deepEqual(summary.schools.map((school) => school.centerId), ["muncie", "kokomo"]);
  assert.equal(summary.totalAccountCount, 5);
  assert.equal(summary.owingAccountCount, 3);
  assert.equal(summary.totalOwedCents, 96200);
  assert.equal(summary.overdueAccountCount, 2);
  assert.equal(summary.schools[0]?.totalOwedCents, 50000);
});

test("director and executive dashboard billing widgets use current-family balances", () => {
  const route = readFileSync("src/app/api/dashboard/accounts-receivable/route.ts", "utf8");
  const aiCommandRoute = readFileSync("src/app/api/ai/command/route.ts", "utf8");
  const livePage = readFileSync("src/app/[slug]/page.tsx", "utf8");
  const shell = readFileSync("src/components/app-shell.tsx", "utf8");
  const dashboardPage = readFileSync("src/app/dashboard/page.tsx", "utf8");
  const dashboard = readFileSync("src/components/dashboard.tsx", "utf8");
  const sheet = readFileSync("src/components/accounts-receivable-sheet.tsx", "utf8");

  assert.match(route, /Authentication required/);
  assert.match(route, /canViewAccountBalances\(user\)/);
  assert.match(route, /visibleFamilyWhere\(activeCenterIds\)[\s\S]*children: \{ some: currentlyEnrolledChildWhere\(\) \}/);
  assert.match(route, /private, no-store/);
  assert.match(shell, /canViewAccountBalances\(currentUser\)[\s\S]*AccountsReceivableSheet executive=/);
  assert.match(dashboardPage, /accountsReceivableFamilySelect/);
  assert.match(dashboardPage, /accountsReceivableSummaryFamilySelect/);
  assert.equal((dashboardPage.match(/(?:where: |family: )currentFamilyWhere,/g) ?? []).length >= 3, true);
  assert.match(
    aiCommandRoute,
    /const currentFamilyWhere:[\s\S]*children: \{ some: currentlyEnrolledChildWhere\(\) \}[\s\S]*const openInvoiceWhere:[\s\S]*billingAccount: \{ family: currentFamilyWhere \}/,
  );
  assert.match(
    livePage,
    /if \(slug === "ai-command"\)[\s\S]*const aiCurrentFamilyWhere:[\s\S]*children: \{ some: currentlyEnrolledChildWhere\(\) \}[\s\S]*const aiOpenInvoiceWhere:[\s\S]*billingAccount: \{ family: aiCurrentFamilyWhere \}[\s\S]*invoice\.aggregate\(\{ where: aiOverdueInvoiceWhere/,
  );
  assert.match(dashboard, /dashboard-director-account-balances/);
  assert.match(dashboard, /dashboard-billing-account-balances/);
  assert.match(dashboard, /dashboard-\$\{lens\}-executive-account-balances/);
  assert.match(dashboard, /Current family accounts, with balances owed listed first/);
  assert.match(sheet, /Current family accounts across your visible schools/);
  assert.match(sheet, /Current family accounts in your school/);
});
