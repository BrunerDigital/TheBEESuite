import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { WorkspaceSelector } from "@/components/workspace-selector";
import { getCurrentUser, requiresPasswordResetGate } from "@/lib/auth";
import { loginHrefForNextPath } from "@/lib/login-routing";
import { safeWorkspaceNextPath } from "@/lib/workspace-selection";

export const dynamic = "force-dynamic";

export default async function WorkspacePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = await searchParams;
  const nextPath = safeWorkspaceNextPath(resolvedSearchParams.next);
  const user = await getCurrentUser({ allowPasswordResetRequired: true });
  if (!user) redirect(loginHrefForNextPath(nextPath));
  if (requiresPasswordResetGate(user)) {
    redirect(`/reset-password?force=1&next=${encodeURIComponent(`/workspace?next=${encodeURIComponent(nextPath)}`)}`);
  }
  if (!user.workspace?.canSwitch) redirect(nextPath);

  return (
    <AppShell currentUser={user}>
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <header className="rounded-2xl border bg-card/80 p-5 shadow-sm sm:p-7">
          <p className="text-sm font-semibold text-primary">Current workspace</p>
          <h1 className="mt-2 text-pretty text-3xl font-semibold tracking-tight sm:text-4xl">
            {user.workspace.required ? "Where are you working today?" : "Change workspace"}
          </h1>
          <p className="mt-3 max-w-3xl text-pretty text-sm leading-6 text-muted-foreground sm:text-base">
            Choose one location for street-level work, or choose All locations for the authorized company-wide view. You can change this later from the shared header.
          </p>
        </header>
        <WorkspaceSelector workspace={user.workspace} nextPath={nextPath} />
      </div>
    </AppShell>
  );
}
