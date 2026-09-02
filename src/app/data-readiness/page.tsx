import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { DataReadinessCenter } from "@/components/data-readiness-center";
import { canManageOperations, getCurrentUser, requiresPasswordResetGate } from "@/lib/auth";
import { loadDataReadinessWorkspace } from "@/lib/data-readiness-server";
import { dataReadinessViewFilters } from "@/lib/data-readiness-context";
import { dataReadinessCenterEnabled } from "@/lib/honeyglass";
import { loginHrefForNextPath } from "@/lib/login-routing";
import { workspaceSelectionRedirect } from "@/lib/workspace-selection";

export const dynamic = "force-dynamic";

export default async function DataReadinessPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!dataReadinessCenterEnabled()) notFound();
  const user = await getCurrentUser({ allowPasswordResetRequired: true });
  if (!user) redirect(loginHrefForNextPath("/data-readiness"));
  if (requiresPasswordResetGate(user)) redirect("/reset-password?force=1&next=/data-readiness");
  const workspaceRedirect = workspaceSelectionRedirect(user.workspace, "/data-readiness");
  if (workspaceRedirect) redirect(workspaceRedirect);
  if (!canManageOperations(user)) redirect("/dashboard");

  const [workspace, resolvedSearchParams] = await Promise.all([
    loadDataReadinessWorkspace(user),
    searchParams,
  ]);
  const { centers, allowBulkImport, ...data } = workspace;
  const initialView = dataReadinessViewFilters(resolvedSearchParams);
  return (
    <AppShell currentUser={user}>
      <DataReadinessCenter
        key={`${initialView.tab}:${initialView.status}:${initialView.risk}:${initialView.category}:${initialView.sort}`}
        data={data}
        centers={centers}
        allowBulkImport={allowBulkImport}
        initialView={initialView}
      />
    </AppShell>
  );
}
