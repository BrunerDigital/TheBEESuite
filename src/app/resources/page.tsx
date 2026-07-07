import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BookOpenCheck,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  CreditCard,
  DoorOpen,
  FileText,
  GraduationCap,
  Landmark,
  Mail,
  MonitorSmartphone,
  ShieldCheck,
  Smartphone,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "SOPs and Step-by-Step Guides | The BEE Suite",
  description:
    "Public The BEE Suite SOPs, setup guides, parent portal instructions, ACH payment guidance, kiosk workflows, and role-based school operating procedures.",
};

type ResourceGuide = {
  id: string;
  audience: string;
  title: string;
  summary: string;
  icon: LucideIcon;
  steps: string[];
  visual: Array<{
    label: string;
    detail: string;
    icon: LucideIcon;
  }>;
};

const guides: ResourceGuide[] = [
  {
    id: "parent-portal-install",
    audience: "Parents and guardians",
    title: "Install the BEE Suite Parent Portal",
    summary: "Add the parent portal to an iPhone, iPad, Android phone, Fire tablet, or desktop browser.",
    icon: Smartphone,
    steps: [
      "Open the link your school gave you, or go to the public parent login page.",
      "Sign in with the email your school has on file.",
      "On iPhone or iPad, open the Share menu in Safari and choose Add to Home Screen.",
      "On Android or Fire tablets, open the browser menu in Chrome or Silk and choose Install app or Add to Home screen.",
      "Name the shortcut The BEE Suite, save it, then open the new icon and confirm you are still signed in.",
    ],
    visual: [
      { label: "Open", detail: "Use Safari, Chrome, or Silk", icon: MonitorSmartphone },
      { label: "Add", detail: "Save to home screen", icon: Smartphone },
      { label: "Confirm", detail: "Log in and check child dashboard", icon: CheckCircle2 },
    ],
  },
  {
    id: "ach-payments",
    audience: "Parents and guardians",
    title: "Verify ACH and Avoid Card Processing Fees",
    summary: "Use a verified bank account for tuition payments when your school supports ACH.",
    icon: Landmark,
    steps: [
      "Open the parent portal and go to Billing or Payments.",
      "Choose Add bank account or ACH as the payment method.",
      "Enter the requested bank details only inside the secure payment screen.",
      "Complete instant verification or confirm the micro-deposits when they appear in your bank account.",
      "Set the verified bank account as the preferred payment method before paying an invoice or enabling autopay.",
      "Review the checkout screen before submitting payment. Card payments may include card processing fees when charged by the processor or school policy.",
    ],
    visual: [
      { label: "Add ACH", detail: "Start from Billing", icon: CreditCard },
      { label: "Verify", detail: "Instant check or deposits", icon: ShieldCheck },
      { label: "Pay", detail: "Use bank account at checkout", icon: CheckCircle2 },
    ],
  },
  {
    id: "parent-portal",
    audience: "Parents and guardians",
    title: "Parent Portal Daily Use",
    summary: "Check child updates, messages, photos, documents, invoices, payment methods, and school notices.",
    icon: UsersRound,
    steps: [
      "Log in from the installed app or parent login page.",
      "Confirm the child profile, school, classroom, and authorized contacts are correct.",
      "Review messages, classroom updates, daily reports, photos, documents, and balances.",
      "Send routine questions through the portal when available.",
      "Contact the school directly for urgent pickup, custody, health, emergency, billing policy, or same-day record corrections.",
    ],
    visual: [
      { label: "Review", detail: "Child updates and notices", icon: FileText },
      { label: "Message", detail: "Routine family questions", icon: Mail },
      { label: "Escalate", detail: "Call school for urgent items", icon: ShieldCheck },
    ],
  },
  {
    id: "school-launch",
    audience: "School owners and executives",
    title: "School System Operating Manual",
    summary: "Launch The BEE Suite as the school system of record across roles, campuses, and daily workflows.",
    icon: Building2,
    steps: [
      "Confirm school profile, locations, programs, rooms, tuition rules, billing cadence, staff roles, and family records.",
      "Invite executives, directors, billing admins, teachers, and families with the right role and location access.",
      "Train directors on enrollment, billing readiness, compliance records, attendance, staffing, and reporting.",
      "Train teachers on attendance, reports, incidents, media uploads, messaging, and classroom device rules.",
      "Train families on parent portal installation, ACH verification, payments, documents, and school escalation rules.",
      "Review launch reports daily during rollout, then weekly after workflows stabilize.",
    ],
    visual: [
      { label: "Configure", detail: "Schools, roles, billing", icon: ClipboardCheck },
      { label: "Train", detail: "Staff and families", icon: GraduationCap },
      { label: "Audit", detail: "Reports and exceptions", icon: BookOpenCheck },
    ],
  },
  {
    id: "executive-admin",
    audience: "Executives and owners",
    title: "Executive Admin SOP",
    summary: "Monitor multi-location operations, access controls, staffing signals, financial readiness, and reporting.",
    icon: ShieldCheck,
    steps: [
      "Log in through the executive workspace.",
      "Review location status, enrollment pipeline, occupancy, attendance, staffing, billing readiness, and unresolved exceptions.",
      "Confirm each user has the least access needed for their job.",
      "Review high-risk records such as custody, medical, incident, payment, and compliance changes.",
      "Use reporting to identify location-level blockers and assign owners for follow-up.",
    ],
    visual: [
      { label: "Monitor", detail: "Locations and exceptions", icon: Building2 },
      { label: "Control", detail: "Roles and permissions", icon: ShieldCheck },
      { label: "Follow up", detail: "Assign accountable owners", icon: ClipboardCheck },
    ],
  },
  {
    id: "director-sop",
    audience: "Directors and assistant directors",
    title: "Director SOP",
    summary: "Run daily school operations from enrollment through attendance, billing readiness, staffing, and family communication.",
    icon: ClipboardCheck,
    steps: [
      "Begin each day by reviewing attendance, staff coverage, ratios, open messages, pending documents, and billing exceptions.",
      "Process enrollment and registration tasks, including family profile completion and classroom placement.",
      "Monitor classroom workflows for attendance, reports, incidents, and photo approvals where required.",
      "Review billing readiness before invoices or autopay runs are processed.",
      "Close the day by checking unresolved exceptions, pickup issues, and follow-up tasks.",
    ],
    visual: [
      { label: "Open", detail: "Attendance and staffing", icon: DoorOpen },
      { label: "Run", detail: "Enrollment and classroom flow", icon: GraduationCap },
      { label: "Close", detail: "Exceptions and follow-up", icon: CheckCircle2 },
    ],
  },
  {
    id: "teacher-sop",
    audience: "Teachers and classroom staff",
    title: "Teacher SOP",
    summary: "Use the classroom workspace for attendance, daily reports, incidents, photos, and routine family updates.",
    icon: GraduationCap,
    steps: [
      "Log in on the assigned classroom device only.",
      "Confirm the roster and mark attendance as children arrive and leave.",
      "Record meals, naps, activities, supplies, notes, and incidents according to school policy.",
      "Upload classroom photos only when allowed by the school and child permissions.",
      "Send routine classroom messages through approved channels and escalate urgent issues to the director immediately.",
    ],
    visual: [
      { label: "Roster", detail: "Confirm children present", icon: UsersRound },
      { label: "Report", detail: "Daily logs and incidents", icon: FileText },
      { label: "Escalate", detail: "Director handles urgent issues", icon: ShieldCheck },
    ],
  },
  {
    id: "billing-admin",
    audience: "Billing administrators",
    title: "Billing Admin SOP",
    summary: "Manage invoices, balances, payment methods, autopay readiness, exceptions, and family payment questions.",
    icon: CreditCard,
    steps: [
      "Review billing schedules, tuition plans, discounts, balances, credits, failed payments, and upcoming autopay runs.",
      "Confirm family payment methods are attached to the correct account before processing.",
      "Encourage ACH verification when families want to avoid card processing fees.",
      "Document payment exceptions, reversals, credits, and parent conversations according to school policy.",
      "Escalate disputes, suspected fraud, custody-related billing questions, and policy decisions to leadership.",
    ],
    visual: [
      { label: "Prepare", detail: "Invoices and balances", icon: FileText },
      { label: "Process", detail: "Payments and autopay", icon: CreditCard },
      { label: "Resolve", detail: "Exceptions and disputes", icon: CheckCircle2 },
    ],
  },
  {
    id: "kiosk-pickup",
    audience: "Schools, staff, and authorized pickups",
    title: "Kiosk and Authorized Pickup Guide",
    summary: "Use the lobby kiosk for check-in, check-out, staff clock events, PINs, QR codes, and pickup verification.",
    icon: DoorOpen,
    steps: [
      "Open the kiosk workflow on the lobby tablet and confirm it is connected to the correct location.",
      "Keep the tablet mounted, charged, and visible to authorized staff.",
      "Families use the approved PIN, QR code, or school-approved check-in method.",
      "Staff verify identity before releasing a child to a new or unfamiliar authorized pickup.",
      "Escalate custody conflicts, blocked pickups, missing authorization, and emergency issues to the director before release.",
    ],
    visual: [
      { label: "Set", detail: "Correct location and tablet", icon: MonitorSmartphone },
      { label: "Check", detail: "PIN, QR, or approved method", icon: DoorOpen },
      { label: "Verify", detail: "Identity before release", icon: ShieldCheck },
    ],
  },
];

const quickLinks = [
  { label: "Parent login", href: "/parents" },
  { label: "Install app launcher", href: "/app" },
  { label: "Contact support", href: "/support" },
  { label: "Privacy policy", href: "/privacy" },
];

function VisualFlow({ guide }: { guide: ResourceGuide }) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {guide.visual.map((item, index) => (
        <div key={item.label} className="relative rounded-lg border border-white/10 bg-black/20 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="grid size-10 place-items-center rounded-lg bg-amber-300 text-slate-950">
              <item.icon className="size-5" />
            </div>
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Step {index + 1}</div>
          </div>
          <div className="mt-4 text-base font-semibold text-white">{item.label}</div>
          <p className="mt-1 text-sm leading-6 text-slate-300">{item.detail}</p>
        </div>
      ))}
    </div>
  );
}

function GuideSection({ guide }: { guide: ResourceGuide }) {
  return (
    <section id={guide.id} className="scroll-mt-24 rounded-lg border border-white/10 bg-white/[0.055] p-5 shadow-2xl shadow-black/20 md:p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <div className="flex flex-wrap items-center gap-3">
            <div className="grid size-11 place-items-center rounded-lg bg-amber-300 text-slate-950">
              <guide.icon className="size-5" />
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-200">{guide.audience}</div>
              <h2 className="mt-1 text-2xl font-semibold tracking-normal text-white">{guide.title}</h2>
            </div>
          </div>
          <p className="mt-4 text-sm leading-6 text-slate-300">{guide.summary}</p>
        </div>
        <Button
          variant="outline"
          className="h-10 border-white/15 bg-white/[0.04] px-4 text-white hover:bg-white/10"
          nativeButton={false}
          render={<Link href={`#${guide.id}`} />}
        >
          Section link
        </Button>
      </div>

      <div className="mt-6">
        <VisualFlow guide={guide} />
      </div>

      <div className="mt-6 rounded-lg border border-white/10 bg-[#05070a]/65 p-4">
        <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-400">Step-by-step guide</h3>
        <ol className="mt-4 grid gap-3">
          {guide.steps.map((step, index) => (
            <li key={step} className="flex gap-3 text-sm leading-6 text-slate-200">
              <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-amber-300 text-xs font-bold text-slate-950">{index + 1}</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export default function ResourcesPage() {
  return (
    <main className="min-h-screen bg-[#05070a] text-white">
      <section className="relative overflow-hidden px-4 py-6 sm:px-6 lg:px-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_8%,rgba(245,181,27,0.18),transparent_28rem),radial-gradient(circle_at_86%_16%,rgba(14,165,233,0.12),transparent_30rem),linear-gradient(135deg,#05070a_0%,#091018_58%,#161006_100%)]" />
        <div className="relative mx-auto max-w-[1400px]">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <BrandLogo href="/" size="md" priority />
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" className="border-white/15 bg-white/[0.04] text-white hover:bg-white/10" nativeButton={false} render={<Link href="/support" />}>
                Support
              </Button>
              <Button nativeButton={false} render={<Link href="/app" />}>
                Install app
              </Button>
            </div>
          </header>

          <div className="grid gap-10 py-14 lg:grid-cols-[0.78fr_1fr] lg:items-center">
            <div>
              <Badge className="bg-amber-300 text-slate-950">
                <BookOpenCheck data-icon="inline-start" />
                Public help center
              </Badge>
              <h1 className="mt-5 text-4xl font-semibold leading-tight tracking-normal sm:text-5xl lg:text-6xl">
                SOPs and guides for every BEE Suite user.
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-slate-300">
                Use these public guides for parent portal setup, ACH verification, daily school operations, classroom workflows, billing, kiosk setup, pickup verification, and support escalation.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Button className="h-11 px-5" nativeButton={false} render={<Link href="#parent-portal-install" />}>
                  Start with parent setup
                  <ArrowRight data-icon="inline-end" />
                </Button>
                <Button variant="outline" className="h-11 border-white/15 bg-white/[0.04] px-5 text-white hover:bg-white/10" nativeButton={false} render={<Link href="#school-launch" />}>
                  School SOPs
                </Button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {guides.slice(0, 6).map((guide) => (
                <Link
                  key={guide.id}
                  href={`#${guide.id}`}
                  className="group rounded-lg border border-white/10 bg-white/[0.055] p-4 transition hover:border-amber-300/70 hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-amber-300/45"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="grid size-10 place-items-center rounded-lg bg-amber-300 text-slate-950">
                      <guide.icon className="size-5" />
                    </div>
                    <ArrowRight className="size-4 text-slate-500 transition group-hover:translate-x-1 group-hover:text-amber-300" />
                  </div>
                  <div className="mt-4 text-xs font-semibold uppercase tracking-[0.16em] text-amber-200">{guide.audience}</div>
                  <div className="mt-2 text-base font-semibold text-white">{guide.title}</div>
                </Link>
              ))}
            </div>
          </div>

          <div className="grid gap-3 border-y border-white/10 py-5 sm:grid-cols-2 lg:grid-cols-4">
            {quickLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="flex items-center justify-between rounded-lg border border-white/10 bg-black/20 px-4 py-3 text-sm font-semibold text-slate-200 transition hover:border-amber-300/60 hover:text-amber-200"
              >
                {link.label}
                <ArrowRight className="size-4" />
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 pb-16 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-[1400px] gap-5">
          <div className="rounded-lg border border-amber-300/25 bg-amber-300/10 p-4 text-sm leading-6 text-amber-100">
            For urgent child safety, pickup, custody, medical, emergency, or same-day school policy questions, contact the school directly before using the general support path.
          </div>

          {guides.map((guide) => (
            <GuideSection key={guide.id} guide={guide} />
          ))}
        </div>
      </section>

      <footer className="border-t border-white/10 px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-[1400px] flex-col gap-4 text-sm text-slate-400 md:flex-row md:items-center md:justify-between">
          <BrandLogo href="/" compact />
          <div className="flex flex-wrap gap-4">
            <Link className="hover:text-amber-200" href="/support">
              Support
            </Link>
            <Link className="hover:text-amber-200" href="/privacy">
              Privacy
            </Link>
            <Link className="hover:text-amber-200" href="/app">
              Install app
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
