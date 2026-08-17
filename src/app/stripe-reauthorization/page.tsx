import type { Metadata } from "next";
import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import { BadgeCheck, Building2, Landmark, ShieldCheck } from "lucide-react";
import { CorporateStripeVerificationCard } from "@/components/corporate-stripe-verification-card";
import { StripeReauthorizationCard } from "@/components/stripe-reauthorization-card";
import { canAccessCenter, canManageBilling, canManageOperations, getCurrentUser, requiresPasswordResetGate } from "@/lib/auth";
import {
  authorizeCorporateStripeVerificationCenter,
  corporateStripePayoutBankIsConfirmed,
  corporateStripeVerificationBindingIsValid,
  readCorporateStripeVerificationTarget,
  stripeVerificationState,
} from "@/lib/corporate-stripe-verification";
import {
  listStripeConnectedAccountPayoutBanks,
  readStripeConnectedAccountId,
  retrieveStripeConnectedAccount,
} from "@/lib/integrations";
import { loginHrefForNextPath } from "@/lib/login-routing";
import { prisma } from "@/lib/prisma";
import { readStripeConnectMigration } from "@/lib/stripe-connect-migration";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Finish School Stripe Setup | The BEE Suite",
  description: "Securely finish an existing school's Stripe business and payout setup.",
};

export default async function StripeReauthorizationPage({
  searchParams,
}: {
  searchParams: Promise<{ center?: string; stripeMigration?: string; portfolio?: string; start?: string }>;
}) {
  const params = await searchParams;
  const centerId = typeof params.center === "string" ? params.center : "";
  const returnToCorporatePortfolio = params.portfolio === "corporate";
  const corporateVerification = Boolean(centerId && readCorporateStripeVerificationTarget(centerId));
  const autoStart = corporateVerification && params.start === "1";
  const nextPath = centerId
    ? `/stripe-reauthorization?center=${encodeURIComponent(centerId)}${returnToCorporatePortfolio ? "&portfolio=corporate" : ""}${autoStart ? "&start=1" : ""}`
    : "/stripe-reauthorization";
  const user = await getCurrentUser({ allowPasswordResetRequired: true });
  if (!user) redirect(loginHrefForNextPath(nextPath));
  if (requiresPasswordResetGate(user)) redirect(`/reset-password?force=1&next=${encodeURIComponent(nextPath)}`);
  if (!centerId) notFound();
  const center = await prisma.center.findUnique({
    where: { id: centerId },
    select: { id: true, name: true, email: true, city: true, state: true, customFields: true, organization: { select: { tenantId: true } } },
  });
  if (!center) notFound();
  if (corporateVerification) {
    const authorization = await authorizeCorporateStripeVerificationCenter({ user, center });
    if (!authorization.ok) notFound();
  } else if (!canAccessCenter(user, centerId) || (!canManageBilling(user) && !canManageOperations(user))) {
    notFound();
  }
  const migration = readStripeConnectMigration(center.customFields);
  if (!migration.targetAccountId || !migration.sourceAccountId) notFound();
  let initialStatus: string = migration.status;
  if (corporateVerification) {
    if (!corporateStripeVerificationBindingIsValid({
      activeAccountId: readStripeConnectedAccountId(center.customFields),
      sourceAccountId: migration.sourceAccountId,
      targetAccountId: migration.targetAccountId,
      cutoverAt: migration.cutoverAt,
    })) notFound();
    const [target, banks] = await Promise.all([
      retrieveStripeConnectedAccount(migration.targetAccountId, { tenantId: user.tenantId }),
      listStripeConnectedAccountPayoutBanks({ accountId: migration.targetAccountId, tenantId: user.tenantId }),
    ]);
    initialStatus = target.ok && target.account && banks.ok
      ? stripeVerificationState(target.account, corporateStripePayoutBankIsConfirmed(banks.banks))
      : "stripe_verification_error";
  }
  const featureCards = corporateVerification
    ? [
        [Building2, "Business details", "Confirm any business information Stripe still requires."],
        [BadgeCheck, "Authorized representative", "Review or complete the owner and representative verification."],
        [Landmark, "Payout destination", "Add or confirm the bank directly in Stripe."],
        [ShieldCheck, "Stripe terms", "Review and accept Stripe's terms yourself in the hosted flow."],
      ]
    : [
        [Building2, "Business details", "Confirm the legal business name and tax information."],
        [BadgeCheck, "Authorized representative", "Verify the person permitted to act for the school."],
        [Landmark, "Payout destination", "Provide or confirm the bank used for school payouts."],
        [ShieldCheck, "Terms of service", "Agree to the terms of service before opening Stripe's secure hosted flow."],
      ];

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(244,196,48,0.22),_transparent_34%),linear-gradient(145deg,#07101f,#111827_54%,#172033)] px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-5xl">
        <Image src="/brand/the-bee-suite/logo-primary-horizontal-white.png" alt="The BEE Suite" width={260} height={76} priority className="h-auto w-56 sm:w-64" />
        <div className="mt-10 grid gap-8 lg:grid-cols-[1.1fr_.9fr] lg:items-start">
          <section className="text-white">
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-amber-200">
              <ShieldCheck className="size-4" /> Secure account update
            </div>
            <h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
              {corporateVerification ? "Finish this school's existing Stripe account" : "Finish your school's existing Stripe account"}
            </h1>
            <p className="mt-5 max-w-3xl text-base leading-7 text-slate-200 sm:text-lg">
              {corporateVerification
                ? "This secure BEE Suite page checks the approved existing school account and opens its account-specific Stripe-hosted session for only the requirements that are currently due."
                : "The Stripe account has already been created for this school. Use the school's existing Stripe login, or create its Stripe login if a password was not set yet, to complete the remaining business and payout requirements."}
            </p>
            <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-300">
              Stripe securely verifies the business, authorized representative, and payout information. Program eligibility and funding approvals remain with the applicable school and government agency.
            </p>

            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              {featureCards.map(([Icon, title, description]) => (
                <div key={String(title)} className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
                  <Icon className="size-5 text-amber-300" />
                  <div className="mt-3 font-semibold">{String(title)}</div>
                  <div className="mt-1 text-sm leading-6 text-slate-300">{String(description)}</div>
                </div>
              ))}
            </div>

            <div className="mt-6 rounded-2xl border border-emerald-300/20 bg-emerald-300/10 p-4 text-sm leading-6 text-emerald-50">
              <strong>Parent payments remain available during this transition.</strong> Funds stay in the school&apos;s current Stripe account while the new setup is completed. Opening this page does not remove or modify the existing payout bank.
            </div>
          </section>

          <aside>
            {corporateVerification ? (
              <CorporateStripeVerificationCard
                centerId={center.id}
                schoolName={`${center.name}${center.city || center.state ? ` — ${[center.city, center.state].filter(Boolean).join(", ")}` : ""}`}
                schoolEmail={center.email}
                initialStatus={initialStatus}
                returning={params.stripeMigration === "return"}
                autoStart={autoStart}
              />
            ) : (
              <StripeReauthorizationCard
                centerId={center.id}
                schoolName={`${center.name}${center.city || center.state ? ` — ${[center.city, center.state].filter(Boolean).join(", ")}` : ""}`}
                schoolEmail={center.email}
                initialStatus={initialStatus}
                returning={params.stripeMigration === "return"}
                returnToCorporatePortfolio={returnToCorporatePortfolio}
              />
            )}
            <p className="mt-4 px-2 text-xs leading-5 text-slate-400">Full bank numbers, tax identifiers, identity details, and verification documents are entered only in Stripe&apos;s secure hosted flow and are not stored by The BEE Suite.</p>
          </aside>
        </div>
      </div>
    </main>
  );
}
