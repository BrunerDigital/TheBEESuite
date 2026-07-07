import { Suspense } from "react";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { getCurrentUser, requiresPasswordResetGate } from "@/lib/auth";
import {
  defaultNextPathForLoginPortal,
  resolvePortalPostLoginPath,
  safeLoginNextPath,
  type LoginPortal,
} from "@/lib/login-routing";

type PortalLoginPageProps = {
  portal: LoginPortal;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
  defaultNextPath?: string;
};

export async function PortalLoginPage({ portal, searchParams, defaultNextPath }: PortalLoginPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const fallbackNextPath = defaultNextPath ?? defaultNextPathForLoginPortal(portal);
  const requestedNextPath = safeLoginNextPath(resolvedSearchParams.next, fallbackNextPath);
  const user = await getCurrentUser({ allowPasswordResetRequired: true });
  const nextPath = user
    ? resolvePortalPostLoginPath({ role: user.role, requestedNext: requestedNextPath, portal })
    : requestedNextPath;

  if (user && requiresPasswordResetGate(user)) {
    redirect(`/reset-password?force=1&next=${encodeURIComponent(nextPath)}`);
  }
  if (user) redirect(nextPath);

  return (
    <Suspense fallback={null}>
      <LoginForm portal={portal} defaultNextPath={fallbackNextPath} />
    </Suspense>
  );
}
