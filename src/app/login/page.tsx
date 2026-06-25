import { Suspense } from "react";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { getCurrentUser, requiresPasswordResetGate } from "@/lib/auth";
import { resolvePostLoginPath, safeLoginNextPath } from "@/lib/login-routing";

export const dynamic = "force-dynamic";

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
