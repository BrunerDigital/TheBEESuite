import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  accountBalanceCenterIds,
  buildAccountsReceivableSnapshot,
  buildAccountsReceivableSummary,
  buildNetReceivableAging,
  buildOutstandingNonInvoiceChargesByAccount,
  canViewAccountBalances,
  isExecutiveAccountBalanceView,
  type AccountsReceivableFamilyRow,
} from "../src/lib/accounts-receivable";

const asOf = new Date("2026-07-28T16:00:00.000Z");
const ledgerEntry = (
  id: string,
  billingAccountId: string,
  amountCents: number,
  invoiceId: string | null,
  effectiveAt: string,
  createdAt = effectiveAt,
) => ({ id, billingAccountId, amountCents, invoiceId, effectiveAt, createdAt });
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

test("aging reconciles partial account payments to the remaining receivable", () => {
  const aging = buildNetReceivableAging(
    [
      { id: "partial", balanceCents: 15_000 },
      { id: "ledger-only", balanceCents: 3_000 },
      { id: "credit", balanceCents: -2_000 },
    ],
    [
      { billingAccountId: "partial", totalCents: 10_000, dueDate: new Date("2026-05-01T00:00:00.000Z") },
      { billingAccountId: "partial", totalCents: 10_000, dueDate: new Date("2026-08-15T00:00:00.000Z") },
    ],
    new Date("2026-08-10T00:00:00.000Z"),
  );

  assert.deepEqual(aging, {
    currentCents: 13_000,
    oneToThirtyCents: 0,
    thirtyOneToSixtyCents: 0,
    sixtyOnePlusCents: 5_000,
  });
  assert.equal(Object.values(aging).reduce((sum, cents) => sum + cents, 0), 18_000);
});

test("aging applies payments to invoices before ledger-only charges", () => {
  const aging = buildNetReceivableAging(
    [{ id: "mixed", balanceCents: 15_000, nonInvoiceChargeCents: 10_000 }],
    [{ billingAccountId: "mixed", totalCents: 10_000, dueDate: new Date("2026-05-01T00:00:00.000Z") }],
    new Date("2026-08-10T00:00:00.000Z"),
  );

  assert.deepEqual(aging, {
    currentCents: 10_000,
    oneToThirtyCents: 0,
    thirtyOneToSixtyCents: 0,
    sixtyOnePlusCents: 5_000,
  });
});

test("settled ledger-only charges do not displace later invoice aging", () => {
  const charges = buildOutstandingNonInvoiceChargesByAccount([
    ledgerEntry("1", "settled", 10_000, null, "2026-05-01T00:00:00.000Z"),
    ledgerEntry("2", "settled", -10_000, null, "2026-05-02T00:00:00.000Z"),
    ledgerEntry("3", "settled", 10_000, "invoice", "2026-06-01T00:00:00.000Z"),
    ledgerEntry("4", "credit-first", -10_000, null, "2026-05-01T00:00:00.000Z"),
    ledgerEntry("5", "credit-first", 10_000, null, "2026-05-02T00:00:00.000Z"),
    ledgerEntry("6", "credit-first", 10_000, "invoice", "2026-06-01T00:00:00.000Z"),
  ]);

  assert.equal(charges.get("settled"), 0);
  assert.equal(charges.get("credit-first"), 0);
  assert.deepEqual(buildNetReceivableAging(
    [{ id: "settled", balanceCents: 10_000, nonInvoiceChargeCents: charges.get("settled") }],
    [{ billingAccountId: "settled", totalCents: 10_000, dueDate: new Date("2026-06-01T00:00:00.000Z") }],
    new Date("2026-08-10T00:00:00.000Z"),
  ), {
    currentCents: 0,
    oneToThirtyCents: 0,
    thirtyOneToSixtyCents: 0,
    sixtyOnePlusCents: 10_000,
  });
});

test("payments reduce invoice charges before older ledger-only charges", () => {
  const charges = buildOutstandingNonInvoiceChargesByAccount([
    ledgerEntry("payment", "mixed", -5_000, null, "2026-06-01T00:00:00.000Z", "2026-06-01T00:00:03.000Z"),
    ledgerEntry("invoice", "mixed", 10_000, "invoice", "2026-06-01T00:00:00.000Z", "2026-06-01T00:00:02.000Z"),
    ledgerEntry("manual", "mixed", 10_000, null, "2026-06-01T00:00:00.000Z", "2026-06-01T00:00:01.000Z"),
  ]);

  assert.equal(charges.get("mixed"), 10_000);
  assert.deepEqual(buildNetReceivableAging(
    [{ id: "mixed", balanceCents: 15_000, nonInvoiceChargeCents: charges.get("mixed") }],
    [{ billingAccountId: "mixed", totalCents: 10_000, dueDate: new Date("2026-06-01T00:00:00.000Z") }],
    new Date("2026-08-10T00:00:00.000Z"),
  ), {
    currentCents: 10_000,
    oneToThirtyCents: 0,
    thirtyOneToSixtyCents: 0,
    sixtyOnePlusCents: 5_000,
  });
});

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

test("aging marks an invoice past due on the next calendar day", () => {
  assert.deepEqual(buildNetReceivableAging(
    [{ id: "calendar-day", balanceCents: 10_000 }],
    [{ billingAccountId: "calendar-day", totalCents: 10_000, dueDate: new Date("2026-08-03T12:00:00.000Z") }],
    new Date("2026-08-04T01:00:00.000Z"),
  ), {
    currentCents: 0,
    oneToThirtyCents: 10_000,
    thirtyOneToSixtyCents: 0,
    sixtyOnePlusCents: 0,
  });
});

test("an open invoice is not overdue until the calendar day after its due date", () => {
  const dueToday = buildAccountsReceivableSnapshot([{
    id: "monday-family",
    name: "Monday Family",
    centerId: "kokomo",
    billingAccount: {
      id: "billing-monday",
      balanceCents: 10_000,
      invoices: [{ id: "due-monday", dueDate: new Date("2026-08-03T12:00:00.000Z") }],
    },
  }], { kokomo: "Kid City USA - Kokomo" }, new Date("2026-08-03T23:30:00.000Z"));

  assert.equal(dueToday.overdueAccountCount, 0);
  assert.equal(dueToday.accounts[0]?.overdueInvoiceCount, 0);
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
  assert.match(dashboardPage, /family: currentFamilyWhere,[\s\S]*balanceCents: \{ gt: 0 \}/);
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
  assert.match(dashboard, /Current-family balances across every school visible to this executive login/);
  assert.match(sheet, /Current family accounts across your visible schools/);
  assert.match(sheet, /Current family accounts in your school/);
  const panel = readFileSync("src/components/accounts-receivable-panel.tsx", "utf8");
  assert.match(panel, /buttonLabel="Print balances"/);
  assert.match(panel, /reportTitle="School Account Balances Report"/);
  assert.match(panel, /Current family accounts, with balances owed listed first/);
  assert.match(panel, /Family balances/);
  assert.match(panel, /Status/);
  assert.match(panel, /Balance/);
  assert.match(panel, /reportSchoolIds = new Set/);
  assert.match(panel, /dateOnly: true/);
  assert.match(panel, /timeZone: "UTC"/);
  assert.match(panel, /account\.familyName/);
  assert.match(panel, /money\(account\.balanceCents\)/);
  assert.match(panel, /This report includes currently enrolled families only/);
});

test("billing, analytics, and payment readiness exclude past families from active balance uses", () => {
  const scope = readFileSync("src/lib/corporate-view-scope.ts", "utf8");
  const livePage = readFileSync("src/app/[slug]/page.tsx", "utf8");
  const liveUi = readFileSync("src/components/live-ops-pages.tsx", "utf8");
  const reporting = readFileSync("src/lib/reporting-analytics.ts", "utf8");

  assert.match(scope, /visibleCurrentFamilyWhere[\s\S]*children: \{ some: currentlyEnrolledChildWhere\(\) \}/);
  assert.match(scope, /visibleFormerFamilyWhere[\s\S]*children: \{ none: currentlyEnrolledChildWhere\(\) \}/);
  assert.match(livePage, /if \(slug === "billing-invoices"\)[\s\S]*visibleCurrentInvoiceWhere\(visibleCenterIds\)/);
  assert.match(livePage, /currentFamilyOutstandingCents[\s\S]*Math\.max\(account\.balanceCents, 0\)/);
  assert.match(livePage, /ledgerRollupRows[\s\S]*billingAccount: currentBillingAccountWhere[\s\S]*take: 1000/);
  assert.equal((livePage.match(/orderBy: \[\{ effectiveAt: "desc" \}, \{ createdAt: "desc" \}, \{ id: "desc" \}\]/g) ?? []).length >= 2, true);
  assert.match(livePage, /buildOutstandingNonInvoiceChargesByAccount\(ledgerEntries\)/);
  assert.match(livePage, /buildLedgerReconciliationReport\(\{[\s\S]*entries: ledgerEntries/);
  assert.match(livePage, /formerFamilyBalanceSummary/);
  assert.match(livePage, /if \(slug === "payments"\)[\s\S]*visibleCurrentInvoiceWhere\(visibleCenterIds\)/);
  assert.match(livePage, /if \(slug === "analytics"\)[\s\S]*visibleCurrentBillingAccountWhere\(visibleCenterIds\)/);
  assert.match(livePage, /buildFtePrefills[\s\S]*billingAccount\.findMany\([\s\S]*children: \{ some: currentlyEnrolledChildWhere\(\) \}/);
  assert.match(liveUi, /Past family balances — excluded from current outstanding/);
  assert.match(liveUi, /Past family — historical account/);
  assert.match(reporting, /invoice\.isCurrentFamily && \(invoice\.status === PaymentStatus\.OPEN/);
  assert.match(reporting, /Current-family open AR/);
});
