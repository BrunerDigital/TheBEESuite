import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { getCurrentUser, requiresPasswordResetGate } from "@/lib/auth";
import { resolvePostLoginPath, safeLoginNextPath } from "@/lib/login-routing";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign In | The BEE Suite",
  description: "Secure sign-in for The BEE Suite school, family, classroom, and company workspaces.",
  robots: { index: false, follow: false },
};

type LoginPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const requestedNextPath = safeLoginNextPath(resolvedSearchParams.next);
  const user = await getCurrentUser({ allowPasswordResetRequired: true });
  const nextPath = user ? resolvePostLoginPath({ role: user.role, requestedNext: requestedNextPath }) : requestedNextPath;
  if (user && requiresPasswordResetGate(user)) redirect(`/reset-password?force=1&next=${encodeURIComponent(nextPath)}`);
  if (user) redirect(nextPath);

  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
