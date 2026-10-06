import type { Metadata } from "next";
import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { FAMILY_BILLING_REPORT_CHECKLIST } from "@/lib/family-billing-intake";

export const metadata: Metadata = {
  title: "Family & Billing Transfer Guide | The BEE Suite",
  description: "A simple school checklist for bringing existing families, tuition, balances, and credits into The BEE Suite.",
  alternates: { canonical: "/resources/family-billing-transfer" },
};

const steps = [
  { title: "Confirm your school and source date", text: "Open School Setup in your existing director workspace. Confirm the school name and choose Move Existing Records. Agree on a balance date and identify who will review the roster and billing information. If records are already in BEE Suite, start with Continue an existing migration rather than uploading them again." },
  { title: "Provide unchanged reports", text: "Export the report groups below for this school only. Include the source account, child, and person IDs. In ProCare, the structured enrollment, ParentInfo, Relationships, and ChildInfo exports cover the core roster; provide account balances and child tuition contracts as well. Report menus vary by version: ask BEE setup help for the correct reports if yours differ. You do not need to combine spreadsheets or rename columns." },
  { title: "Review the information and remaining questions", text: "BEE Suite detects the report fields and prepares a preview. Check current families, children, guardians, payer responsibility, and any missing or conflicting information. Use the Exceptions step for unresolved rows. If a mapping or source relationship is unclear, request BEE setup help instead of guessing." },
  { title: "Confirm balances and actual tuition", text: "Check one opening balance per family at the agreed date, including zero and credits. Siblings must not duplicate the family balance. Confirm each child's amount, weekly, biweekly, four-week, or monthly frequency, plan, and effective date. Unlisted frequencies need BEE review. Keep discounts, fees, agency responsibility, old invoices, and prior payments available to explain any difference." },
  { title: "Save and verify the reviewed transfer", text: "Commit only the reviewed package for this school. If interrupted, keep the same files selected and retry; saved rows are retained. After saving, run the whole-school check from School Setup, reconcile totals, resolve remaining exceptions, and confirm the reviewed data. A successful upload alone is not verified completion." },
] as const;

export default function FamilyBillingTransferGuide() {
  return <main className="mx-auto max-w-4xl space-y-8 px-4 py-10 sm:px-6">
    <BrandLogo className="h-12 w-auto" />
    <div className="space-y-3">
      <Link href="/resources" className="text-sm underline underline-offset-4">All help guides</Link>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Bring your families and billing into BEE Suite</h1>
      <p className="text-muted-foreground">Provide your school&apos;s existing reports, review the result, and answer the remaining questions. BEE handles technical preparation; the school confirms the facts.</p>
    </div>
    <div className="rounded-xl border bg-muted/30 p-5">
      <h2 className="font-semibold">Before you begin</h2>
      <p className="mt-2 text-sm leading-6">Keep your original reports unchanged. Use the secure school import workflow for family information. Never send passwords, full payment-card numbers, or bank details in a report or ordinary email. Payment methods and payout setup use their own secure provider flow.</p>
    </div>
    <section className="space-y-4" aria-labelledby="transfer-reports">
      <h2 id="transfer-reports" className="text-xl font-semibold">Reports to have ready</h2>
      <div className="grid gap-3 sm:grid-cols-2">{FAMILY_BILLING_REPORT_CHECKLIST.map(item => <div key={item.title} className="rounded-xl border p-4">
        <h3 className="font-medium">{item.title}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{item.detail}</p>
      </div>)}</div>
      <p className="text-sm text-muted-foreground">Upload a folder, individual supported reports, or a ZIP. Packages support up to 50 MB total, 20 MB per file, and 500 files; ZIP expansion is limited to 100 MB. If your complete package exceeds these limits, request BEE setup help. Do not remove required reports to make it fit.</p>
      <p className="text-sm text-muted-foreground">Original reports are kept as linked private backups. Temporary uploads are cleared after the transfer, and expired uploads and prepared data are cleaned up automatically.</p>
    </section>
    <ol className="space-y-4">{steps.map((step, index) => <li key={step.title} className="rounded-xl border p-5">
      <h2 className="font-semibold">{index + 1}. {step.title}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{step.text}</p>
    </li>)}</ol>
    <section className="space-y-3 rounded-xl border p-5">
      <h2 className="text-lg font-semibold">Before billing begins</h2>
      <p className="text-sm leading-6">Confirm the last service period billed in the previous system and the first in BEE Suite. Review how old invoices, payments, balances, and credits carry forward so the same obligation is not counted twice. Billing data review does not enable tuition assignments, autopay, charges, invitations, or parent access.</p>
      <p className="text-sm leading-6">Your transfer is ready for final review when every expected current family and child is accounted for, required relationships and safety information are checked, tuition evidence matches its actual frequency, balances reconcile, and every remaining exception has an evidenced decision.</p>
      <Button nativeButton={false} render={<Link href="/directors" />}>Open Director Workspace</Button>
    </section>
  </main>;
}
