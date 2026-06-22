"use client";

import Link from "next/link";
import { FormEvent, useState, useTransition } from "react";
import { AlertCircle, ArrowLeft, CheckCircle2 } from "lucide-react";
import { BrandIcon, BrandLogo } from "@/components/brand-logo";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ResetResponse = {
  ok?: boolean;
  error?: string;
  message?: string;
};

function safeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/login")) return "";
  return value;
}

export function ForgotPasswordForm({ initialNext = "" }: { initialNext?: string }) {
  const next = safeNextPath(initialNext);
  const parentSetupFlow = next === "/parent-portal/setup";
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    startTransition(async () => {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, next }),
      });
      const data = (await response.json().catch(() => null)) as ResetResponse | null;

      if (!response.ok) {
        setError(data?.error ?? "Unable to send a reset link right now.");
        return;
      }

      setMessage(data?.message ?? "If that email is active, a password reset link will be sent shortly.");
    });
  }

  return (
    <div className="grid min-h-screen bg-slate-950 p-4 text-white lg:grid-cols-[1fr_0.86fr]">
      <section className="hidden min-h-[calc(100vh-2rem)] flex-col justify-between rounded-2xl border border-white/10 bg-[linear-gradient(145deg,#020617,#172033_58%,#3b2a09)] p-8 lg:flex">
        <BrandLogo href="/" size="md" compact={parentSetupFlow} priority />
        <div className="max-w-xl">
          <h1 className="text-5xl font-semibold leading-tight tracking-normal">
            {parentSetupFlow ? "Reset your parent portal password." : "Get back into your school workspace."}
          </h1>
          <p className="mt-5 text-base leading-7 text-slate-300">
            {parentSetupFlow
              ? "We will send a secure recovery link for the email your school invited. After updating your password, finish parent setup."
              : "We’ll send a secure Supabase Auth recovery link so your Kid City USA or BEE Suite account can set a fresh password."}
          </p>
        </div>
        <p className="text-sm text-slate-300">
          {parentSetupFlow
            ? "Reset links should only be used by the parent or guardian who owns this account."
            : "Reset links should only be used by the account owner and expire through Supabase Auth."}
        </p>
      </section>

      <section className="grid place-items-center px-0 py-6 sm:px-6 lg:px-10">
        <Card className="w-full max-w-xl rounded-2xl border-white/10 bg-white text-slate-950 shadow-2xl shadow-black/30">
          <CardHeader className="text-center">
            <Link href="/" className="mx-auto block w-fit lg:hidden" aria-label="The BEE Suite home">
              <BrandIcon className="size-14 rounded-2xl" priority />
            </Link>
            <CardTitle className="mt-4 text-3xl">Reset your password</CardTitle>
            <CardDescription>
              {parentSetupFlow
                ? "Enter the email from your parent portal invitation. For privacy, we show the same confirmation either way."
                : "Enter the email tied to your school user account. For privacy, we show the same confirmation either way."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="flex flex-col gap-4" onSubmit={submit}>
              {error ? (
                <Alert variant="destructive">
                  <AlertCircle />
                  <AlertTitle>Reset link failed</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}
              {message ? (
                <Alert className="border-emerald-500/30 bg-emerald-500/10">
                  <CheckCircle2 />
                  <AlertTitle>Check your email</AlertTitle>
                  <AlertDescription>{message}</AlertDescription>
                </Alert>
              ) : null}
              <div className="flex flex-col gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder={parentSetupFlow ? "parent@example.com" : "school@kidcityusa.com"}
                  type="email"
                  autoComplete="email"
                  required
                />
              </div>
              <Button size="lg" type="submit" disabled={isPending}>
                {isPending ? "Sending reset link..." : "Send reset link"}
              </Button>
            </form>
            <Link
              href={parentSetupFlow ? `/login?next=${encodeURIComponent(next)}` : "/login"}
              className="mt-5 inline-flex items-center text-sm font-semibold text-slate-950 hover:underline"
            >
              <ArrowLeft className="mr-1 size-3.5" />
              Back to login
            </Link>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
