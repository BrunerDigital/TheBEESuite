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

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/dashboard";
  const resetStatus = searchParams.get("reset");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    startTransition(async () => {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "Unable to sign in.");
        return;
      }

      router.push(next.startsWith("/") ? next : "/dashboard");
      router.refresh();
    });
  }

  return (
    <div className="grid min-h-screen bg-slate-950 p-4 text-white lg:grid-cols-[1fr_0.86fr]">
      <section className="hidden min-h-[calc(100vh-2rem)] flex-col justify-between rounded-2xl border border-white/10 bg-[linear-gradient(145deg,#020617,#172033_58%,#3b2a09)] p-8 lg:flex">
        <BrandLogo href="/" size="md" priority />
        <div className="max-w-xl">
          <h1 className="text-5xl font-semibold leading-tight tracking-normal">Welcome back to your childcare command center.</h1>
          <p className="mt-5 text-base leading-7 text-slate-300">
            Continue enrollment follow-up, tours, family communications, billing, and center operations with role-scoped access.
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {["CRM", "Tours", "Parent portal"].map((label) => (
              <div key={label} className="rounded-lg border border-white/10 bg-white/[0.04] p-3 text-sm font-medium">
                {label}
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-300">
          <ShieldCheck className="size-4 text-primary" />
          AI suggestions, sensitive records, and school-level data remain role-scoped.
        </div>
      </section>

      <section className="grid place-items-center px-0 py-6 sm:px-6 lg:px-10">
        <Card className="w-full max-w-xl rounded-2xl border-white/10 bg-white text-slate-950 shadow-2xl shadow-black/30">
          <CardHeader className="text-center">
            <Link href="/" className="mx-auto block w-fit lg:hidden" aria-label="The Bee Suite home">
              <BrandIcon className="size-14 rounded-2xl" priority />
            </Link>
            <CardTitle className="mt-4 text-3xl">Log in to The Bee Suite</CardTitle>
            <CardDescription>
              Existing users can access the live workspace. New childcare brands should start with onboarding.
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
              {error ? (
                <Alert variant="destructive">
                  <AlertCircle />
                  <AlertTitle>Login failed</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}
              <div className="flex flex-col gap-2">
                <Label htmlFor="email">Email or username</Label>
                <Input
                  id="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="school@kidcityusa.com or demoschool"
                  type="text"
                  autoComplete="username"
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="password">Password</Label>
                  <Link href="/forgot-password" className="text-xs font-semibold text-slate-600 hover:text-slate-950 hover:underline">
                    Forgot password?
                  </Link>
                </div>
                <Input
                  id="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Temporary password"
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
            <div className="mt-5 rounded-lg border bg-slate-50 p-4 text-sm leading-6 text-slate-600">
              New to The Bee Suite?{" "}
              <Link href="/onboarding" className="inline-flex items-center font-semibold text-slate-950 hover:underline">
                Start onboarding <ArrowRight className="ml-1 size-3.5" />
              </Link>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
