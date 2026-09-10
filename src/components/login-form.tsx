"use client";

import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { FormEvent, useState, useTransition } from "react";
import { AlertCircle, ArrowRight, CheckCircle2, LogIn, ShieldCheck } from "lucide-react";
import { BrandIcon, BrandLogo } from "@/components/brand-logo";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
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
    heroTitle: "One suite, a clear workspace for every role",
    heroBody: "Choose the sign-in page that matches the work you do. Your role and assigned locations determine what opens after sign-in.",
    heroFooter: "After sign-in, your account opens only the information and tools assigned to you.",
    heroItems: ["Company & regional", "School & billing", "Classroom & family"],
    cardTitle: "Sign in to The BEE Suite",
    cardDescription: "Use the sign-in link your school or organization gave you. If you are not sure which page to use, you can sign in here.",
    emailLabel: "Email or username",
    emailPlaceholder: "Email or username",
    passwordPlaceholder: "Password",
    helpText: "After sign-in, you will go to the workspace assigned to your account.",
  },
  parents: {
    heroTitle: "Your family’s Parent Portal",
    heroBody: "Sign in with the parent or guardian email your school invited. You will see only the children and family records connected to your account.",
    heroFooter: "Your school controls which family records are connected to your account.",
    heroItems: ["Updates", "Messages", "Documents & Billing"],
    cardTitle: "Parent and guardian sign-in",
    cardDescription: "Use the email and password from your school invitation. If you already changed that password, use your current one.",
    emailLabel: "Parent or guardian email",
    emailPlaceholder: "parent@example.com",
    passwordPlaceholder: "Your password",
    helpText: "First time here? Use the password in your school invitation. If you do not have it, choose Forgot password.",
  },
  teachers: {
    heroTitle: "Your teacher workspace",
    heroBody: "Sign in to classroom tools for attendance, daily reports, incident notes, family messages, documents, and teacher tasks.",
    heroFooter: "Your account shows only the school and classroom records assigned to you.",
    heroItems: ["Roster", "Reports", "Messages"],
    cardTitle: "Teacher sign-in",
    cardDescription: "Use the teacher username or email assigned by your school.",
    emailLabel: "Teacher email or username",
    emailPlaceholder: "teacher@school.com",
    passwordPlaceholder: "Password",
    helpText: "After signing in, you will go to your assigned classroom workspace.",
  },
  directors: {
    heroTitle: "Your director workspace",
    heroBody: "Sign in to school operations for enrollment, staffing, classrooms, billing, FTE, compliance, messages, and parent support.",
    heroFooter: "Your account shows only the schools assigned to you.",
    heroItems: ["Enrollment", "Billing", "Operations"],
    cardTitle: "Director sign-in",
    cardDescription: "Use your school leadership or billing account.",
    emailLabel: "Director email or username",
    emailPlaceholder: "director@school.com",
    passwordPlaceholder: "Password",
    helpText: "Directors and school billing users land in the operations workspace after sign-in.",
  },
  executives: {
    heroTitle: "Your executive workspace",
    heroBody: "Sign in to corporate office reporting, multi-location visibility, FTE review, account setup, billing oversight, integrations, and executive controls.",
    heroFooter: "Executive sign-in is separate from school sign-in and only shows locations assigned to your account.",
    heroItems: ["Multi-location", "FTE", "Controls"],
    cardTitle: "Executive sign-in",
    cardDescription: "Use your corporate office or platform account.",
    emailLabel: "Executive email or username",
    emailPlaceholder: "executive@company.com",
    passwordPlaceholder: "Password",
    helpText: "Executive users land in the corporate workspace after sign-in. School-only users are routed back to their own portal.",
  },
};

const rolePortalLinks = [
  { href: "/executives", title: "Company and regional", roles: "Platform owners, brand admins, regional managers, and read-only auditors" },
  { href: "/directors", title: "School leadership and billing", roles: "Directors, assistant directors, and billing administrators" },
  { href: "/teachers", title: "Teachers", roles: "Classroom staff and daily care workflows" },
  { href: "/parents", title: "Families and pickup", roles: "Parents, guardians, and authorized pickup users" },
] as const;

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
    <main className="auth-halo-shell grid min-h-screen min-h-dvh bg-slate-950 p-4 pt-[max(1rem,env(safe-area-inset-top))] pr-[max(1rem,env(safe-area-inset-right))] pb-[max(1rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] text-white xl:grid-cols-[1fr_0.86fr]" data-portal={portal}>
      <section className="auth-halo-story hidden min-h-[calc(100dvh-2rem)] flex-col justify-between rounded-2xl border border-white/10 bg-[linear-gradient(145deg,#020617,#172033_58%,#3b2a09)] p-8 xl:flex">
        <BrandLogo href="/" size="md" compact={parentSetupFlow} priority prefetch={false} />
        <div className="max-w-xl">
          <div className="text-5xl font-semibold leading-tight tracking-normal" aria-hidden="true">
            {copy.heroTitle}
          </div>
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
        <Card className="auth-halo-card w-full max-w-xl rounded-2xl border-white/10 bg-white text-slate-950 shadow-2xl shadow-black/30">
          <CardHeader className="text-center">
            <Link href="/" prefetch={false} className="mx-auto block w-fit xl:hidden" aria-label="The BEE Suite home">
              <BrandIcon className="size-14 rounded-2xl" priority />
            </Link>
            <h1 className="mt-4 text-balance text-3xl font-semibold">{copy.cardTitle}</h1>
            <CardDescription id="login-description">
              {copy.cardDescription}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col">
            {portal === "general" ? (
              <nav aria-label="Choose a role-specific sign-in page" className="order-2 mt-5 grid gap-2 sm:order-1 sm:mt-0 sm:mb-5 sm:grid-cols-2">
                {rolePortalLinks.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch={false}
                    className="group flex min-h-20 items-start justify-between gap-3 rounded-lg border bg-slate-50 p-3 text-left transition-colors motion-reduce:transition-none hover:border-amber-400 hover:bg-amber-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                  >
                    <span>
                      <span className="block text-sm font-semibold text-slate-950">{item.title}</span>
                      <span className="mt-1 block text-xs leading-5 text-slate-600">{item.roles}</span>
                    </span>
                    <ArrowRight className="mt-0.5 size-4 shrink-0 text-slate-500 transition-transform motion-reduce:transition-none group-hover:translate-x-0.5 motion-reduce:transform-none" aria-hidden="true" />
                  </Link>
                ))}
              </nav>
            ) : null}
            <form className="order-1 flex flex-col gap-4 sm:order-2" onSubmit={submit} aria-busy={isPending} aria-describedby="login-description">
              {resetStatus === "complete" ? (
                <Alert role="status" className="border-emerald-500/30 bg-emerald-500/10">
                  <CheckCircle2 />
                  <AlertTitle>Password updated</AlertTitle>
                  <AlertDescription>Sign in with your new password.</AlertDescription>
                </Alert>
              ) : null}
              {resetStatus === "required" ? (
                <Alert role="status" className="border-amber-500/30 bg-amber-500/10">
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
                  name="email"
                  className="h-11"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder={copy.emailPlaceholder}
                  type={portal === "parents" ? "email" : "text"}
                  inputMode={portal === "parents" ? "email" : undefined}
                  autoComplete="username"
                  spellCheck={false}
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="password">Password</Label>
                  <Link
                    href={`/forgot-password?next=${encodeURIComponent(next)}`}
                    prefetch={false}
                    className="inline-flex min-h-11 items-center text-xs font-semibold text-slate-600 hover:text-slate-950 hover:underline"
                  >
                    Forgot password?
                  </Link>
                </div>
                <Input
                  id="password"
                  name="password"
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
                {isPending ? "Signing in…" : "Sign in"}
                <LogIn data-icon="inline-end" />
              </button>
            </form>
            {portal !== "general" ? (
              <div className="order-3 mt-5 rounded-lg border bg-slate-50 p-4 text-sm leading-6 text-slate-600">
                {copy.helpText}
              </div>
            ) : (
              <div className="order-3 mt-5 grid gap-3">
                <div className="rounded-lg border bg-slate-50 p-4 text-sm leading-6 text-slate-600">
                  Not sure which role you have? Use the sign-in link in your invitation or ask your school or company administrator. Support can also help route you without changing your access.
                </div>
                <div className="rounded-lg border bg-slate-50 p-4 text-sm leading-6 text-slate-600">
                  New to The BEE Suite?{" "}
                  <Link href="/onboarding" prefetch={false} className="inline-flex items-center font-semibold text-slate-950 hover:underline">
                    Start onboarding <ArrowRight className="ml-1 size-3.5" />
                  </Link>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
