import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CheckCircle2, ClipboardCheck, ShieldAlert } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Director School Data Clean-Start Guide | The BEE Suite",
  description:
    "A director-friendly checklist and FAQ for verifying school, family, child, safety, tuition, and balance data before launch.",
  alternates: { canonical: "/resources/director-data-clean-start" },
};

const steps = [
  {
    title: "Confirm you are reviewing the right school",
    actions: [
      "Sign in through the Director workspace and confirm the school name shown on the page.",
      "Open the review packet for your school and confirm it says READY_FOR_DIRECTOR_REVIEW.",
      "Confirm the school name and export date match the records you intend to review.",
    ],
    stop: "Stop if you see another school's records, the packet is not ready, or the school or export date does not match.",
  },
  {
    title: "Review the current roster",
    actions: [
      "Compare current children and families with the school's current roster.",
      "Confirm each child has the correct enrollment status and classroom.",
      "List missing children, duplicate records, and former or withdrawn children that appear current.",
    ],
    stop: "Do not delete, merge, or guess. Record the issue for correction.",
  },
  {
    title: "Check family and child relationships",
    actions: [
      "Confirm each child is connected to the correct family and guardians.",
      "Check guardian names, relationships, email addresses, phone numbers, and linked children.",
      "Review emergency contacts and authorized pickup people separately from guardians.",
    ],
    stop: "Stop if a relationship is unclear or one email appears to belong to conflicting adults or families.",
  },
  {
    title: "Review safety-critical information",
    actions: [
      "Check allergies and severity, medical conditions, medications, emergency contacts, authorized pickups, and custody restrictions.",
      "Compare every safety item with the school's source record.",
      "Treat a blank field as not yet confirmed—not as proof that none exists.",
    ],
    stop: "Escalate any missing, conflicting, or unclear safety information before attendance or pickup is activated.",
  },
  {
    title: "Check classrooms and schedules",
    actions: [
      "Confirm each current child has the correct classroom or age group.",
      "Confirm scheduled days and any full-time or part-time designation shown in the source.",
      "Record schedule details that cannot be proven from the export instead of filling them in from memory.",
    ],
    stop: "Do not assume five days or a classroom when the source is incomplete or ambiguous.",
  },
  {
    title: "Check tuition and opening balances",
    actions: [
      "Confirm each child's tuition amount, billing schedule, description, and effective date.",
      "Confirm each family's opening balance has an as-of date and supporting source.",
      "Keep parent responsibility separate from agency or subsidy responsibility.",
      "Compare current-only totals with current-only totals and all-record totals with all-record totals.",
    ],
    stop: "Do not approve billing when an amount, date, payer, schedule, or total cannot be reconciled.",
  },
  {
    title: "Spot-check and document corrections",
    actions: [
      "Review at least 10 current families from start to finish, or every current family when the school has fewer than 10.",
      "For each issue, record the child or family, what is wrong, the source evidence, who owns the correction, and the result after rechecking.",
      "Use VERIFIED, NEEDS CORRECTION, MISSING SOURCE, or NOT APPLICABLE for each review item.",
    ],
    stop: "A correction is not complete until it has been checked again against the source.",
  },
  {
    title: "Complete the readiness decision",
    actions: [
      "Confirm roster, relationships, safety, classrooms, schedules, tuition, balances, and exceptions have each been reviewed.",
      "Sign and date the director review only when the school-data review is complete.",
      "Keep invitations, user access, kiosk/PIN, attendance, billing, payments, messaging, and ProCare cutover as separate approvals.",
    ],
    stop: "School-data approval does not turn on any other launch gate.",
  },
];

const faqs = [
  ["Am I expected to fix the export files?", "No. Directors verify what is right or wrong and provide the source evidence. Do not edit import files or guess which record should win."],
  ["What does READY_FOR_DIRECTOR_REVIEW mean?", "It means the technical review packet is ready for your school-level verification. It does not mean the data is approved or that the school is cleared to launch."],
  ["What if a field is blank?", "Mark it MISSING SOURCE or NEEDS CORRECTION as appropriate. A blank field is not proof that the school has no allergy, pickup restriction, balance, schedule, or other item."],
  ["What if the BEE Suite and ProCare do not match?", "Record the exact difference and identify the dated source that should be used. Keep the item unresolved until it is corrected and checked again."],
  ["Should I create a duplicate when a family or guardian looks wrong?", "No. Stop and report the existing record. Duplicates can split children, balances, invitations, and payment history."],
  ["How many families should I spot-check?", "At least 10 current families, chosen across classrooms and billing situations. If the school has fewer than 10 current families, review all of them."],
  ["Do I include agency or subsidy money in the parent's balance?", "No. Parent responsibility and agency or subsidy responsibility must stay separate."],
  ["Does accurate data mean we can send parent invitations?", "No. Parent invitations and access require their own approval after identity and relationship checks are complete."],
  ["Does this approve billing or payments?", "No. Billing setup, opening balances, payment collection, Stripe readiness, and the billing cutover each remain separate gates."],
  ["When can ProCare be retired?", "Only after written cutover approval and all required operational gates are complete. A clean data review by itself is not permission to retire the previous system."],
];

export default function DirectorDataCleanStartPage() {
  return (
    <main className="min-h-screen bg-[#05070a] text-white">
      <section className="relative overflow-hidden border-b border-white/10 px-4 py-6 sm:px-6 lg:px-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_8%,rgba(245,181,27,0.18),transparent_28rem),linear-gradient(135deg,#05070a_0%,#091018_60%,#161006_100%)]" />
        <div className="relative mx-auto max-w-5xl">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <BrandLogo href="/" size="md" priority />
            <Button variant="outline" className="border-white/15 bg-white/[0.04] text-white hover:bg-white/10" nativeButton={false} render={<Link href="/resources" />}>
              <ArrowLeft data-icon="inline-start" />
              All guides
            </Button>
          </header>
          <div className="py-12 sm:py-16">
            <Badge className="bg-amber-300 text-slate-950"><ClipboardCheck data-icon="inline-start" />Directors and assistant directors</Badge>
            <h1 className="mt-5 max-w-4xl text-4xl font-semibold leading-tight sm:text-5xl">School Data Clean-Start Guide</h1>
            <p className="mt-5 max-w-3xl text-base leading-7 text-slate-300">Use this checklist to verify your school data before launch. You are responsible for identifying what is correct, missing, or needs correction—not repairing import files or guessing.</p>
            <div className="mt-7 rounded-lg border border-amber-300/30 bg-amber-300/10 p-4 text-sm leading-6 text-amber-100">
              Keep ProCare or the school&apos;s previous system as the source of record until written cutover approval is complete.
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <nav aria-label="Guide sections" className="grid gap-3 sm:grid-cols-3">
            {[['Before you begin', '#before-you-begin'], ['Step-by-step checklist', '#checklist'], ['Frequently asked questions', '#faqs']].map(([label, href]) => (
              <Link key={href} href={href} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.055] px-4 py-3 text-sm font-semibold text-slate-200 hover:border-amber-300/60 hover:text-amber-200">{label}<ArrowRight className="size-4" /></Link>
            ))}
          </nav>

          <section id="before-you-begin" className="scroll-mt-6 py-10">
            <h2 className="text-2xl font-semibold">Before you begin</h2>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border border-white/10 bg-white/[0.055] p-5"><h3 className="font-semibold text-amber-200">Have these ready</h3><ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-300"><li>Your current BEE Suite director access</li><li>The current school roster and source exports</li><li>The school review packet marked READY_FOR_DIRECTOR_REVIEW</li><li>A place to record corrections, owners, and recheck results</li></ul></div>
              <div className="rounded-lg border border-red-300/20 bg-red-400/10 p-5"><h3 className="flex items-center gap-2 font-semibold text-red-200"><ShieldAlert className="size-5" />Stop and escalate</h3><ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-300"><li>Another school&apos;s information is visible</li><li>A child, guardian, or relationship is ambiguous</li><li>Safety, custody, tuition, or balance evidence conflicts</li><li>The source or as-of date is missing</li></ul></div>
            </div>
            <figure className="mt-6 overflow-hidden rounded-lg border border-white/10 bg-[#f7f4ed]"><Image src="/brand/the-bee-suite/explainers/current/school-launch-gates.png" alt="Independent school data, access, attendance, billing, payment, and cutover gates" width={1600} height={1000} className="h-auto w-full" priority /></figure>
          </section>

          <section id="checklist" className="scroll-mt-6 py-10">
            <h2 className="text-2xl font-semibold">Step-by-step checklist</h2>
            <p className="mt-3 text-sm leading-6 text-slate-300">Complete the steps in order. Keep anything unsupported or unclear open for correction.</p>
            <ol className="mt-6 grid gap-5">
              {steps.map((step, index) => <li key={step.title} className="rounded-lg border border-white/10 bg-white/[0.055] p-5 sm:p-6"><div className="flex gap-4"><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-amber-300 font-bold text-slate-950">{index + 1}</span><div><h3 className="text-lg font-semibold">{step.title}</h3><ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-300">{step.actions.map(action => <li key={action}>{action}</li>)}</ul><p className="mt-4 rounded-lg border border-red-300/20 bg-red-400/10 p-3 text-sm leading-6 text-red-100"><strong>Stop condition:</strong> {step.stop}</p></div></div></li>)}
            </ol>
          </section>

          <section id="faqs" className="scroll-mt-6 py-10">
            <h2 className="text-2xl font-semibold">Frequently asked questions</h2>
            <div className="mt-6 grid gap-3">{faqs.map(([question, answer]) => <details key={question} className="group rounded-lg border border-white/10 bg-white/[0.055] p-5"><summary className="cursor-pointer list-none font-semibold text-white marker:hidden">{question}</summary><p className="mt-3 text-sm leading-6 text-slate-300">{answer}</p></details>)}</div>
          </section>

          <section className="my-10 rounded-lg border border-emerald-300/25 bg-emerald-400/10 p-6">
            <h2 className="flex items-center gap-2 text-xl font-semibold text-emerald-100"><CheckCircle2 className="size-5" />Final director sign-off</h2>
            <p className="mt-3 text-sm leading-6 text-slate-200">Sign off only when every school-data item is verified or has a documented resolution. This sign-off does not activate invitations, access, kiosk/PIN, attendance, billing, payments, messaging, or ProCare cutover.</p>
          </section>
        </div>
      </section>

      <footer className="border-t border-white/10 px-4 py-6 sm:px-6 lg:px-8"><div className="mx-auto flex max-w-5xl flex-col gap-4 text-sm text-slate-400 sm:flex-row sm:items-center sm:justify-between"><BrandLogo href="/" compact /><div className="flex gap-4"><Link className="hover:text-amber-200" href="/resources">All guides</Link><Link className="hover:text-amber-200" href="/support">Support</Link></div></div></footer>
    </main>
  );
}
