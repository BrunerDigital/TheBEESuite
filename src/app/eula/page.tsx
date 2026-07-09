import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Apple, FileText, LifeBuoy, LockKeyhole, ShieldCheck } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "End User License Agreement | The BEE Suite",
  description: "End User License Agreement for the BEE Suite Parent Portal iOS app.",
};

const restrictions = [
  "Do not copy, modify, distribute, sell, lease, sublicense, reverse engineer, or commercially exploit the app except where law requires otherwise.",
  "Do not bypass authentication, permissions, tenant scoping, rate limits, audit logs, or security controls.",
  "Do not use the app to access school, child, family, staff, billing, or operational records without authorization.",
  "Do not upload malware, harmful files, or content you are not authorized to provide.",
  "Do not use the app as the only method for emergency, child safety, pickup, medical, or custody communication.",
];

export default function EulaPage() {
  return (
    <main className="min-h-screen bg-[#05070a] text-white">
      <section className="px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <BrandLogo href="/" size="md" priority />
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" className="border-white/15 bg-white/[0.04] text-white hover:bg-white/10" nativeButton={false} render={<Link href="/terms" />}>
                Terms
              </Button>
              <Button variant="outline" className="border-white/15 bg-white/[0.04] text-white hover:bg-white/10" nativeButton={false} render={<Link href="/privacy" />}>
                Privacy
              </Button>
              <Button nativeButton={false} render={<Link href="/support" />}>
                Support
              </Button>
            </div>
          </header>

          <div className="py-12">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-lg border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-sm font-semibold text-amber-100">
                <Apple className="size-4" />
                End User License Agreement
              </div>
              <h1 className="mt-5 text-4xl font-semibold leading-tight tracking-normal sm:text-5xl">
                License terms for the iOS parent app.
              </h1>
              <p className="mt-5 text-base leading-7 text-slate-300">
                This EULA applies to the BEE Suite Parent Portal iOS app. The app is licensed, not sold, and is provided for authorized childcare parent portal access.
              </p>
              <p className="mt-3 text-sm leading-6 text-slate-400">Last updated: July 9, 2026</p>
            </div>

            <div className="mt-10 grid gap-4 lg:grid-cols-3">
              <Card className="border-white/10 bg-white/[0.06] text-white shadow-2xl shadow-black/25">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ShieldCheck className="size-5 text-amber-300" />
                    License
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm leading-6 text-slate-300">
                  <p>The BEE Suite grants authorized users a limited, non-exclusive, non-transferable, revocable license to install and use the app on Apple-branded devices as permitted by Apple&apos;s App Store rules.</p>
                  <p>Use is limited to authorized parent portal and childcare-related workflows enabled by the childcare provider.</p>
                </CardContent>
              </Card>

              <Card className="border-white/10 bg-white/[0.06] text-white shadow-2xl shadow-black/25">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="size-5 text-amber-300" />
                    Related Terms
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm leading-6 text-slate-300">
                  <p>The Terms of Service and Privacy Policy also apply. School or customer agreements may add separate requirements for records, retention, support, data processing, or user access.</p>
                  <Button variant="outline" className="border-white/15 bg-white/[0.04] text-white hover:bg-white/10" nativeButton={false} render={<Link href="/terms" />}>
                    Terms of Service
                  </Button>
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
                  <p>The app supports childcare communication and records. It is not an emergency alert system, medical device, custody decision tool, licensing authority, or legal service.</p>
                  <p>For urgent child safety, pickup, medical, custody, or emergency matters, contact the childcare provider directly.</p>
                </CardContent>
              </Card>
            </div>

            <div className="mt-8 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
              <Card className="border-white/10 bg-white/[0.06] text-white shadow-2xl shadow-black/25">
                <CardHeader>
                  <CardTitle>Restrictions</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="grid gap-2 text-sm leading-6 text-slate-300">
                    {restrictions.map((item) => (
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
                  <CardTitle className="flex items-center gap-2">
                    <LockKeyhole className="size-5 text-amber-300" />
                    Privacy and Records
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm leading-6 text-slate-300">
                  <p>The app may process child, family, school, staff, billing, payment, device, diagnostic, support, and security information according to the Privacy Policy.</p>
                  <p>Some childcare records may remain retained after account closure where required for licensing, safety, custody, billing, payment, audit, or legal reasons.</p>
                  <Button variant="outline" className="border-white/15 bg-white/[0.04] text-white hover:bg-white/10" nativeButton={false} render={<Link href="/privacy" />}>
                    Privacy Policy
                  </Button>
                </CardContent>
              </Card>
            </div>

            <div className="mt-8 grid gap-4 lg:grid-cols-3">
              <Card className="border-white/10 bg-white/[0.06] text-white shadow-2xl shadow-black/25">
                <CardHeader>
                  <CardTitle>Payments</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm leading-6 text-slate-300">
                  <p>Where enabled, payments shown in the app are for childcare tuition, fees, goods, or services consumed outside the app. Payment method entry is handled by Stripe or another approved provider.</p>
                </CardContent>
              </Card>

              <Card className="border-white/10 bg-white/[0.06] text-white shadow-2xl shadow-black/25">
                <CardHeader>
                  <CardTitle>Apple</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm leading-6 text-slate-300">
                  <p>This agreement is between the user and The BEE Suite/BrunerDigital, not Apple. Apple is not responsible for the app, its content, maintenance, or support except where Apple&apos;s rules or law require otherwise.</p>
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
                  <p>The BEE Suite, not Apple, provides app support. Schools remain the first contact for urgent operational issues.</p>
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
