"use client";

import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { FormEvent, useState, useTransition } from "react";
import { AlertCircle, ArrowRight, CheckCircle2, LogIn, ShieldCheck } from "lucide-react";
import { BrandIcon, BrandLogo } from "@/components/brand-logo";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { appModeFromPath } from "@/lib/device-sessions";
import {
  defaultNextPathForLoginPortal,
  normalizeLoginPortal,
  safeLoginNextPath,
  type LoginPortal,
} from "@/lib/login-routing";

type LoginFormProps = {
  portal?: LoginPortal;
  defaultNextPath?: string;
};

const loginCopy: Record<LoginPortal, {
  heroTitle: string;
  heroBody: string;
  heroFooter: string;
  heroItems: string[];
  cardTitle: string;
  cardDescription: string;
  emailLabel: string;
  emailPlaceholder: string;
  passwordPlaceholder: string;
  helpText: string;
}> = {
  general: {
    heroTitle: "Choose the right BEE Suite portal.",
    heroBody: "Use the role-specific login page for your daily workspace. Each entry keeps the first screen focused on the tools that match your account.",
    heroFooter: "Access is still verified after sign-in, so users only reach the data their role allows.",
    heroItems: ["Directors", "Teachers", "Parents"],
    cardTitle: "Log in to The BEE Suite",
    cardDescription: "Use the portal link your school or organization gave you, or sign in here if you are not sure.",
    emailLabel: "Email or username",
    emailPlaceholder: "Email or username",
    passwordPlaceholder: "Password",
    helpText: "After sign-in, The BEE Suite will route your account to the correct portal automatically.",
  },
  parents: {
    heroTitle: "Welcome to your family portal.",
    heroBody: "Use the personal parent or guardian email your school has on file. Your child records, balances, messages, documents, and check-in access stay linked in the existing parent portal.",
    heroFooter: "Family data remains connected to the school records already assigned to your account.",
    heroItems: ["Child updates", "Messages", "Tuition"],
    cardTitle: "Log in to your parent portal",
    cardDescription: "Use the parent or guardian email on file. The default password is BusyBees unless you changed it.",
    emailLabel: "Parent login email",
    emailPlaceholder: "parent@example.com",
    passwordPlaceholder: "BusyBees",
    helpText: "Use the personal parent or guardian email your school has on file and the default password BusyBees. You can change the password later from Profile Settings in the parent portal.",
  },
  teachers: {
    heroTitle: "Open your teacher workspace.",
    heroBody: "Sign in to classroom tools for attendance, daily reports, incident notes, family messages, documents, and teacher tasks.",
    heroFooter: "Teacher accounts stay focused on classroom workflows and assigned school records.",
    heroItems: ["Roster", "Reports", "Messages"],
    cardTitle: "Log in to your teacher portal",
    cardDescription: "Use the teacher username or email assigned by your school.",
    emailLabel: "Teacher email or username",
    emailPlaceholder: "teacher@school.com",
    passwordPlaceholder: "Password",
    helpText: "Teachers are routed to the classroom-safe portal after sign-in. Director-only and billing tools stay out of the teacher landing flow.",
  },
  directors: {
    heroTitle: "Open your director workspace.",
    heroBody: "Sign in to school operations for enrollment, staffing, classrooms, billing, FTE, compliance, messages, and parent support.",
    heroFooter: "Director access stays scoped to assigned schools and approved workflows.",
    heroItems: ["Enrollment", "Billing", "Operations"],
    cardTitle: "Log in as a director",
    cardDescription: "Use your school leadership or billing account.",
    emailLabel: "Director email or username",
    emailPlaceholder: "director@school.com",
    passwordPlaceholder: "Password",
    helpText: "Directors and school billing users land in the operations workspace after sign-in.",
  },
  executives: {
    heroTitle: "Open your executive workspace.",
    heroBody: "Sign in to corporate office reporting, multi-location visibility, FTE review, account setup, billing oversight, integrations, and executive controls.",
    heroFooter: "Executive tools stay separated from school-level landing flows while preserving tenant-wide access.",
    heroItems: ["Multi-location", "FTE", "Controls"],
    cardTitle: "Log in as an executive",
    cardDescription: "Use your corporate office or platform account.",
    emailLabel: "Executive email or username",
    emailPlaceholder: "executive@company.com",
    passwordPlaceholder: "Password",
    helpText: "Executive users land in the corporate workspace after sign-in. School-only users are routed back to their own portal.",
  },
};

export function LoginForm({ portal: portalInput = "general", defaultNextPath }: LoginFormProps = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const portal = normalizeLoginPortal(portalInput);
  const copy = loginCopy[portal];
  const next = safeLoginNextPath(searchParams.get("next"), defaultNextPath ?? defaultNextPathForLoginPortal(portal));
  const parentPortalFlow = portal === "parents" || next.startsWith("/parent-portal");
  const parentSetupFlow = next === "/parent-portal/setup";
  const resetStatus = searchParams.get("reset");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const heroItems = copy.heroItems;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    startTransition(async () => {
      try {
        const deviceLabel = window.localStorage.getItem("bee-suite-device-label") ?? "";
        const response = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, next, loginPortal: portal, appMode: appModeFromPath(next), deviceLabel }),
        });

        const data = (await response.json().catch(() => null)) as { error?: string; requiresPasswordReset?: boolean; nextPath?: string } | null;
        if (!response.ok) {
          setError(data?.error ?? "Unable to sign in.");
          return;
        }

        const destination = safeLoginNextPath(data?.nextPath ?? next);
        if (data?.requiresPasswordReset) {
          router.push(`/reset-password?force=1&next=${encodeURIComponent(destination)}`);
          router.refresh();
          return;
        }

        router.push(destination);
        router.refresh();
      } catch {
        setError("We could not reach the sign-in service. Check your connection and try again.");
      }
    });
  }

  return (
    <div className="grid min-h-screen bg-slate-950 p-4 text-white xl:grid-cols-[1fr_0.86fr]">
      <section className="hidden min-h-[calc(100vh-2rem)] flex-col justify-between rounded-2xl border border-white/10 bg-[linear-gradient(145deg,#020617,#172033_58%,#3b2a09)] p-8 xl:flex">
        <BrandLogo href="/" size="md" compact={parentSetupFlow} priority />
        <div className="max-w-xl">
          <h1 className="text-5xl font-semibold leading-tight tracking-normal">
            {copy.heroTitle}
          </h1>
          <p className="mt-5 text-base leading-7 text-slate-300">
            {copy.heroBody}
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {heroItems.map((label) => (
              <div key={label} className="rounded-lg border border-white/10 bg-white/[0.04] p-3 text-sm font-medium">
                {label}
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-300">
          <ShieldCheck className="size-4 text-primary" />
          {copy.heroFooter}
        </div>
      </section>

      <section className="grid place-items-center px-0 py-6 sm:px-6 xl:px-10">
        <Card className="w-full max-w-xl rounded-2xl border-white/10 bg-white text-slate-950 shadow-2xl shadow-black/30">
          <CardHeader className="text-center">
            <Link href="/" className="mx-auto block w-fit xl:hidden" aria-label="The BEE Suite home">
              <BrandIcon className="size-14 rounded-2xl" priority />
            </Link>
            <CardTitle className="mt-4 text-3xl">{copy.cardTitle}</CardTitle>
            <CardDescription>
              {copy.cardDescription}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="flex flex-col gap-4" onSubmit={submit}>
              {resetStatus === "complete" ? (
                <Alert className="border-emerald-500/30 bg-emerald-500/10">
                  <CheckCircle2 />
                  <AlertTitle>Password updated</AlertTitle>
                  <AlertDescription>Sign in with your new password.</AlertDescription>
                </Alert>
              ) : null}
              {resetStatus === "required" ? (
                <Alert className="border-amber-500/30 bg-amber-500/10">
                  <ShieldCheck />
                  <AlertTitle>Password reset required</AlertTitle>
                  <AlertDescription>
                    {parentPortalFlow
                      ? "Use your current password one more time, then choose a private parent portal password."
                      : "Use your password one more time, then choose a new private password."}
                  </AlertDescription>
                </Alert>
              ) : null}
              {error ? (
                <Alert variant="destructive">
                  <AlertCircle />
                  <AlertTitle>Login failed</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}
              <div className="flex flex-col gap-2">
                <Label htmlFor="email">{copy.emailLabel}</Label>
                <Input
                  id="email"
                  className="h-11"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder={copy.emailPlaceholder}
                  type="text"
                  autoComplete="username"
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="password">Password</Label>
                  <Link
                    href={`/forgot-password?next=${encodeURIComponent(next)}`}
                    className="text-xs font-semibold text-slate-600 hover:text-slate-950 hover:underline"
                  >
                    Forgot password?
                  </Link>
                </div>
                <Input
                  id="password"
                  className="h-11"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={copy.passwordPlaceholder}
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </div>
              <button className={buttonVariants({ size: "lg", className: "h-11" })} type="submit" disabled={isPending}>
                {isPending ? "Signing in..." : "Sign in"}
                <LogIn data-icon="inline-end" />
              </button>
            </form>
            {portal !== "general" ? (
              <div className="mt-5 rounded-lg border bg-slate-50 p-4 text-sm leading-6 text-slate-600">
                {copy.helpText}
              </div>
            ) : (
              <div className="mt-5 grid gap-3">
                <div className="rounded-lg border bg-slate-50 p-4 text-sm leading-6 text-slate-600">
                  Parents and guardians can sign in here with their personal email and BusyBees unless they already changed their
                  password.{" "}
                  <Link href="/parents" className="inline-flex items-center font-semibold text-slate-950 hover:underline">
                    Open parent portal login <ArrowRight className="ml-1 size-3.5" />
                  </Link>
                </div>
                <div className="rounded-lg border bg-slate-50 p-4 text-sm leading-6 text-slate-600">
                  New to The BEE Suite?{" "}
                  <Link href="/onboarding" className="inline-flex items-center font-semibold text-slate-950 hover:underline">
                    Start onboarding <ArrowRight className="ml-1 size-3.5" />
                  </Link>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
