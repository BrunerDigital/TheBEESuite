import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  CalendarCheck2,
  CheckCircle2,
  FileCheck2,
  Hexagon,
  LockKeyhole,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const funnel = [
  {
    title: "Inquiry",
    body: "Capture website, phone, and walk-in interest in one intake queue.",
    icon: MessageSquareText,
  },
  {
    title: "Tour",
    body: "Schedule visits, prep directors, and track family follow-up tasks.",
    icon: CalendarCheck2,
  },
  {
    title: "Enrollment",
    body: "Move accepted families through documents, deposits, and start dates.",
    icon: FileCheck2,
  },
  {
    title: "Family portal",
    body: "Keep messages, forms, billing, and classroom updates connected.",
    icon: UsersRound,
  },
];

const setupSteps = [
  "Brand profile and custom domain",
  "Organization, regions, and centers",
  "Roles, permissions, and staff invites",
  "Inquiry form embed, CRM stages, and tour rules",
  "Stripe Connect payout accounts",
  "Parent portal, billing, and document checklist",
];

const proof = [
  ["Role-scoped CRM", "Directors, regional teams, and owners only see the records they should."],
  ["Human-reviewed AI", "Mr. Bee drafts summaries and follow-ups without making safety or billing decisions."],
  ["Multi-location ready", "Start with one center or roll out across an entire childcare brand."],
];

function ProductPreview() {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/80 p-3 shadow-2xl shadow-black/40">
      <div className="flex items-center justify-between border-b border-white/10 pb-3">
        <div className="flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Hexagon className="size-4" />
          </span>
          <div>
            <div className="text-sm font-semibold text-white">Bee Suite Command</div>
            <div className="text-xs text-slate-400">Live enrollment snapshot</div>
          </div>
        </div>
        <div className="rounded-lg bg-emerald-400/15 px-2.5 py-1 text-xs font-medium text-emerald-200">
          Synced
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 py-3 sm:gap-3">
        {[
          ["142", "Active leads"],
          ["28", "Tours booked"],
          ["91%", "Compliance"],
        ].map(([value, label]) => (
          <div key={label} className="rounded-xl border border-white/10 bg-white/[0.04] p-2 sm:p-3">
            <div className="text-xl font-semibold text-white sm:text-2xl">{value}</div>
            <div className="mt-1 text-[0.68rem] leading-4 text-slate-400 sm:text-xs">{label}</div>
          </div>
        ))}
      </div>
      <div className="hidden gap-3 sm:grid lg:grid-cols-[1fr_0.72fr]">
        <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-medium text-white">Enrollment funnel</span>
            <BarChart3 className="size-4 text-primary" />
          </div>
          {[
            ["New inquiry", "86%"],
            ["Tour scheduled", "64%"],
            ["Application sent", "42%"],
            ["Deposit pending", "29%"],
          ].map(([label, width]) => (
            <div key={label} className="mb-3 last:mb-0">
              <div className="mb-1 flex justify-between text-xs text-slate-300">
                <span>{label}</span>
                <span>{width}</span>
              </div>
              <div className="h-2 rounded-full bg-white/10">
                <div className="h-2 rounded-full bg-primary" style={{ width }} />
              </div>
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
          <div className="text-sm font-medium text-white">Onboarding readiness</div>
          <div className="mt-3 space-y-2">
            {["Brand", "Centers", "Users", "Payouts"].map((item, index) => (
              <div key={item} className="flex items-center justify-between rounded-lg bg-slate-900/80 px-3 py-2">
                <span className="text-xs text-slate-300">{item}</span>
                <span className={index < 3 ? "text-primary" : "text-slate-500"}>
                  <CheckCircle2 className="size-4" />
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LandingPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-slate-950 text-white">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-slate-950/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-3" aria-label="The Bee Suite home">
            <span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground">
              <Hexagon />
            </span>
            <span className="text-sm font-semibold tracking-wide">The Bee Suite</span>
          </Link>
          <nav className="ml-auto hidden items-center gap-6 text-sm text-slate-300 md:flex">
            <a href="#product" className="hover:text-white">Product</a>
            <a href="#funnel" className="hover:text-white">Funnel</a>
            <a href="#onboarding" className="hover:text-white">Onboarding</a>
            <a href="#security" className="hover:text-white">Security</a>
          </nav>
          <div className="ml-auto flex items-center gap-2 md:ml-4">
            <Button variant="outline" nativeButton={false} render={<Link href="/login" />}>
              Log in
            </Button>
            <Button nativeButton={false} render={<Link href="/onboarding" />}>
              Start onboarding
              <ArrowRight data-icon="inline-end" />
            </Button>
          </div>
        </div>
      </header>

      <section id="product" className="relative">
        <div className="absolute inset-0 bg-[linear-gradient(145deg,#020617_0%,#0f172a_54%,#2b1f08_100%)]" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-8 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[0.92fr_1.08fr] lg:px-8 lg:py-20">
          <div className="max-w-3xl">
            <h1 className="text-5xl font-semibold leading-[1.02] tracking-normal text-white sm:text-6xl lg:text-7xl">
              The Bee Suite
            </h1>
            <p className="mt-6 max-w-2xl text-xl leading-8 text-slate-200">
              Childcare CRM, enrollment, operations, billing, and family engagement in one role-aware command center for childcare centers, preschools, daycare groups, and multi-location operators.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button size="lg" className="h-11 px-4" nativeButton={false} render={<Link href="/onboarding" />}>
                Start onboarding
                <ArrowRight data-icon="inline-end" />
              </Button>
              <Button size="lg" variant="outline" className="h-11 border-white/20 bg-white/5 px-4 text-white hover:bg-white/10" nativeButton={false} render={<Link href="/login" />}>
                Log in to workspace
              </Button>
            </div>
            <div className="mt-10 hidden gap-3 md:grid md:grid-cols-3">
              {proof.map(([title, body]) => (
                <div key={title} className="border-l border-primary/60 pl-4">
                  <div className="text-sm font-semibold text-white">{title}</div>
                  <p className="mt-1 text-sm leading-5 text-slate-300">{body}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="relative">
            <ProductPreview />
            <div className="mt-3 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3 sm:mt-4">
              <Image
                src="/mr-bee.png"
                alt="Mr. Bee assistant"
                width={72}
                height={72}
                className="size-14 rounded-xl object-cover"
                priority
              />
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-white">
                  <Sparkles className="size-4 text-primary" />
                  Mr. Bee drafts the next best follow-up
                </div>
                <p className="mt-1 text-sm leading-5 text-slate-300">
                  Every AI summary is labeled for human review before a family, child, or payment workflow changes.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="funnel" className="bg-slate-100 px-4 py-20 text-slate-950 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-8 lg:grid-cols-[0.72fr_1fr] lg:items-end">
            <div>
              <h2 className="text-3xl font-semibold tracking-normal sm:text-4xl">A cleaner path from first inquiry to first day.</h2>
              <p className="mt-4 text-base leading-7 text-slate-600">
                Website forms, call-ins, tours, and applications flow into one operating model for every center, family, and admissions team.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {funnel.map((step, index) => (
                <Card key={step.title} className="rounded-lg border-slate-200 bg-white shadow-sm">
                  <CardHeader>
                    <div className="mb-2 flex items-center justify-between">
                      <span className="grid size-9 place-items-center rounded-lg bg-slate-950 text-primary">
                        <step.icon className="size-4" />
                      </span>
                      <span className="text-xs font-semibold text-slate-400">{String(index + 1).padStart(2, "0")}</span>
                    </div>
                    <CardTitle>{step.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm leading-6 text-slate-600">{step.body}</CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="onboarding" className="bg-white px-4 py-20 text-slate-950 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
          <div>
            <h2 className="text-3xl font-semibold tracking-normal sm:text-4xl">Onboarding is ready before the sales call ends.</h2>
            <p className="mt-4 text-base leading-7 text-slate-600">
              New providers get a structured launch intake: brand details, center count, inquiry form setup, launch timeline, priorities, payout ownership, and handoff guidance.
            </p>
            <div className="mt-6 flex gap-3">
              <Button nativeButton={false} render={<Link href="/onboarding" />}>
                Open onboarding
                <ArrowRight data-icon="inline-end" />
              </Button>
              <Button variant="outline" nativeButton={false} render={<Link href="/login" />}>
                Existing user login
              </Button>
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="rounded-xl bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between border-b pb-3">
                <div>
                  <div className="text-sm font-semibold">Launch checklist</div>
                  <div className="text-xs text-slate-500">Six steps to a usable workspace</div>
                </div>
                <div className="rounded-lg bg-primary/20 px-2.5 py-1 text-xs font-semibold text-slate-950">Guided</div>
              </div>
              <div className="mt-4 space-y-3">
                {setupSteps.map((step, index) => (
                  <div key={step} className="flex items-center gap-3 rounded-lg border border-slate-200 p-3">
                    <span className="grid size-7 place-items-center rounded-md bg-slate-950 text-xs font-semibold text-primary">
                      {index + 1}
                    </span>
                      <span className="text-sm font-medium">{step}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="security" className="bg-slate-950 px-4 py-20 text-white sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-3">
          {[
            [ShieldCheck, "Permission boundaries", "Tenant, organization, center, classroom, family, and role scopes are built into the app foundation."],
            [LockKeyhole, "Sensitive workflow posture", "Custody, medical, safety, billing, and compliance records stay labeled and gated."],
            [CheckCircle2, "Production handoff clarity", "Integrations are visible, statused, and ready to connect without confusing demo behavior for live automation."],
          ].map(([Icon, title, body]) => (
            <div key={title as string} className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
              <Icon className="size-6 text-primary" />
              <h3 className="mt-4 text-lg font-semibold">{title as string}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-300">{body as string}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-primary px-4 py-16 text-slate-950 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-3xl font-semibold tracking-normal">Ready to set up The Bee Suite?</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-800">
              Start onboarding for a childcare center, preschool, or multi-location brand, or sign in if your workspace is already live.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button className="bg-slate-950 text-white hover:bg-slate-900" nativeButton={false} render={<Link href="/onboarding" />}>
              Start onboarding
            </Button>
            <Button variant="outline" className="border-slate-950/30 bg-transparent hover:bg-slate-950/10" nativeButton={false} render={<Link href="/login" />}>
              Log in
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
}
