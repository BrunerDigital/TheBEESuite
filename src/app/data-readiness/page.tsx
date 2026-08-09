import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { DataReadinessCenter } from "@/components/data-readiness-center";
import { canManageOperations, getCurrentUser, requiresPasswordResetGate } from "@/lib/auth";
import { loadDataReadinessWorkspace } from "@/lib/data-readiness-server";
import { dataReadinessCenterEnabled } from "@/lib/honeyglass";
import { loginHrefForNextPath } from "@/lib/login-routing";

export const dynamic = "force-dynamic";

export default async function DataReadinessPage() {
  if (!dataReadinessCenterEnabled()) notFound();
  const user = await getCurrentUser({ allowPasswordResetRequired: true });
  if (!user) redirect(loginHrefForNextPath("/data-readiness"));
  if (requiresPasswordResetGate(user)) redirect("/reset-password?force=1&next=/data-readiness");
  if (!canManageOperations(user)) redirect("/dashboard");

  const workspace = await loadDataReadinessWorkspace(user);
  const { centers, allowBulkImport, ...data } = workspace;
  return (
    <AppShell currentUser={user}>
      <DataReadinessCenter data={data} centers={centers} allowBulkImport={allowBulkImport} />
    </AppShell>
  );
}
