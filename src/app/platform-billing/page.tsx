import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { PlatformBillingConsole } from "@/components/platform-billing-console";
import { getCurrentUser, requiresPasswordResetGate } from "@/lib/auth";
import { canManagePlatformBilling } from "@/lib/platform-billing-policy";
import { workspaceSelectionRedirect } from "@/lib/workspace-selection";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "BEE Suite Billing | The BEE Suite", robots: { index: false, follow: false } };

export default async function PlatformBillingPage() {
  const user = await getCurrentUser({ allowPasswordResetRequired: true });
  if (!user) redirect("/executives?next=%2Fplatform-billing");
  if (requiresPasswordResetGate(user)) redirect("/reset-password?force=1&next=%2Fplatform-billing");
  const workspaceRedirect = workspaceSelectionRedirect(user.workspace, "/platform-billing");
  if (workspaceRedirect) redirect(workspaceRedirect);
  if (!canManagePlatformBilling(user)) notFound();
  return <AppShell currentUser={user}><PlatformBillingConsole /></AppShell>;
}
