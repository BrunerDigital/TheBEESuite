import type { Metadata } from "next";
import Link from "next/link";
import { Database, FileText, LockKeyhole, Mail, ShieldCheck, UserRound } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Privacy Policy | The BEE Suite",
  description: "Privacy policy for The BEE Suite and BEE Suite Parent Portal.",
};

const collectedData = [
  {
    title: "Account and Contact Information",
    body: "Name, email address, phone number, school, guardian relationship, login status, and communication preferences.",
    Icon: UserRound,
  },
  {
    title: "Family and Child Records",
    body: "Family profiles, linked children, classroom details, schedules, daily reports, attendance context, incident acknowledgements, documents, and school-approved media.",
    Icon: FileText,
  },
  {
    title: "Messages and Uploaded Content",
    body: "Parent-to-school messages, message attachments, document uploads, typed signatures, contact change requests, and support details you choose to provide.",
    Icon: Database,
  },
  {
    title: "Billing and Payment Context",
    body: "Invoices, balances, payment status, ledger entries, and Stripe payment identifiers. Full card and bank credentials are handled by Stripe and are not stored by The BEE Suite.",
    Icon: LockKeyhole,
  },
];

const privacyPractices = [
  "Parent and guardian accounts only show records linked to their family through school-managed guardian records.",
  "School staff and administrators see records according to role, center, organization, and tenant access rules.",
  "Private files and child media are stored in restricted storage and served through signed links when configured.",
  "The app uses audit logging for sensitive operational changes and redacts sensitive details from operational logs where practical.",
  "The app does not sell parent, child, or school data.",
  "The app is not intended for child self-service accounts.",
];

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#05070a] text-white">
      <section className="px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <BrandLogo href="/" size="md" priority />
            <div className="flex items-center gap-2">
              <Button variant="outline" className="border-white/15 bg-white/[0.04] text-white hover:bg-white/10" nativeButton={false} render={<Link href="/support" />}>
                Support
              </Button>
              <Button nativeButton={false} render={<Link href="/parents" />}>
                Parent login
              </Button>
            </div>
          </header>

          <div className="py-12">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-lg border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-sm font-semibold text-amber-100">
                <ShieldCheck className="size-4" />
                Privacy Policy
              </div>
              <h1 className="mt-5 text-4xl font-semibold leading-tight tracking-normal sm:text-5xl">
                How The BEE Suite handles parent portal data.
              </h1>
              <p className="mt-5 text-base leading-7 text-slate-300">
                The BEE Suite is a role-based childcare operations platform. This policy describes how the platform handles data for the BEE Suite Parent Portal and related school workflows.
              </p>
              <p className="mt-3 text-sm leading-6 text-slate-400">Last updated: July 7, 2026</p>
            </div>

            <div className="mt-10 grid gap-4 md:grid-cols-2">
              {collectedData.map(({ title, body, Icon }) => (
                <Card key={title} className="border-white/10 bg-white/[0.06] text-white shadow-2xl shadow-black/25">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Icon className="size-5 text-amber-300" />
                      {title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm leading-6 text-slate-300">{body}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="mt-8 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
              <Card className="border-white/10 bg-white/[0.06] text-white shadow-2xl shadow-black/25">
                <CardHeader>
                  <CardTitle>How Data Is Used</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm leading-6 text-slate-300">
                  <p>We use data to provide secure school operations, parent portal access, family communication, document workflows, child updates, billing views, payment handoff, support, security, auditing, and service reliability.</p>
                  <p>Schools use The BEE Suite to manage childcare operations. Some records, retention periods, approvals, and corrections are controlled by the school, state licensing obligations, accounting requirements, or school policy.</p>
                  <p>Payment checkout and saved payment method workflows may use Stripe. Email or SMS workflows may use configured communication providers. These vendors process data needed to provide their services.</p>
                </CardContent>
              </Card>

              <Card className="border-white/10 bg-white/[0.06] text-white shadow-2xl shadow-black/25">
                <CardHeader>
                  <CardTitle>Privacy and Security Practices</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="grid gap-2 text-sm leading-6 text-slate-300">
                    {privacyPractices.map((practice) => (
                      <li key={practice} className="flex gap-2">
                        <span className="mt-2 size-1.5 rounded-full bg-amber-300" />
                        <span>{practice}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </div>

            <div className="mt-8 grid gap-4 lg:grid-cols-3">
              <Card className="border-white/10 bg-white/[0.06] text-white shadow-2xl shadow-black/25">
                <CardHeader>
                  <CardTitle>Parent Choices</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm leading-6 text-slate-300">
                  <p>Parents can update notification preferences where enabled, change their password, submit contact change requests, and ask their school to review incorrect family or child records.</p>
                  <p>Deletion or correction requests may need school approval when records are required for licensing, safety, accounting, audit, or legal reasons.</p>
                </CardContent>
              </Card>

              <Card className="border-white/10 bg-white/[0.06] text-white shadow-2xl shadow-black/25">
                <CardHeader>
                  <CardTitle>Children&apos;s Privacy</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm leading-6 text-slate-300">
                  <p>The parent portal is for parents, guardians, school staff, and authorized operational users. The platform does not create child self-service accounts for the parent portal.</p>
                  <p>Child records are handled through school-managed access, guardian links, and role-based controls.</p>
                </CardContent>
              </Card>

              <Card className="border-white/10 bg-white/[0.06] text-white shadow-2xl shadow-black/25">
                <CardHeader>
                  <CardTitle>Contact</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm leading-6 text-slate-300">
                  <p>For privacy or support questions, email <a className="font-semibold text-amber-200 underline-offset-4 hover:underline" href="mailto:support@thebeesuite.io">support@thebeesuite.io</a>.</p>
                  <p>For urgent child safety, pickup, billing policy, or same-day school record issues, contact your school directly.</p>
                  <Button className="mt-2" nativeButton={false} render={<a href="mailto:support@thebeesuite.io" />}>
                    <Mail data-icon="inline-start" />
                    Email support
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
