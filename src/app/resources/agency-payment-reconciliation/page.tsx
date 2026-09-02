import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CheckCircle2, ClipboardCheck, Landmark, ShieldAlert } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Agency Payment And Reconciliation SOP | The BEE Suite",
  description: "Evidence-first steps for recording and reconciling an approved agency remittance without changing family responsibility.",
  alternates: { canonical: "/resources/agency-payment-reconciliation" },
};

const steps = [
  {
    title: "Confirm the school and program are ready",
    actions: [
      "Sign in through the Director workspace, confirm the exact school, then open Billing & Payments > Billing & invoices > Agency receivables.",
      "Select the school and check Programs ready.",
      "Continue only when the selected program shows Ready and its school-specific provider/vendor identity, submission method, and payment setup are documented.",
    ],
    stop: "Stop if the wrong school is shown, the program says Setup required, or any provider, portal, or payment setup belongs to another location.",
  },
  {
    title: "Match the authorization and approved claim",
    actions: [
      "Match the agency, child, family, authorization number, coverage dates, service period, rate, units, and family copay.",
      "Confirm required documents are complete and the external agency submission reference is recorded.",
      "Continue only when the agency decision is recorded and the claim status is approved or partially paid.",
    ],
    stop: "Do not mark a claim submitted or approved just to fit an old deposit. Historical payments need exact claim, authorization, service-period, and decision evidence.",
  },
  {
    title: "Match the remittance evidence",
    actions: [
      "Use the agency remittance notice, portal transaction, check stub, or ACH advice.",
      "Confirm the exact amount for this claim, paid date, method, and ACH, check, or portal transaction reference.",
      "When one deposit covers several claims, use the agency's exact claim-by-claim allocation and verify the allocations add up to the deposit.",
    ],
    stop: "Do not use a Stripe payout or a bank deposit by itself as remittance proof, and never guess how to split a deposit.",
  },
  {
    title: "Record the remittance once",
    actions: [
      "Select Record remittance on the matched claim.",
      "Enter the exact external reference, remittance amount, agency paid date, and matching payment method.",
      "Review the values together, choose Review complete - save once, and wait for Agency billing record saved and the refreshed queue.",
    ],
    stop: "Do not use a family cash/check payment action for agency money. Never enter passwords, bank account numbers, routing numbers, or provider credentials in notes.",
  },
  {
    title: "Reconcile immediately",
    actions: [
      "Verify the claim paid amount increased exactly once and the status is partially paid or paid as expected.",
      "Verify the remittance history shows the exact date, amount, and external reference once.",
      "Confirm the agency outstanding total decreased, any matching agency receivable received its agency_payment ledger entry, and parent-visible family responsibility stays unchanged.",
      "For a multi-claim deposit, total the recorded claim allocations and compare them with the deposit.",
    ],
    stop: "If no matching agency receivable was available, keep the claim remittance evidence and escalate the unmatched ledger item. Do not post a second manual family payment.",
  },
  {
    title: "Correct through reversal, never deletion",
    actions: [
      "Find the exact remittance, select Reverse, and enter a specific correction reason.",
      "Verify the original is marked reversed, the claim recalculates, and any linked agency receivable is restored with a compensating entry.",
      "Enter the corrected remittance as a new record from the correct evidence.",
    ],
    stop: "Never delete, overwrite, or silently backdate a remittance. Preserve the original, reversal, correction reason, and replacement in the audit history.",
  },
];

const preflight = [
  "Exact school and agency program",
  "Current remittance notice, portal record, check stub, or ACH advice",
  "Provider/vendor number and child authorization",
  "Submitted claim confirmation and agency decision/reference",
  "Approved amount, paid amount, paid date, method, and external reference",
  "Claim-by-claim allocation for a multi-claim deposit",
];

const faqs = [
  ["Does Mark submitted send the claim to the agency?", "No. Submit through the agency's approved external channel first. Mark submitted records the confirmation reference afterward."],
  ["Can I use the school's Stripe payout as the agency payment?", "No. Stripe payout routing is separate and does not prove the agency, authorization, service period, claim, amount, or agency approval."],
  ["Can I post this as a family cash or check payment?", "No. Use Record remittance on the approved agency claim so agency and family responsibility remain separate."],
  ["What if one deposit covers several claims?", "Use the agency remittance detail to enter the exact amount on each claim, then verify the total equals the deposit. Stop if the allocation is missing."],
  ["What if the claim saves but no family-ledger receivable changes?", "The remittance remains valid claim evidence, but accounting must reconcile the missing agency receivable. Do not create a second manual family payment."],
  ["What if I entered the wrong amount or reference?", "Reverse the exact remittance with a correction reason, verify the recalculated claim and compensating ledger entry, then enter the corrected remittance."],
];

export default function AgencyPaymentReconciliationPage() {
  return (
    <main className="min-h-screen bg-[#05070a] text-white">
      <section className="relative overflow-hidden border-b border-white/10 px-4 py-6 sm:px-6 lg:px-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_8%,rgba(245,181,27,0.18),transparent_28rem),linear-gradient(135deg,#05070a_0%,#091018_60%,#161006_100%)]" />
        <div className="relative mx-auto max-w-5xl">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <BrandLogo href="/" size="md" priority />
            <Button variant="outline" className="border-white/15 bg-white/[0.04] text-white hover:bg-white/10" nativeButton={false} render={<Link href="/resources" />}><ArrowLeft data-icon="inline-start" />All guides</Button>
          </header>
          <div className="py-12 sm:py-16">
            <Badge className="bg-amber-300 text-slate-950"><Landmark data-icon="inline-start" />Directors and billing administrators</Badge>
            <h1 className="mt-5 max-w-4xl text-4xl font-semibold leading-tight sm:text-5xl">Agency Payment And Reconciliation SOP</h1>
            <p className="mt-5 max-w-3xl text-base leading-7 text-slate-300">Use this guide together to match an approved agency claim, record the remittance once, and prove the agency receivable reconciled without changing what the family owes.</p>
            <div className="mt-7 flex flex-wrap gap-3"><Button nativeButton={false} render={<Link href="/billing-invoices#agency-subsidy-billing" />}>Open agency workspace<ArrowRight data-icon="inline-end" /></Button><Button variant="outline" className="border-white/15 bg-white/[0.04] text-white hover:bg-white/10" nativeButton={false} render={<Link href="#preflight" />}>Review preflight</Button></div>
            <div className="mt-7 rounded-lg border border-red-300/20 bg-red-400/10 p-4 text-sm leading-6 text-red-100">A bank deposit or Stripe payout is not enough. Do not record anything until the exact school, agency, authorization, service period, approved claim, amount, paid date, and external reference match.</div>
          </div>
        </div>
      </section>

      <section className="px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <nav aria-label="Guide sections" className="grid gap-3 sm:grid-cols-3">
            {[["Before you begin", "#preflight"], ["Step-by-step procedure", "#procedure"], ["Frequently asked questions", "#faqs"]].map(([label, href]) => <Link key={href} href={href} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.055] px-4 py-3 text-sm font-semibold text-slate-200 hover:border-amber-300/60 hover:text-amber-200">{label}<ArrowRight className="size-4" /></Link>)}
          </nav>

          <section id="preflight" className="scroll-mt-6 py-10">
            <h2 className="text-2xl font-semibold">Before you begin</h2>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border border-white/10 bg-white/[0.055] p-5"><h3 className="flex items-center gap-2 font-semibold text-amber-200"><ClipboardCheck className="size-5" />Have these ready</h3><ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-300">{preflight.map(item => <li key={item}>{item}</li>)}</ul></div>
              <div className="rounded-lg border border-red-300/20 bg-red-400/10 p-5"><h3 className="flex items-center gap-2 font-semibold text-red-200"><ShieldAlert className="size-5" />Immediate stop conditions</h3><ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-300"><li>The program says Setup required</li><li>The claim is not approved or partially paid</li><li>The payment exceeds the remaining approved amount</li><li>The agency has not supplied an exact multi-claim allocation</li><li>Any school, child, authorization, period, amount, date, or reference conflicts</li></ul></div>
            </div>
          </section>

          <section id="procedure" className="scroll-mt-6 py-10">
            <h2 className="text-2xl font-semibold">Step-by-step procedure</h2>
            <p className="mt-3 text-sm leading-6 text-slate-300">Complete the steps in order and refresh before repeating any action.</p>
            <ol className="mt-6 grid gap-5">{steps.map((step, index) => <li key={step.title} className="rounded-lg border border-white/10 bg-white/[0.055] p-5 sm:p-6"><div className="flex gap-4"><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-amber-300 font-bold text-slate-950">{index + 1}</span><div><h3 className="text-lg font-semibold">{step.title}</h3><ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-300">{step.actions.map(action => <li key={action}>{action}</li>)}</ul><p className="mt-4 rounded-lg border border-red-300/20 bg-red-400/10 p-3 text-sm leading-6 text-red-100"><strong>Stop condition:</strong> {step.stop}</p></div></div></li>)}</ol>
          </section>

          <section id="faqs" className="scroll-mt-6 py-10"><h2 className="text-2xl font-semibold">Frequently asked questions</h2><div className="mt-6 grid gap-3">{faqs.map(([question, answer]) => <details key={question} className="group rounded-lg border border-white/10 bg-white/[0.055] p-5"><summary className="cursor-pointer list-none font-semibold text-white marker:hidden">{question}</summary><p className="mt-3 text-sm leading-6 text-slate-300">{answer}</p></details>)}</div></section>

          <section className="my-10 rounded-lg border border-emerald-300/25 bg-emerald-400/10 p-6"><h2 className="flex items-center gap-2 text-xl font-semibold text-emerald-100"><CheckCircle2 className="size-5" />Reconciliation is complete only when</h2><p className="mt-3 text-sm leading-6 text-slate-200">The claim, remittance history, agency outstanding amount, matching agency ledger entry when applicable, parent-visible family responsibility, and deposit allocation all agree. Keep unresolved exceptions open for accounting; never force a match with a second family payment.</p></section>
        </div>
      </section>

      <footer className="border-t border-white/10 px-4 py-6 sm:px-6 lg:px-8"><div className="mx-auto flex max-w-5xl flex-col gap-4 text-sm text-slate-400 sm:flex-row sm:items-center sm:justify-between"><BrandLogo href="/" compact /><div className="flex gap-4"><Link className="hover:text-amber-200" href="/resources">All guides</Link><Link className="hover:text-amber-200" href="/support">Support</Link></div></div></footer>
    </main>
  );
}
