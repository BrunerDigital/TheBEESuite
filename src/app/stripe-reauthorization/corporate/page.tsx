import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowRight, Building2, CheckCircle2, CircleDashed, Landmark, ShieldCheck } from "lucide-react";
import { canAccessCenter, canManageBilling, canManageOperations, getCurrentUser, requiresPasswordResetGate } from "@/lib/auth";
import { loginHrefForNextPath } from "@/lib/login-routing";
import { prisma } from "@/lib/prisma";
import { readStripeConnectMigration, type StripeConnectMigrationStatus } from "@/lib/stripe-connect-migration";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Corporate Stripe Reauthorization | The BEE Suite",
  description: "Complete Stripe reauthorization for the Kid City USA corporate school portfolio.",
};

const CORPORATE_PORTFOLIO_PATH = "/stripe-reauthorization/corporate";
const CORPORATE_SCHOOLS_EMAIL = "corpschools@kidcityusa.com";
const inactiveCenterStatuses = ["closed", "archived", "inactive"];
const completedStatuses = new Set<StripeConnectMigrationStatus>(["ready_for_cutover", "cutover_complete"]);

function statusContent(status: StripeConnectMigrationStatus) {
  if (status === "cutover_complete") return { label: "Migration complete", tone: "text-emerald-700 bg-emerald-50 border-emerald-200" };
  if (status === "ready_for_cutover") return { label: "Authorization complete", tone: "text-emerald-700 bg-emerald-50 border-emerald-200" };
  if (status === "balance_authorization_required") return { label: "Monthly fee authorization remaining", tone: "text-amber-800 bg-amber-50 border-amber-200" };
  if (status === "requirements_due") return { label: "Stripe needs more information", tone: "text-amber-800 bg-amber-50 border-amber-200" };
  if (status === "onboarding_opened") return { label: "Setup started", tone: "text-blue-700 bg-blue-50 border-blue-200" };
  if (status === "prepared") return { label: "Ready to begin", tone: "text-slate-700 bg-slate-50 border-slate-200" };
  return { label: "No reauthorization step", tone: "text-slate-500 bg-slate-50 border-slate-200" };
}

export default async function CorporateStripeReauthorizationPage() {
  const user = await getCurrentUser({ allowPasswordResetRequired: true });
  if (!user) redirect(loginHrefForNextPath(CORPORATE_PORTFOLIO_PATH));
  if (requiresPasswordResetGate(user)) redirect(`/reset-password?force=1&next=${encodeURIComponent(CORPORATE_PORTFOLIO_PATH)}`);
  if (!canManageBilling(user) && !canManageOperations(user)) notFound();

  const now = new Date();
  const portfolio = await prisma.user.findFirst({
    where: { email: CORPORATE_SCHOOLS_EMAIL, tenantId: user.tenantId, isActive: true },
    select: {
      accessGrants: {
        where: {
          isActive: true,
          scopeType: "CENTER",
          centerId: { not: null },
          OR: [{ startsAt: null }, { startsAt: { lte: now } }],
          AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: now } }] }],
        },
        select: { centerId: true },
      },
    },
  });
  if (!portfolio) notFound();

  const portfolioCenterIds = Array.from(new Set(
    portfolio.accessGrants
      .map((grant) => grant.centerId)
      .filter((centerId): centerId is string => Boolean(centerId && canAccessCenter(user, centerId))),
  ));
  if (!portfolioCenterIds.length) notFound();

  const centers = await prisma.center.findMany({
    where: {
      id: { in: portfolioCenterIds },
      organization: { tenantId: user.tenantId },
      status: { notIn: inactiveCenterStatuses },
    },
    orderBy: [{ state: "asc" }, { city: "asc" }, { name: "asc" }],
    select: { id: true, name: true, city: true, state: true, customFields: true },
  });
  const rows = centers.map((center) => ({ ...center, migration: readStripeConnectMigration(center.customFields) }));
  const preparedRows = rows.filter((row) => row.migration.sourceAccountId && row.migration.targetAccountId);
  const completeRows = preparedRows.filter((row) => completedStatuses.has(row.migration.status));
  const pendingRows = preparedRows.filter((row) => !completedStatuses.has(row.migration.status));
  const nextSchool = pendingRows[0] ?? null;
  const unpreparedCount = rows.length - preparedRows.length;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(244,196,48,0.22),_transparent_34%),linear-gradient(145deg,#07101f,#111827_54%,#172033)] px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-6xl">
        <Image src="/brand/the-bee-suite/logo-primary-horizontal-white.png" alt="The BEE Suite" width={260} height={76} priority className="h-auto w-56 sm:w-64" />

        <section className="mt-10 text-white">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-amber-200">
            <ShieldCheck className="size-4" /> Secure corporate portfolio
          </div>
          <h1 className="mt-5 max-w-4xl text-4xl font-semibold tracking-tight sm:text-5xl">Complete Stripe reauthorization for corporate schools</h1>
          <p className="mt-5 max-w-3xl text-base leading-7 text-slate-200 sm:text-lg">
            Use this single progress page to complete each school&apos;s separate legal business, tax, representative, and payout authorization. Stripe keeps every EIN and bank account attached only to its matching school.
          </p>
        </section>

        <section className="mt-8 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/10 p-5 text-white backdrop-blur">
            <div className="text-3xl font-semibold">{preparedRows.length}</div>
            <div className="mt-1 text-sm text-slate-300">Schools in this reauthorization wave</div>
          </div>
          <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/10 p-5 text-white backdrop-blur">
            <div className="text-3xl font-semibold">{completeRows.length}</div>
            <div className="mt-1 text-sm text-emerald-100">Completed</div>
          </div>
          <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 p-5 text-white backdrop-blur">
            <div className="text-3xl font-semibold">{pendingRows.length}</div>
            <div className="mt-1 text-sm text-amber-100">Remaining</div>
          </div>
        </section>

        <section className="mt-6 rounded-3xl border border-white/10 bg-white p-5 shadow-2xl sm:p-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Corporate school progress</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                Each secure Stripe form is generated only when you select a school. Temporary Stripe links are never stored in this page or sent by email.
              </p>
            </div>
            {nextSchool ? (
              <Link
                href={`/stripe-reauthorization?center=${encodeURIComponent(nextSchool.id)}&portfolio=corporate`}
                className={buttonVariants({ size: "lg", className: "h-11 px-5" })}
              >
                Continue next school <ArrowRight data-icon="inline-end" />
              </Link>
            ) : preparedRows.length ? (
              <div className="inline-flex items-center gap-2 font-semibold text-emerald-700"><CheckCircle2 className="size-5" /> All prepared schools complete</div>
            ) : null}
          </div>

          <div className="mt-7 divide-y rounded-2xl border">
            {rows.map((row) => {
              const status = statusContent(row.migration.status);
              const actionable = Boolean(row.migration.sourceAccountId && row.migration.targetAccountId && !completedStatuses.has(row.migration.status));
              return (
                <div key={row.id} className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="mt-0.5 rounded-xl bg-slate-100 p-2 text-slate-700">
                      {completedStatuses.has(row.migration.status) ? <CheckCircle2 className="size-5 text-emerald-600" /> : row.migration.status === "not_needed" ? <Landmark className="size-5" /> : <Building2 className="size-5" />}
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-950">{row.name}</div>
                      <div className="mt-1 text-sm text-slate-500">{[row.city, row.state].filter(Boolean).join(", ")}</div>
                    </div>
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold", status.tone)}>
                      {completedStatuses.has(row.migration.status) ? <CheckCircle2 className="size-3.5" /> : <CircleDashed className="size-3.5" />}
                      {status.label}
                    </span>
                    {actionable ? (
                      <Link
                        href={`/stripe-reauthorization?center=${encodeURIComponent(row.id)}&portfolio=corporate`}
                        className={buttonVariants({ variant: "outline", size: "sm" })}
                      >
                        Open school <ArrowRight data-icon="inline-end" />
                      </Link>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>

          {unpreparedCount ? (
            <p className="mt-5 text-sm leading-6 text-slate-500">
              {unpreparedCount} corporate location {unpreparedCount === 1 ? "does" : "do"} not currently require a prepared reauthorization step.
            </p>
          ) : null}
        </section>

        <p className="mt-5 px-2 text-xs leading-5 text-slate-400">
          Parent payments remain on each school&apos;s existing account until a separately controlled cutover. Opening this page does not change a payout bank, create a charge, or move funds.
        </p>
      </div>
    </main>
  );
}
