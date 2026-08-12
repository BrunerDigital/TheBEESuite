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
  "School staff and administrators see records allowed by their account and assigned location.",
  "The BEE Suite restricts access to private files and child media and may use time-limited access links.",
  "The BEE Suite keeps a history of sensitive account changes and limits sensitive details in system logs where practical.",
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
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
              <Button variant="outline" className="border-white/15 bg-white/[0.04] text-white hover:bg-white/10" nativeButton={false} render={<Link href="/support" />}>
                Support
              </Button>
              <Button variant="outline" className="border-white/15 bg-white/[0.04] text-white hover:bg-white/10" nativeButton={false} render={<Link href="/terms" />}>
                Terms
              </Button>
              <Button variant="outline" className="border-white/15 bg-white/[0.04] text-white hover:bg-white/10" nativeButton={false} render={<Link href="/eula" />}>
                EULA
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
                 The BEE Suite is a childcare operations platform. This policy describes how it handles data for the BEE Suite Parent Portal and connected school services.
              </p>
              <p className="mt-3 text-sm leading-6 text-slate-400">Last updated: August 11, 2026</p>
            </div>

            <div className="mt-10 grid gap-4 md:grid-cols-2">
              {collectedData.map(({ title, body, Icon }) => (
                <Card key={title} className="border-white/10 bg-white/[0.06] text-white shadow-2xl shadow-black/25">
                  <CardHeader>
                    <CardTitle as="h2" className="flex items-center gap-2">
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
                  <CardTitle as="h2">How Data Is Used</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm leading-6 text-slate-300">
                  <p>We use data to provide secure school operations, Parent Portal access, family communication, document handling, child updates, billing views, payment handoff, support, security, change history, and service reliability.</p>
                  <p>Schools use The BEE Suite to manage childcare operations. Some records, retention periods, approvals, and corrections are controlled by the school, state licensing obligations, accounting requirements, or school policy.</p>
                  <p>Payment checkout and saved payment methods may use Stripe. Email and text messages may be delivered by third-party communication services. These companies process only the data needed to provide those services.</p>
                </CardContent>
              </Card>

              <Card className="border-white/10 bg-white/[0.06] text-white shadow-2xl shadow-black/25">
                <CardHeader>
                  <CardTitle as="h2">Privacy and Security Practices</CardTitle>
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
                  <CardTitle as="h2">Parent Choices</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm leading-6 text-slate-300">
                  <p>Parents can update notification preferences where available, change their password, submit contact change requests, request account deletion under Family → Profile &amp; Security, and ask their school to review incorrect family or child records.</p>
                  <p>Deletion or correction requests may need school approval when records are required for licensing, safety, accounting, payment, account-history, or legal reasons.</p>
                </CardContent>
              </Card>

              <Card className="border-white/10 bg-white/[0.06] text-white shadow-2xl shadow-black/25">
                <CardHeader>
                  <CardTitle as="h2">Children&apos;s Privacy</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm leading-6 text-slate-300">
                  <p>The Parent Portal is for parents and guardians. Authorized school staff use separate school workspaces. The platform does not create child self-service accounts for the Parent Portal.</p>
                  <p>Schools control which guardian accounts are connected to each child and family.</p>
                </CardContent>
              </Card>

              <Card className="border-white/10 bg-white/[0.06] text-white shadow-2xl shadow-black/25">
                <CardHeader>
                  <CardTitle as="h2">Contact</CardTitle>
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
