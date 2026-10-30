"use client";

import { useMemo, useState } from "react";
import { useBillingAccountOverview } from "@/components/use-billing-account-overview";
import { BillingWorkbench } from "@/components/billing-workbench";
import { PaymentReceiptPrintButton } from "@/components/billing-print-actions";
import { FamilyLedgerCard } from "@/components/family-ledger-card";
import { center, families, schools, entries, accounts, accountOverviewFixtures, tuitionPlans } from "@/lib/billing-director-demo-data";

export function BillingDirectorPreview({ familyId, section, category, centerId }: { familyId?: string; section?: string; category?: string; centerId?: string }) {
  return <div className="space-y-4">
    <div><h1 className="text-2xl font-semibold">Billing &amp; invoices</h1><p className="text-sm text-muted-foreground">{center.name} director workflow · synthetic demo data</p></div>
    <BillingWorkbench families={families} centers={[center, { ...center, id: "demo-empty-school", name: "Empty school · Demo" }]} products={[]} tuitionPlans={tuitionPlans} currentRole="CENTER_DIRECTOR" canOpenFamilyProfile={false} canManageEnrollment={false} initialCenterId={centerId || center.id} initialFamilyId={familyId || (!category && !centerId ? families[0].id : undefined)} initialSection={section} initialCategory={category} ledger={{ entries, accounts, schools }} accountOverviewFixtures={accountOverviewFixtures} />
  </div>;
}

export function BillingDirectorReceiptPreview() {
  return <section><h1 className="mb-4 text-2xl font-semibold">Synthetic director receipt review</h1><PaymentReceiptPrintButton preview schools={schools} payment={{ id: "demo-payment", amountCents: 10000, status: "PAID", provider: "manual_cash", externalIdPlaceholder: "DEMO-RECEIPT-1", paidAt: "2026-10-26T12:00:00Z", invoiceNumber: "DEMO-1042", paymentReferenceLabel: "Demo weekly tuition", billingAccount: { family: families[0] } }} /></section>;
}

export function BillingStandaloneLedgerPreview({ centerId }: { centerId?: string }) {
  return <section><h1 className="mb-4 text-2xl font-semibold">Synthetic standalone ledger review</h1><FamilyLedgerCard entries={entries} accounts={accounts} families={[...families, { id: "demo-other-school-family", name: "Other School Household", centerId: "demo-other-school" }]} schools={schools} initialCenterId={centerId} canOpenFamilyProfile={false} readOnly /></section>;
}

export function BillingOverviewRefreshPreview() {
  const [processing, setProcessing] = useState(false);
  const [readerReady, setReaderReady] = useState(false);
  const account = useMemo(() => ({ balanceCents: 24500, paymentProgress: { phase: "ach_processing", count: processing ? 1 : 0, provisionalAchCreditCents: processing ? 10000 : 0 } }), [processing]);
  // The QA runner supplies an in-memory fetch transport. Keep the fixtures argument
  // absent so the original effect would not be invalidated by a changing fixture map.
  const overview = useBillingAccountOverview({ familyId: "demo-family-0", centerId: center.id, billingAccountId: readerReady ? "demo-account-0" : "", balanceCents: account.balanceCents, paymentStateKey: JSON.stringify(account.paymentProgress), refreshSource: account });
  return <section data-overview-processing={processing ? "true" : "false"}><h1>Account overview refresh fixture</h1><p>Posted balance: $245.00</p><p role="status">{overview.data ? `Pending: ${overview.data.pendingCount}; collectible: ${overview.data.collectibleCents}` : "Checking account"}</p><button type="button" onClick={() => setReaderReady(true)}>Enable mocked overview reader</button><button type="button" onClick={() => setProcessing(true)}>Simulate pending ACH props</button></section>;
}
