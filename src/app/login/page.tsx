import { Suspense } from "react";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { getCurrentUser, requiresPasswordResetGate } from "@/lib/auth";

export const dynamic = "force-dynamic";

type LoginPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function firstSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function safeNextPath(value: string | string[] | undefined) {
  const path = firstSearchParam(value) || "/dashboard";
  if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/login")) return "/dashboard";
  return path;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const nextPath = safeNextPath(resolvedSearchParams.next);
  const user = await getCurrentUser({ allowPasswordResetRequired: true });
  if (user && requiresPasswordResetGate(user)) redirect(`/reset-password?force=1&next=${encodeURIComponent(nextPath)}`);
  if (user) redirect(nextPath);

  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
