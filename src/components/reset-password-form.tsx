"use client";

import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { FormEvent, useEffect, useRef, useState, useTransition } from "react";
import { AlertCircle, CheckCircle2, LockKeyhole } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
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

function readRecoveryTokenFromHash() {
  if (typeof window === "undefined") return "";
  const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
  const params = new URLSearchParams(hash);
  const type = params.get("type");
  const accessToken = params.get("access_token");
  return type === "recovery" && accessToken ? accessToken : "";
}

function safeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/login")) return "/dashboard";
  return value;
}

export function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const forceReset = searchParams.get("force") === "1";
  const next = safeNextPath(searchParams.get("next"));
  const accessTokenRef = useRef("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (forceReset) return;
    const token = readRecoveryTokenFromHash();
    accessTokenRef.current = token;
    if (token && window.location.hash) {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }, [forceReset]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!forceReset && !accessTokenRef.current) {
      setError("This reset link is missing or expired. Request a fresh password reset link.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    startTransition(async () => {
      const endpoint = forceReset ? "/api/auth/force-password-reset" : "/api/auth/reset-password";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(forceReset ? { currentPassword, password } : { accessToken: accessTokenRef.current, password }),
      });
      const data = (await response.json().catch(() => null)) as ResetResponse | null;

      if (!response.ok) {
        setError(data?.error ?? "Unable to update your password.");
        return;
      }

      setMessage(data?.message ?? "Password updated. You can now sign in.");
      const loginNext = `/login?reset=complete&next=${encodeURIComponent(next)}`;
      setTimeout(() => router.push(forceReset ? next : loginNext), 1200);
    });
  }

  return (
    <div className="grid min-h-screen bg-slate-950 p-4 text-white lg:grid-cols-[1fr_0.86fr]">
      <section className="hidden min-h-[calc(100vh-2rem)] flex-col justify-between rounded-2xl border border-white/10 bg-[linear-gradient(145deg,#020617,#172033_58%,#3b2a09)] p-8 lg:flex">
        <BrandLogo href="/" size="md" priority />
        <div className="max-w-xl">
          <h1 className="text-5xl font-semibold leading-tight tracking-normal">Create a new secure password.</h1>
          <p className="mt-5 text-base leading-7 text-slate-300">
            {forceReset
              ? "Passwords must be updated before workspace access is allowed."
              : "This screen only works from a valid Supabase recovery link. After updating, sign in again with your email."}
          </p>
        </div>
        <p className="text-sm text-slate-300">Human review remains required for sensitive child, billing, and compliance workflows.</p>
      </section>

      <section className="grid place-items-center px-0 py-6 sm:px-6 lg:px-10">
        <Card className="w-full max-w-xl rounded-2xl border-white/10 bg-white text-slate-950 shadow-2xl shadow-black/30">
          <CardHeader className="text-center">
            <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-primary text-primary-foreground">
              <LockKeyhole />
            </div>
            <CardTitle className="mt-4 text-3xl">Set a new password</CardTitle>
            <CardDescription>
              {forceReset ? "Enter your password, then choose something only you know." : "Use at least 8 characters. Choose something only you know."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="flex flex-col gap-4" onSubmit={submit}>
              {error ? (
                <Alert variant="destructive">
                  <AlertCircle />
                  <AlertTitle>Password update failed</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}
              {message ? (
                <Alert className="border-emerald-500/30 bg-emerald-500/10">
                  <CheckCircle2 />
                  <AlertTitle>Password updated</AlertTitle>
                  <AlertDescription>{message}</AlertDescription>
                </Alert>
              ) : null}
              {forceReset ? (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="currentPassword">Password</Label>
                  <Input
                    id="currentPassword"
                    value={currentPassword}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                    type="password"
                    autoComplete="current-password"
                    required
                  />
                </div>
              ) : null}
              <div className="flex flex-col gap-2">
                <Label htmlFor="password">New password</Label>
                <Input
                  id="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="confirmPassword">Confirm password</Label>
                <Input
                  id="confirmPassword"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </div>
              <Button size="lg" type="submit" disabled={isPending}>
                {isPending ? "Updating password..." : "Update password"}
              </Button>
            </form>
            {forceReset ? (
              <Link href="/login?reset=required" className="mt-5 inline-flex text-sm font-semibold text-slate-950 hover:underline">
                Back to login
              </Link>
            ) : (
              <Link href="/forgot-password" className="mt-5 inline-flex text-sm font-semibold text-slate-950 hover:underline">
                Request a fresh reset link
              </Link>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
