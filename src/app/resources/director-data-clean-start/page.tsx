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
    "A director-friendly checklist for verifying imported or clean-start school, family, child, safety, tuition, and balance data before launch.",
  alternates: { canonical: "/resources/director-data-clean-start" },
};

const steps = [
  {
    title: "Confirm you are reviewing the right school",
    actions: [
      "Sign in through the Director workspace and confirm the school name shown on the page.",
      "Open School setup and confirm the saved starting point says Move Existing Records or Start With a Clean Workspace.",
      "For an import, confirm the school packet says READY_FOR_DIRECTOR_REVIEW and matches the source date. For a clean start, confirm no prior roster is expected and use only real enrollment records.",
    ],
    stop: "Stop if you see another school's records, the saved path is wrong, or an import packet is not ready or does not match.",
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
      "Record schedule details that cannot be proven from the source or enrollment record instead of filling them in from memory.",
    ],
    stop: "Do not assume five days or a classroom when the source is incomplete or ambiguous.",
  },
  {
    title: "Check tuition and opening balances",
    actions: [
      "Confirm each child's tuition amount, billing schedule, description, and effective date.",
      "For an import, confirm each opening balance has an as-of date and supporting source. For a clean start, confirm there is no opening balance unless a real dated charge or credit supports it.",
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
  ["What if this is a brand-new school with nothing to import?", "Choose Start With a Clean Workspace in School setup. Add only real enrollment records, or explicitly confirm that no current families are expected yet. Do not create placeholder people or an empty import."],
  ["Am I expected to fix the export files?", "No. Directors verify what is right or wrong and provide the source evidence. Do not edit import files or guess which record should win."],
  ["What does READY_FOR_DIRECTOR_REVIEW mean?", "It means the technical review packet is ready for your school-level verification. It does not mean the data is approved or that the school is cleared to launch."],
  ["What if a field is blank?", "Mark it MISSING SOURCE or NEEDS CORRECTION as appropriate. A blank field is not proof that the school has no allergy, pickup restriction, balance, schedule, or other item."],
  ["What if the BEE Suite and the previous system do not match?", "Record the exact difference and identify the dated source that should be used. Keep the item unresolved until it is corrected and checked again."],
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
            <p className="mt-5 max-w-3xl text-base leading-7 text-slate-300">Use this checklist for either a reviewed import or a clean workspace. You confirm what is correct, missing, or needs correction; you are not expected to repair source files, create placeholder records, or guess.</p>
            <div className="mt-7 rounded-lg border border-amber-300/30 bg-amber-300/10 p-4 text-sm leading-6 text-amber-100">
              Imported school: keep the previous system as the source of record until written cutover approval. Clean-start school: enter only real school and enrollment facts and confirm an intentionally empty roster when applicable.
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <nav aria-label="Guide sections" className="grid gap-3 sm:grid-cols-3">
            {[['Start entering families', '#family-entry'], ['Before you begin', '#before-you-begin'], ['Step-by-step checklist', '#checklist'], ['Frequently asked questions', '#faqs']].map(([label, href]) => (
              <Link key={href} href={href} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.055] px-4 py-3 text-sm font-semibold text-slate-200 hover:border-amber-300/60 hover:text-amber-200">{label}<ArrowRight className="size-4" /></Link>
            ))}
          </nav>

          <section id="family-entry" className="scroll-mt-6 py-10">
            <h2 className="text-2xl font-semibold">Start entering families</h2>
            <p className="mt-3 text-sm leading-6 text-slate-300">Every school should have a director responsible for its roster. If records already exist, complete and verify them. If an import is planned or underway, coordinate missing records with the import owner before entering the same families again.</p>
            <ol className="mt-5 list-decimal space-y-4 pl-6 text-sm leading-6 text-slate-300">
              <li><strong className="text-white">Confirm your school and starting point.</strong> Open School setup. Keep the existing import path when moving records from another system. Use the clean workspace path when entering records directly; this does not erase existing records. Set up classrooms before adding enrolled children.</li>
              <li><strong className="text-white">Gather the current enrollment records.</strong> Have each child&apos;s legal name, birth date, enrollment status, start date, classroom, scheduled days and times, guardian names and contact details, emergency contacts, authorized pickups, safety information, and signed permissions available. Record missing information for follow-up; do not guess.</li>
              <li><strong className="text-white">Search before adding.</strong> In the Family Workspace, check the Family Directory and past enrollment records. Open an existing family to add siblings or additional guardians. Do not recreate imported families.</li>
              <li><strong className="text-white">Add the first household.</strong> Open Add Family, Parent + Child. Confirm School / center, enter the primary guardian and child, choose the correct classroom and enrollment status, and select Save Family, Parent + Child. Leave prior balance blank unless a separately approved, verified opening balance must be recorded. Verify permission checkboxes against signed records.</li>
              <li><strong className="text-white">Finish the household.</strong> After the Saved message, open Complete this family&apos;s details. Add the remaining guardians and children, emergency contacts, authorized pickups, allergies, medical information, schedules, and required documents. A saved intake is the beginning of the record, not a completed school review.</li>
              <li><strong className="text-white">Continue through the roster.</strong> Use Start next family to clear the previous household before entering another. If a save cannot be confirmed, check the directory for the child before trying again. Work classroom by classroom and compare both family and child totals with the current roster.</li>
              <li><strong className="text-white">Report progress and resolve gaps.</strong> Record the expected and entered family/child counts, unresolved items, responsible person, and next follow-up date. Return to School setup to review gaps and confirm the school&apos;s data only when the review is complete.</li>
            </ol>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/school-setup" className="rounded-lg border border-white/20 px-4 py-3 text-sm font-semibold hover:text-amber-200">Open School setup</Link>
              <Link href="/family-detail#family-directory" className="rounded-lg border border-white/20 px-4 py-3 text-sm font-semibold hover:text-amber-200">Review existing families</Link>
              <Link href="/family-detail#family-intake" className="rounded-lg bg-amber-300 px-4 py-3 text-sm font-semibold text-slate-950">Open family entry</Link>
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-300">These workspace links require your existing authorized login. Record counts show progress; they do not prove completeness without comparison to the school&apos;s roster. Keep child and family details in the secure workspace, not in general setup notes or progress messages.</p>
          </section>

          <section id="before-you-begin" className="scroll-mt-6 py-10">
            <h2 className="text-2xl font-semibold">Before you begin</h2>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border border-white/10 bg-white/[0.055] p-5"><h3 className="font-semibold text-amber-200">Have these ready</h3><ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-300"><li>Your current BEE Suite director access</li><li>The saved data starting point for the correct school</li><li>For an import: the current source package and packet marked READY_FOR_DIRECTOR_REVIEW</li><li>For a clean start: the actual enrollment roster, or confirmation that no current families are expected</li><li>A place to record corrections, owners, and recheck results</li></ul></div>
              <div className="rounded-lg border border-red-300/20 bg-red-400/10 p-5"><h3 className="flex items-center gap-2 font-semibold text-red-200"><ShieldAlert className="size-5" />Stop and escalate</h3><ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-slate-300"><li>Another school&apos;s information is visible</li><li>A child, guardian, or relationship is ambiguous</li><li>Safety, custody, tuition, or balance evidence conflicts</li><li>An imported record&apos;s source or as-of date is missing</li></ul></div>
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
            <p className="mt-3 text-sm leading-6 text-slate-200">Sign off only when every school-data item is verified or has a documented resolution—or when a new school has explicitly confirmed that no current families are expected yet. This sign-off does not activate invitations, access, kiosk/PIN, attendance, billing, payments, messaging, or ProCare cutover. A cutover from any other prior system is equally separate.</p>
          </section>
        </div>
      </section>

      <footer className="border-t border-white/10 px-4 py-6 sm:px-6 lg:px-8"><div className="mx-auto flex max-w-5xl flex-col gap-4 text-sm text-slate-400 sm:flex-row sm:items-center sm:justify-between"><BrandLogo href="/" compact /><div className="flex gap-4"><Link className="hover:text-amber-200" href="/resources">All guides</Link><Link className="hover:text-amber-200" href="/support">Support</Link></div></div></footer>
    </main>
  );
}
