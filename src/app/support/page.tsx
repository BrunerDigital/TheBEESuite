import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Mail, ShieldCheck, TriangleAlert } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
        </div>
      </section>
    </main>
  );
}
