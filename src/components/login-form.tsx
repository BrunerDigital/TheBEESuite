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
import { safeLoginNextPath } from "@/lib/login-routing";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeLoginNextPath(searchParams.get("next"));
  const parentPortalFlow = next.startsWith("/parent-portal");
  const parentSetupFlow = next === "/parent-portal/setup";
  const resetStatus = searchParams.get("reset");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const heroItems = parentPortalFlow ? ["Child updates", "Messages", "Check-in PIN"] : ["CRM", "Tours", "Parent portal"];

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    startTransition(async () => {
      const deviceLabel = window.localStorage.getItem("bee-suite-device-label") ?? "";
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, next, appMode: appModeFromPath(next), deviceLabel }),
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
    });
  }

  return (
    <div className="grid min-h-screen bg-slate-950 p-4 text-white lg:grid-cols-[1fr_0.86fr]">
      <section className="hidden min-h-[calc(100vh-2rem)] flex-col justify-between rounded-2xl border border-white/10 bg-[linear-gradient(145deg,#020617,#172033_58%,#3b2a09)] p-8 lg:flex">
        <BrandLogo href="/" size="md" compact={parentSetupFlow} priority />
        <div className="max-w-xl">
          <h1 className="text-5xl font-semibold leading-tight tracking-normal">
            {parentPortalFlow ? "Welcome to your family portal." : "Welcome back to your childcare command center."}
          </h1>
          <p className="mt-5 text-base leading-7 text-slate-300">
            {parentPortalFlow
              ? "Use the personal email your school has on file and the default password BusyBees, then finish parent setup for child updates, messages, and check-in access."
              : "Directors, teachers, billing users, and parents all sign in here. Parents use the personal email on their profile and BusyBees unless they already changed their password."}
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
          {parentPortalFlow
            ? "Your family portal only shows the child, message, document, billing, and check-in items linked to your account."
            : "AI suggestions, sensitive records, and school-level data remain role-scoped."}
        </div>
      </section>

      <section className="grid place-items-center px-0 py-6 sm:px-6 lg:px-10">
        <Card className="w-full max-w-xl rounded-2xl border-white/10 bg-white text-slate-950 shadow-2xl shadow-black/30">
          <CardHeader className="text-center">
            <Link href="/" className="mx-auto block w-fit lg:hidden" aria-label="The BEE Suite home">
              <BrandIcon className="size-14 rounded-2xl" priority />
            </Link>
            <CardTitle className="mt-4 text-3xl">{parentPortalFlow ? "Log in to your parent portal" : "Log in to The BEE Suite"}</CardTitle>
            <CardDescription>
              {parentPortalFlow
                ? "Use the parent or guardian email on file. The default password is BusyBees unless you changed it."
                : "Existing users can access the live workspace. Parents and guardians can use this same screen for the parent portal."}
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
                <Label htmlFor="email">{parentPortalFlow ? "Parent login email" : "Email or username"}</Label>
                <Input
                  id="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder={parentPortalFlow ? "parent@example.com" : "Email or username"}
                  type="text"
                  autoComplete="username"
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="password">Password</Label>
                  <Link
                    href={parentPortalFlow ? `/forgot-password?next=${encodeURIComponent(next)}` : "/forgot-password"}
                    className="text-xs font-semibold text-slate-600 hover:text-slate-950 hover:underline"
                  >
                    Forgot password?
                  </Link>
                </div>
                <Input
                  id="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={parentPortalFlow ? "BusyBees" : "Password"}
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </div>
              <button className={buttonVariants({ size: "lg" })} type="submit" disabled={isPending}>
                {isPending ? "Signing in..." : "Sign in"}
                <LogIn data-icon="inline-end" />
              </button>
            </form>
            {parentPortalFlow ? (
              <div className="mt-5 rounded-lg border bg-slate-50 p-4 text-sm leading-6 text-slate-600">
                Use the personal parent or guardian email your school has on file and the default password BusyBees. You can change
                the password later from Profile Settings in the parent portal.
              </div>
            ) : (
              <div className="mt-5 grid gap-3">
                <div className="rounded-lg border bg-slate-50 p-4 text-sm leading-6 text-slate-600">
                  Parents and guardians can sign in here with their personal email and BusyBees unless they already changed their
                  password.{" "}
                  <Link href="/login?next=/parent-portal" className="inline-flex items-center font-semibold text-slate-950 hover:underline">
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
