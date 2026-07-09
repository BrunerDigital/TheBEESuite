import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, CreditCard, FileText, LifeBuoy, LockKeyhole, ShieldCheck } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Terms of Service | The BEE Suite",
  description: "Terms of Service for The BEE Suite and BEE Suite Parent Portal.",
};

const userResponsibilities = [
  "Use only the account, school, family, child, staff, billing, and operational records you are authorized to access.",
  "Keep login credentials private and report suspected unauthorized access promptly.",
  "Contact the school directly for urgent child safety, pickup, custody, medical, emergency, or same-day billing policy issues.",
  "Do not upload unlawful, harmful, malicious, infringing, or unauthorized content.",
  "Do not attempt to bypass authentication, permissions, tenant scoping, rate limits, logging, or security controls.",
];

const schoolResponsibilities = [
  "Configure authorized users, roles, centers, classrooms, families, and feature access accurately.",
  "Maintain accurate child, family, staff, medical, custody, pickup, attendance, billing, and school records.",
  "Obtain required parent, guardian, employee, regulatory, FERPA, COPPA, payment, and privacy authorizations.",
  "Review and approve communications, records, billing actions, documents, incident records, and AI-assisted drafts.",
  "Maintain emergency procedures outside The BEE Suite.",
];

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#05070a] text-white">
      <section className="px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <BrandLogo href="/" size="md" priority />
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" className="border-white/15 bg-white/[0.04] text-white hover:bg-white/10" nativeButton={false} render={<Link href="/privacy" />}>
                Privacy
              </Button>
              <Button variant="outline" className="border-white/15 bg-white/[0.04] text-white hover:bg-white/10" nativeButton={false} render={<Link href="/eula" />}>
                EULA
              </Button>
              <Button nativeButton={false} render={<Link href="/support" />}>
                Support
              </Button>
            </div>
          </header>

          <div className="py-12">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-lg border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-sm font-semibold text-amber-100">
                <FileText className="size-4" />
                Terms of Service
              </div>
              <h1 className="mt-5 text-4xl font-semibold leading-tight tracking-normal sm:text-5xl">
                Terms for using The BEE Suite.
              </h1>
              <p className="mt-5 text-base leading-7 text-slate-300">
                These terms govern access to The BEE Suite websites, parent portal, mobile app, support, documentation, and related childcare operations services.
              </p>
              <p className="mt-3 text-sm leading-6 text-slate-400">Last updated: July 9, 2026</p>
            </div>

            <div className="mt-10 grid gap-4 lg:grid-cols-3">
              <Card className="border-white/10 bg-white/[0.06] text-white shadow-2xl shadow-black/25">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ShieldCheck className="size-5 text-amber-300" />
                    Authorized Access
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm leading-6 text-slate-300">
                  <p>The BEE Suite is role-based. Users may access only records and workflows they are authorized to use by their childcare provider, school, owner group, or The BEE Suite.</p>
                  <p>Access may be limited by role, school, center, owner group, classroom, family, child, tenant, invitation status, and feature configuration.</p>
                </CardContent>
              </Card>

              <Card className="border-white/10 bg-white/[0.06] text-white shadow-2xl shadow-black/25">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CreditCard className="size-5 text-amber-300" />
                    Payments
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm leading-6 text-slate-300">
                  <p>When enabled, parent payments are for childcare tuition, school fees, goods, or services consumed outside the app. Payment method entry is handled by Stripe or another approved payment provider.</p>
                  <p>The BEE Suite does not store full card numbers, full bank account numbers, or bank login credentials.</p>
                </CardContent>
              </Card>

              <Card className="border-white/10 bg-white/[0.06] text-white shadow-2xl shadow-black/25">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="size-5 text-amber-300" />
                    No Emergency Use
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm leading-6 text-slate-300">
                  <p>The BEE Suite supports childcare communication and records. It is not an emergency alert system, medical device, custody decision tool, licensing authority, or legal service.</p>
                  <p>For urgent child safety, pickup, medical, custody, or emergency matters, contact the childcare provider directly.</p>
                </CardContent>
              </Card>
            </div>

            <div className="mt-8 grid gap-4 lg:grid-cols-2">
              <Card className="border-white/10 bg-white/[0.06] text-white shadow-2xl shadow-black/25">
                <CardHeader>
                  <CardTitle>User Responsibilities</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="grid gap-2 text-sm leading-6 text-slate-300">
                    {userResponsibilities.map((item) => (
                      <li key={item} className="flex gap-2">
                        <span className="mt-2 size-1.5 rounded-full bg-amber-300" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              <Card className="border-white/10 bg-white/[0.06] text-white shadow-2xl shadow-black/25">
                <CardHeader>
                  <CardTitle>School Responsibilities</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="grid gap-2 text-sm leading-6 text-slate-300">
                    {schoolResponsibilities.map((item) => (
                      <li key={item} className="flex gap-2">
                        <span className="mt-2 size-1.5 rounded-full bg-amber-300" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </div>

            <div className="mt-8 grid gap-4 lg:grid-cols-3">
              <Card className="border-white/10 bg-white/[0.06] text-white shadow-2xl shadow-black/25">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <LockKeyhole className="size-5 text-amber-300" />
                    Privacy and Records
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm leading-6 text-slate-300">
                  <p>Use of The BEE Suite is subject to the Privacy Policy. Some records are controlled by the childcare provider and may need to be retained for licensing, safety, custody, billing, payment, audit, or legal reasons.</p>
                  <Button variant="outline" className="border-white/15 bg-white/[0.04] text-white hover:bg-white/10" nativeButton={false} render={<Link href="/privacy" />}>
                    Privacy Policy
                  </Button>
                </CardContent>
              </Card>

              <Card className="border-white/10 bg-white/[0.06] text-white shadow-2xl shadow-black/25">
                <CardHeader>
                  <CardTitle>AI and Automation</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm leading-6 text-slate-300">
                  <p>AI-assisted drafts, summaries, and automation support must be reviewed by authorized humans. They do not provide legal, medical, licensing, safety, custody, billing, tax, employment, or compliance advice.</p>
                </CardContent>
              </Card>

              <Card className="border-white/10 bg-white/[0.06] text-white shadow-2xl shadow-black/25">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <LifeBuoy className="size-5 text-amber-300" />
                    Support
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm leading-6 text-slate-300">
                  <p>For app support, account access, privacy requests, or billing workflow questions, contact support. Schools remain the first contact for urgent operational issues.</p>
                  <Button nativeButton={false} render={<Link href="/support" />}>
                    Contact Support
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
