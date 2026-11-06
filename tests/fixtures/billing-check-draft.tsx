import React from "react";
import { createRoot } from "react-dom/client";
import { BillingWorkbench, type BillingWorkbenchFamily } from "../../src/components/billing-workbench";
import { InvoicePrintButton, PaymentReceiptPrintButton } from "../../src/components/billing-print-actions";

const schools = [
  { id: "school-one", name: "Fixture School One", crmLocationId: null, classrooms: [], ein: "00-0000001" },
  { id: "school-two", name: "Fixture School Two", crmLocationId: null, classrooms: [], ein: "00-0000002" },
];
const families: BillingWorkbenchFamily[] = [
  { id: "alpha", centerId: "school-one", name: "Fixture Alpha Family", accountCategory: "current", billingEmail: null, guardians: [], children: [], billingAccount: { id: "account-alpha", balanceCents: 1000, autopayPlaceholder: false } },
  { id: "beta", centerId: "school-one", name: "Fixture Beta Family", accountCategory: "current", billingEmail: null, guardians: [], children: [], billingAccount: { id: "account-beta", balanceCents: 2000, autopayPlaceholder: false } },
  { id: "gamma", centerId: "school-two", name: "Fixture Gamma Family", accountCategory: "current", billingEmail: null, guardians: [], children: [], billingAccount: { id: "account-gamma", balanceCents: 3000, autopayPlaceholder: false } },
];
const accountOverviewFixtures = Object.fromEntries(families.map(family => [family.id, {
  familyId: family.id, centerId: family.centerId!, billingAccountId: family.billingAccount!.id,
  postedBalanceCents: family.billingAccount!.balanceCents, collectibleCents: family.billingAccount!.balanceCents,
  responsibilityReviewRequired: false, pendingCount: 0, provisionalAchCreditCents: 0,
}]));
const ledger = {
  schools,
  accounts: families.map(family => ({ familyId: family.id, familyName: family.name, billingEmail: null, centerId: family.centerId, balanceCents: family.billingAccount!.balanceCents })),
  entries: families.map(family => ({
    id: `entry-${family.id}`, type: "TUITION_CHARGE", description: `Loaded tuition for ${family.id}`,
    amountCents: family.billingAccount!.balanceCents, balanceAfterCents: family.billingAccount!.balanceCents,
    effectiveAt: "2026-10-30T18:00:00.000Z", billingAccount: { family },
  })),
};

createRoot(document.getElementById("root")!).render(<>
  <BillingWorkbench families={families} centers={schools} products={[]} tuitionPlans={[]} currentRole="CENTER_DIRECTOR" currentUserId="fixture-director"
    canOpenFamilyProfile canManageEnrollment={false} initialFamilyId="alpha" initialCenterId="school-one"
    initialSection="payments" ledger={ledger} accountOverviewFixtures={accountOverviewFixtures} />
  <section aria-label="Existing director documents">
    <InvoicePrintButton buttonLabel="Open fixture invoice" familyName="Fixture Alpha Family" schoolName="Fixture School One" schoolEin="00-0000001"
      invoice={{ number: "FIXTURE-INV-1", status: "PAID", dueDate: "2026-10-30", totalCents: 1000, childName: "Fixture Child", servicePeriodStart: "2026-10-26", servicePeriodEnd: "2026-10-30", items: [{ description: "Loaded tuition", amountCents: 1000 }] }} />
    <PaymentReceiptPrintButton preview buttonLabel="Open fixture receipt" schools={schools}
      payment={{ id: "fixture-payment", amountCents: 1000, status: "PAID", provider: "manual_check", externalIdPlaceholder: null,
        paidAt: "2026-10-30T18:00:00.000Z", invoiceNumber: "FIXTURE-INV-1", paymentReferenceLabel: "Check FIXTURE-1", billingAccount: { family: families[0] } }} />
  </section>
</>);
