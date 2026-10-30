import { BillingWorkbench } from "@/components/billing-workbench";
import { PaymentReceiptPrintButton } from "@/components/billing-print-actions";
import { center, families, schools, entries, accounts, accountOverviewFixtures } from "@/lib/billing-director-demo-data";

export function BillingDirectorPreview({ familyId, section, category, centerId }: { familyId?: string; section?: string; category?: string; centerId?: string }) {
  return <div className="space-y-4">
    <div><h1 className="text-2xl font-semibold">Billing &amp; invoices</h1><p className="text-sm text-muted-foreground">{center.name} director workflow · synthetic demo data</p></div>
    <BillingWorkbench families={families} centers={[center, { ...center, id: "demo-empty-school", name: "Empty school · Demo" }]} products={[]} tuitionPlans={[]} currentRole="CENTER_DIRECTOR" canOpenFamilyProfile={false} canManageEnrollment={false} initialCenterId={centerId || center.id} initialFamilyId={familyId || (!category && !centerId ? families[0].id : undefined)} initialSection={section} initialCategory={category} ledger={{ entries, accounts, schools }} accountOverviewFixtures={accountOverviewFixtures} />
  </div>;
}

export function BillingDirectorReceiptPreview() {
  return <section><h1 className="mb-4 text-2xl font-semibold">Synthetic director receipt review</h1><PaymentReceiptPrintButton preview schools={schools} payment={{ id: "demo-payment", amountCents: 10000, status: "PAID", provider: "manual_cash", externalIdPlaceholder: "DEMO-RECEIPT-1", paidAt: "2026-10-26T12:00:00Z", invoiceNumber: "DEMO-1042", paymentReferenceLabel: "Demo weekly tuition", billingAccount: { family: families[0] } }} /></section>;
}
