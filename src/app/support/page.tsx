import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ChevronDown, Mail, ShieldCheck, TriangleAlert } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { processFaqs } from "@/lib/communications-kit";

export const metadata: Metadata = {
  title: "Support | The BEE Suite",
  description: "Support for BEE Suite access, school operations, classroom workflows, family tools, billing, privacy, and account questions.",
};

const supportTopics = [
  "Role-specific sign-in and password reset help",
  "School, classroom, family, document, message, billing, or reporting issues",
  "Navigation, device installation, and accessibility questions",
  "Unexpected permissions or missing assigned locations",
  "Security or privacy concerns",
  "Account deletion and data request routing",
];

const urgentTopics = [
  "Pickup changes or custody questions",
  "Immediate child safety, health, or emergency issues",
  "Same-day billing, tuition, or school policy decisions",
  "Incorrect family records that must be fixed before drop-off or pickup",
];

const supportFaqGroups = [
  {
    id: "family-faqs",
    eyebrow: "Family FAQs",
    title: "Answers for parents, guardians, and pickup users",
    description: "Sign-in, family records, check-in, updates, documents, billing, and urgent school contact.",
    faqs: processFaqs.filter(({ audience }) => audience === "Parents" || audience === "Everyone"),
  },
  {
    id: "team-faqs",
    eyebrow: "Team FAQs",
    title: "Answers for school, classroom, billing, and company teams",
    description: "Launch readiness, daily operations, classroom practice, billing close, reporting, security, and support escalation.",
    faqs: processFaqs.filter(({ audience }) => audience === "Schools" || audience === "Everyone"),
  },
] as const;

export default function SupportPage() {
  return (
    <main className="min-h-screen bg-[#05070a] text-white">
      <section className="px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <BrandLogo href="/" size="md" priority />
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap">
              <Button variant="outline" className="border-white/15 bg-white/[0.04] text-white hover:bg-white/10" nativeButton={false} render={<Link href="/login" />}>
                Sign in
              </Button>
              <Button variant="outline" className="border-white/15 bg-white/[0.04] text-white hover:bg-white/10" nativeButton={false} render={<Link href="/terms" />}>
                Terms
              </Button>
              <Button variant="outline" className="border-white/15 bg-white/[0.04] text-white hover:bg-white/10" nativeButton={false} render={<Link href="/eula" />}>
                EULA
              </Button>
              <Button variant="outline" className="border-white/15 bg-white/[0.04] text-white hover:bg-white/10" nativeButton={false} render={<Link href="/resources" />}>
                Guides
              </Button>
              <Button nativeButton={false} render={<Link href="/privacy" />}>
                Privacy
              </Button>
            </div>
          </header>

          <div className="grid gap-8 py-12 lg:grid-cols-[0.8fr_1fr] lg:items-start">
            <div>
              <div className="inline-flex items-center gap-2 rounded-lg border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-sm font-semibold text-amber-100">
                <ShieldCheck className="size-4" />
                BEE Suite Support
              </div>
              <h1 className="mt-5 text-4xl font-semibold leading-tight tracking-normal sm:text-5xl">
                Clear help for every BEE Suite role.
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-slate-300">
                Platform, company, regional, school, classroom, billing, family, pickup, and audit users can contact support for access or technical issues. Your school remains the first contact for urgent child, pickup, billing policy, and record-correction decisions.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Button nativeButton={false} render={<a href="mailto:support@thebeesuite.io" />}>
                  <Mail data-icon="inline-start" />
                  support@thebeesuite.io
                </Button>
                <Button variant="outline" className="border-white/15 bg-white/[0.04] text-white hover:bg-white/10" nativeButton={false} render={<Link href="/login" />}>
                  Choose Your Sign-in Page
                  <ArrowRight data-icon="inline-end" />
                </Button>
                <Button variant="outline" className="border-white/15 bg-white/[0.04] text-white hover:bg-white/10" nativeButton={false} render={<Link href="/resources" />}>
                  Open Guides
                </Button>
              </div>
            </div>

            <div className="grid gap-4">
              <Card className="border-white/10 bg-white/[0.06] text-white shadow-2xl shadow-black/25">
                <CardHeader>
                  <CardTitle as="h2">Contact Support</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm leading-6 text-slate-300">
                  <p>Email: <a className="font-semibold text-amber-200 underline-offset-4 hover:underline" href="mailto:support@thebeesuite.io">support@thebeesuite.io</a></p>
                  <p>Include your name, school, the email you use to log in, the page you were on, and a screenshot when it is safe to share one. Describe the affected family record without including sensitive details.</p>
                  <p>Include your role, school or company, login email, page, time, steps taken, and a safe screenshot. Families can start account deletion from Parent Portal → Family → Profile &amp; Security → Privacy and Account Deletion.</p>
                  <p>Do not send full card numbers, bank login details, medical documents, custody documents, or other highly sensitive files through ordinary email unless support specifically gives you a secure upload path.</p>
                </CardContent>
              </Card>

              <Card className="border-white/10 bg-white/[0.06] text-white shadow-2xl shadow-black/25">
                <CardHeader>
                  <CardTitle as="h2">Support Can Help With</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="grid gap-2 text-sm leading-6 text-slate-300">
                    {supportTopics.map((topic) => (
                      <li key={topic} className="flex gap-2">
                        <span className="mt-2 size-1.5 rounded-full bg-amber-300" />
                        <span>{topic}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              <Card className="border-amber-300/25 bg-amber-300/10 text-amber-50 shadow-2xl shadow-black/25">
                <CardHeader>
                  <CardTitle as="h2" className="flex items-center gap-2">
                    <TriangleAlert className="size-5" />
                    Contact Your School Directly For Urgent Items
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="grid gap-2 text-sm leading-6">
                    {urgentTopics.map((topic) => (
                      <li key={topic} className="flex gap-2">
                        <span className="mt-2 size-1.5 rounded-full bg-amber-100" />
                        <span>{topic}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </div>
          </div>

          <div className="grid gap-12 pb-14" id="faq">
            {supportFaqGroups.map((group) => (
              <section key={group.id} id={group.id} aria-labelledby={`${group.id}-title`}>
                <div className="mb-6 max-w-3xl">
                  <p className="text-sm font-bold uppercase tracking-[0.18em] text-amber-300">{group.eyebrow}</p>
                  <h2 id={`${group.id}-title`} className="mt-2 text-3xl font-semibold tracking-tight">{group.title}</h2>
                  <p className="mt-3 leading-7 text-slate-300">{group.description}</p>
                </div>
                <div className="grid gap-3 lg:grid-cols-2">
                  {group.faqs.map((faq) => (
                    <details key={`${group.id}-${faq.question}`} className="group rounded-2xl border border-white/10 bg-white/[0.06] p-5 open:border-amber-300/30 open:bg-amber-300/[0.08]">
                      <summary className="flex min-h-11 cursor-pointer list-none items-start justify-between gap-4 font-semibold text-white">
                        <span><span className="mb-2 block text-xs font-bold uppercase tracking-[0.14em] text-amber-300">{faq.audience}</span>{faq.question}</span>
                        <ChevronDown className="mt-1 size-5 shrink-0 text-amber-300 transition-transform group-open:rotate-180" aria-hidden="true" />
                      </summary>
                      <p className="mt-4 border-t border-white/10 pt-4 text-sm leading-6 text-slate-300">{faq.answer}</p>
                    </details>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
