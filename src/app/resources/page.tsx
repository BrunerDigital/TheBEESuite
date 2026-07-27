import type { Metadata } from "next";
import Image from "next/image";
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
    "Current The BEE Suite setup guides, parent portal instructions, card and bank payment guidance, launch gates, kiosk workflows, and role-based operating procedures.",
};

type ResourceGuide = {
  id: string;
  audience: string;
  title: string;
  summary: string;
  graphicSrc: string;
  graphicAlt: string;
  icon: LucideIcon;
  steps: string[];
  visual: Array<{
    label: string;
    detail: string;
    icon: LucideIcon;
  }>;
  screenshots?: Array<{
    src: string;
    alt: string;
    label: string;
    device: "iPhone" | "iPad" | "Desktop";
  }>;
};

const guides: ResourceGuide[] = [
  {
    id: "parent-portal-install",
    audience: "Parents and guardians",
    title: "Install the BEE Suite Parent Portal",
    summary: "Add the parent portal to an iPhone, iPad, Android phone, Fire tablet, or desktop browser.",
    graphicSrc: "/brand/the-bee-suite/explainers/bee-suite-parent-access-install-2026-07-27-v3.png",
    graphicAlt: "Current six-step parent access and installation flow for The BEE Suite",
    screenshots: [
      {
        src: "/brand/the-bee-suite/screenshots/2026-07-27-light/parent-iphone-overview-light.png",
        alt: "Parent portal overview shown at an iPhone viewport",
        label: "Parent portal overview",
        device: "iPhone",
      },
      {
        src: "/brand/the-bee-suite/screenshots/2026-07-27-light/parent-ipad-overview-light.png",
        alt: "Parent portal overview shown at an iPad viewport",
        label: "Parent portal on a tablet",
        device: "iPad",
      },
      {
        src: "/brand/the-bee-suite/screenshots/2026-07-27-light/parent-desktop-overview-light.png",
        alt: "Parent portal overview shown at a desktop viewport",
        label: "Parent portal on desktop",
        device: "Desktop",
      },
    ],
    icon: Smartphone,
    steps: [
      "Open https://thebeesuite.io/parents and confirm the address starts with https://thebeesuite.io. In Safari, stop if the address bar says Not Secure.",
      "Sign in with the guardian email and school-issued first-login password from the approved invitation.",
      "Confirm the correct family and child records before continuing.",
      "On iPhone or iPad, use Safari Share > Add to Home Screen. On Android or Fire, use the Chrome or Silk menu > Install app or Add to Home screen.",
      "Open the new BEE Suite icon and sign in again if the device asks.",
      "Keep the issued password or change it later in Settings. Use password recovery if it is lost; never share or forward invitation credentials.",
    ],
    visual: [
      { label: "Open", detail: "Use Safari, Chrome, or Silk", icon: MonitorSmartphone },
      { label: "Add", detail: "Save to home screen", icon: Smartphone },
      { label: "Confirm", detail: "Log in and check child dashboard", icon: CheckCircle2 },
    ],
  },
  {
    id: "payments",
    audience: "Parents and guardians",
    title: "Card, Bank, and Autopay Payments",
    summary: "Save a card or bank securely, choose a payment option, and review the exact total before submitting.",
    graphicSrc: "/brand/the-bee-suite/explainers/bee-suite-parent-payment-options-2026-07-27-v3.png",
    graphicAlt: "Current parent card, bank, invoice, and autopay payment choices",
    screenshots: [
      {
        src: "/brand/the-bee-suite/screenshots/2026-07-27-light/parent-iphone-billing-light.png",
        alt: "Parent billing and payment options shown at an iPhone viewport",
        label: "Billing and payment options",
        device: "iPhone",
      },
    ],
    icon: Landmark,
    steps: [
      "Open Billing or Payment Settings and confirm the correct family and invoice.",
      "Choose Save Debit/Credit Card to save a card, or Verify Bank Instantly to save a bank.",
      "For an open invoice, choose Debit/Credit Card, Instant Bank, or One-Time Bank.",
      "Enter card or bank details only inside the secure Stripe payment screen.",
      "Review the exact total, processing recovery when shown, and payment disclosure before submitting.",
      "Wait for the confirmation and current status. Do not repeat a pending bank payment or setup attempt.",
    ],
    visual: [
      { label: "Choose", detail: "Card first; bank remains available", icon: CreditCard },
      { label: "Secure", detail: "Enter details only in Stripe", icon: ShieldCheck },
      { label: "Confirm", detail: "Review total and payment status", icon: CheckCircle2 },
    ],
  },
  {
    id: "parent-portal",
    audience: "Parents and guardians",
    title: "Parent Portal Daily Use",
    summary: "Check child updates, messages, photos, documents, invoices, payment methods, and school notices.",
    graphicSrc: "/brand/the-bee-suite/sop-graphics/2026-07-27-v2/parent-multidevice-portal-guide.png",
    graphicAlt: "Current parent portal guide led by iPhone with daily report and billing examples",
    screenshots: [
      {
        src: "/brand/the-bee-suite/screenshots/2026-07-27-light/parent-iphone-daily-reports-light.png",
        alt: "Parent daily reports shown at an iPhone viewport",
        label: "Daily reports",
        device: "iPhone",
      },
      {
        src: "/brand/the-bee-suite/screenshots/2026-07-27-light/parent-iphone-activities-light.png",
        alt: "Parent classroom activities shown at an iPhone viewport",
        label: "Classroom activities",
        device: "iPhone",
      },
      {
        src: "/brand/the-bee-suite/screenshots/2026-07-27-light/parent-iphone-overview-light.png",
        alt: "Parent family portal overview shown at an iPhone viewport",
        label: "Family overview",
        device: "iPhone",
      },
    ],
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
    graphicSrc: "/brand/the-bee-suite/explainers/bee-suite-school-launch-gates-2026-07-27-v3.png",
    graphicAlt: "Current independent school launch gates and stop conditions",
    icon: Building2,
    steps: [
      "Approve the school profile, rooms, staff roles, family records, tuition rules, billing cadence, and source-data reconciliation.",
      "Test real role and school isolation for executives, directors, billing admins, teachers, parents, and kiosk users.",
      "Keep setup, parent invitations, kiosk/PIN, billing, parent payments, ProCare retirement, mobile stores, and wider-wave approval as independent dated gates.",
      "Train directors, teachers, billing staff, and families only on features approved for that school.",
      "Keep ProCare as the source of record until reconciliation, ownership, and the signed cutover decision are complete.",
      "A HELD OFF gate is not a PASS. Record each GO or NO-GO and its owner; stop the affected flow when evidence is missing.",
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
    graphicSrc: "/brand/the-bee-suite/sop-graphics/2026-07-27-v2/executive-desktop-oversight-guide.png",
    graphicAlt: "Current executive desktop administration and FTE oversight guide",
    screenshots: [
      {
        src: "/brand/the-bee-suite/screenshots/2026-07-27-light/executive-desktop-admin-light.png",
        alt: "Executive administration workspace shown at a desktop viewport",
        label: "Executive administration",
        device: "Desktop",
      },
      {
        src: "/brand/the-bee-suite/screenshots/2026-07-27-light/executive-desktop-fte-light.png",
        alt: "Executive FTE reporting workspace shown at a desktop viewport",
        label: "FTE reporting",
        device: "Desktop",
      },
    ],
    icon: ShieldCheck,
    steps: [
      "Log in through the executive workspace.",
      "Review location status, enrollment pipeline, occupancy, attendance, staffing, billing readiness, and unresolved exceptions.",
      "Confirm each user has the least access needed for their job.",
      "Review high-risk records such as custody, medical, incident, payment, and compliance changes.",
      "For FTE, select the intended reporting period, review the saved draft for that period, and submit by Friday at 12 PM Eastern.",
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
    graphicSrc: "/brand/the-bee-suite/sop-graphics/2026-07-27-v2/director-desktop-operations-guide.png",
    graphicAlt: "Current director desktop daily reports and billing operations guide",
    screenshots: [
      {
        src: "/brand/the-bee-suite/screenshots/2026-07-27-light/director-desktop-reports-light.png",
        alt: "Director daily reports workspace shown at a desktop viewport",
        label: "Daily reports",
        device: "Desktop",
      },
      {
        src: "/brand/the-bee-suite/screenshots/2026-07-27-light/director-desktop-billing-light.png",
        alt: "Director billing and invoice workspace shown at a desktop viewport",
        label: "Billing and invoices",
        device: "Desktop",
      },
    ],
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
    graphicSrc: "/brand/the-bee-suite/sop-graphics/2026-07-27-v2/teacher-classroom-device-guide.png",
    graphicAlt: "Current teacher classroom guide using iPad for daily reports and desktop for roster review",
    screenshots: [
      {
        src: "/brand/the-bee-suite/screenshots/2026-07-27-light/teacher-ipad-roster-light.png",
        alt: "Teacher classroom workspace shown at an iPad viewport",
        label: "Classroom workspace",
        device: "iPad",
      },
      {
        src: "/brand/the-bee-suite/screenshots/2026-07-27-light/teacher-ipad-daily-report-light.png",
        alt: "Teacher daily report workflow shown at an iPad viewport",
        label: "Daily reports",
        device: "iPad",
      },
      {
        src: "/brand/the-bee-suite/screenshots/2026-07-27-light/teacher-desktop-roster-light.png",
        alt: "Teacher classroom workspace shown at a desktop viewport",
        label: "Desktop workspace",
        device: "Desktop",
      },
    ],
    icon: GraduationCap,
    steps: [
      "Log in on the assigned classroom device only.",
      "Confirm the roster and mark attendance as children arrive and leave using the school-local time shown.",
      "Record meals, naps, activities, supplies, notes, and incidents according to school policy.",
      "Upload classroom photos only when allowed by the school and child permissions.",
      "Confirm the saved or unsaved state before leaving a record. If the device was offline, wait for sync and do not repeat the action.",
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
    graphicSrc: "/brand/the-bee-suite/explainers/bee-suite-weekly-tuition-flow-2026-07-27-v3.png",
    graphicAlt: "Current school-scoped weekly tuition, Thursday invoicing, autopay, and reconciliation flow",
    icon: CreditCard,
    steps: [
      "Review school-scoped tuition plans, assigned child rates, discounts, balances, credits, failed payments, and upcoming autopay runs.",
      "Confirm the Thursday schedule will create the following week's tuition invoice once and use the assigned child's canonical billing rate.",
      "Confirm family payment methods belong to the correct account; the parent flow presents card first while secure bank choices remain available.",
      "For an in-person card payment, use the school's connected Terminal location and network reader only while the parent is present.",
      "Reconcile invoices, Stripe events, ledger entries, and payout destination. Document exceptions, reversals, credits, and parent conversations.",
      "Escalate duplicate charges, reader mismatches, disputes, suspected fraud, custody-related billing questions, and policy decisions.",
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
    graphicSrc: "/brand/the-bee-suite/explainers/bee-suite-kiosk-pickup-flow-2026-07-27-v3.png",
    graphicAlt: "Current kiosk location, device, identity, event, release, and exception flow",
    icon: DoorOpen,
    steps: [
      "Use the kiosk only after the school has a separate dated kiosk/PIN approval.",
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

function ScreenshotGallery({ guide }: { guide: ResourceGuide }) {
  if (!guide.screenshots?.length) return null;
  const galleryClass =
    guide.screenshots.length === 1
      ? "grid-cols-1"
      : guide.screenshots.length === 2
        ? "sm:grid-cols-2"
        : "sm:grid-cols-2 lg:grid-cols-3";

  return (
    <div className="mt-6 rounded-lg border border-white/10 bg-[#05070a]/65 p-4">
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-400">Screens</h3>
        <p className="mt-2 text-sm leading-6 text-slate-300">Tap a screen to open the full view.</p>
      </div>

      <div className={`mt-4 grid items-start gap-4 ${galleryClass}`}>
        {guide.screenshots.map((screenshot) => {
          const frameClass =
            screenshot.device === "iPhone"
              ? "aspect-[9/16]"
              : screenshot.device === "iPad"
                ? "aspect-[3/4]"
                : "aspect-[16/10]";

          return (
            <Link
              key={`${screenshot.device}-${screenshot.label}`}
              href={screenshot.src}
              target="_blank"
              rel="noreferrer"
              prefetch={false}
              className={`group w-full overflow-hidden rounded-lg border border-white/10 bg-white/[0.04] transition hover:border-amber-300/60 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-amber-300/40 ${
                guide.screenshots?.length === 1 && screenshot.device === "iPhone" ? "mx-auto max-w-sm" : ""
              }`}
            >
              <div className={`relative overflow-hidden bg-[#0b1017] ${frameClass}`}>
                <Image
                  src={screenshot.src}
                  alt={screenshot.alt}
                  fill
                  sizes="(max-width: 639px) 100vw, (max-width: 1023px) 50vw, 33vw"
                  className="object-contain object-top transition duration-300 group-hover:scale-[1.01]"
                />
              </div>
              <div className="flex items-center justify-between gap-3 p-3">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-200">{screenshot.device}</div>
                  <div className="mt-1 text-sm font-semibold text-white">{screenshot.label}</div>
                </div>
                <ArrowRight className="size-4 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-amber-200" />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function GuideSection({ guide }: { guide: ResourceGuide }) {
  return (
    <section id={guide.id} className="scroll-mt-24 rounded-lg border border-white/10 bg-white/[0.055] p-5 shadow-2xl shadow-black/20 md:p-6">
      <div>
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
      </div>

      <div className="mt-6">
        <VisualFlow guide={guide} />
      </div>

      <figure className="mt-6 overflow-hidden rounded-lg border border-white/10 bg-[#f7f4ed]">
        <Image
          src={guide.graphicSrc}
          alt={guide.graphicAlt}
          width={1600}
          height={1000}
          className="h-auto w-full"
        />
      </figure>

      <ScreenshotGallery guide={guide} />

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
                Updated July 27, 2026. Use these guides for secure parent access, card and bank payments, independent school launch gates, daily operations, classroom workflows, billing, kiosk pickup, FTE reporting, and support escalation.
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
