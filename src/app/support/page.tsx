import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ChevronDown, Mail, ShieldCheck, TriangleAlert } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { processFaqs } from "@/lib/communications-kit";

export const metadata: Metadata = {
  title: "Support | The BEE Suite",
  description: "Support information for BEE Suite Parent Portal and The BEE Suite role-based apps.",
};

const supportTopics = [
  "Parent portal login and password reset help",
  "Missing child, family, document, photo, message, or invoice records",
  "Parent payment or checkout questions",
  "App install, home screen, or App Store access questions",
  "Security or privacy concerns",
  "Account deletion and data request routing",
];

const urgentTopics = [
  "Pickup changes or custody questions",
  "Immediate child safety, health, or emergency issues",
  "Same-day billing, tuition, or school policy decisions",
  "Incorrect family records that must be fixed before drop-off or pickup",
];

export default function SupportPage() {
  return (
    <main className="min-h-screen bg-[#05070a] text-white">
      <section className="px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <BrandLogo href="/" size="md" priority />
            <div className="flex items-center gap-2">
              <Button variant="outline" className="border-white/15 bg-white/[0.04] text-white hover:bg-white/10" nativeButton={false} render={<Link href="/parents" />}>
                Parent login
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
                Parent Portal Support
              </div>
              <h1 className="mt-5 text-4xl font-semibold leading-tight tracking-normal sm:text-5xl">
                Help for families using The BEE Suite.
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-slate-300">
                Parents and guardians can contact support for app access, login, parent portal, payment, document, and security questions. Your school remains the first contact for urgent child, pickup, billing policy, and record-correction issues.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Button nativeButton={false} render={<a href="mailto:support@thebeesuite.io" />}>
                  <Mail data-icon="inline-start" />
                  support@thebeesuite.io
                </Button>
                <Button variant="outline" className="border-white/15 bg-white/[0.04] text-white hover:bg-white/10" nativeButton={false} render={<Link href="/parents" />}>
                  Open parent app
                  <ArrowRight data-icon="inline-end" />
                </Button>
                <Button variant="outline" className="border-white/15 bg-white/[0.04] text-white hover:bg-white/10" nativeButton={false} render={<Link href="/resources" />}>
                  SOPs and guides
                </Button>
              </div>
            </div>

            <div className="grid gap-4">
              <Card className="border-white/10 bg-white/[0.06] text-white shadow-2xl shadow-black/25">
                <CardHeader>
                  <CardTitle>Contact Support</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm leading-6 text-slate-300">
                  <p>Email: <a className="font-semibold text-amber-200 underline-offset-4 hover:underline" href="mailto:support@thebeesuite.io">support@thebeesuite.io</a></p>
                  <p>Include your name, school, child name if relevant, the email you use to log in, the page you were on, and a screenshot when it is safe to share one.</p>
                  <p>Parents can start account deletion from Parent Portal &gt; Profile Settings &gt; Privacy and Account Deletion. Some childcare, safety, licensing, billing, payment, or audit records may need school review or retention.</p>
                  <p>Do not send full card numbers, bank login details, medical documents, custody documents, or other highly sensitive files through ordinary email unless support specifically gives you a secure upload path.</p>
                </CardContent>
              </Card>

              <Card className="border-white/10 bg-white/[0.06] text-white shadow-2xl shadow-black/25">
                <CardHeader>
                  <CardTitle>Support Can Help With</CardTitle>
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
                  <CardTitle className="flex items-center gap-2">
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

          <section className="pb-14" id="faq">
            <div className="mb-6 max-w-3xl">
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-amber-300">Process FAQ</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight">Specific answers for families and school teams</h2>
              <p className="mt-3 leading-7 text-slate-300">These steps cover the most common enrollment, attendance, classroom, billing, document, FTE, security, and support procedures.</p>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              {processFaqs.map((faq) => (
                <details key={faq.question} className="group rounded-2xl border border-white/10 bg-white/[0.06] p-5 open:border-amber-300/30 open:bg-amber-300/[0.08]">
                  <summary className="flex cursor-pointer list-none items-start justify-between gap-4 font-semibold text-white">
                    <span><span className="mb-2 block text-xs font-bold uppercase tracking-[0.14em] text-amber-300">{faq.audience}</span>{faq.question}</span>
                    <ChevronDown className="mt-1 size-5 shrink-0 text-amber-300 transition-transform group-open:rotate-180" />
                  </summary>
                  <p className="mt-4 border-t border-white/10 pt-4 text-sm leading-6 text-slate-300">{faq.answer}</p>
                </details>
              ))}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
