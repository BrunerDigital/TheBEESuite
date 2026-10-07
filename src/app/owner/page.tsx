import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { getCurrentUser, requiresPasswordResetGate } from "@/lib/auth";
import { workspaceSelectionHref } from "@/lib/workspace-selection";

export const dynamic = "force-dynamic";

const tools = [
  ["School setup", "Review your school profile, classrooms, staff, tuition, and launch checklist.", "/billing-settings?view=setup"],
  ["Stripe billing and payouts", "Complete secure Stripe onboarding, verification, and payout bank setup; check billing readiness.", "/billing-settings"],
  ["Families and children", "Add or review families, children, guardians, enrollment, and balances.", "/family-detail"],
  ["School workspace", "Use the daily operations and management tools available to your director.", "/dashboard"],
  ["Import school data", "Upload and preview your family data, review errors and duplicates, then approve the import for this school.", "/data-readiness"],
  ["Import and setup guides", "Prepare school data and follow the reviewed import and launch process.", "/resources/director-data-clean-start"],
] as const;

export default async function OwnerPage() {
  const user = await getCurrentUser({ allowPasswordResetRequired: true });
  if (!user) redirect("/login?next=/owner");
  if (requiresPasswordResetGate(user)) redirect("/reset-password?force=1&next=/owner");
  if (!user.isSchoolOwner) redirect("/dashboard");
  if (user.workspace?.required) redirect(workspaceSelectionHref("/owner"));
  return <AppShell currentUser={user}><div className="mx-auto w-full max-w-5xl space-y-6">
    <header className="rounded-xl border bg-card p-6"><p className="text-sm font-semibold text-primary">Owner workspace</p><h1 className="mt-2 text-3xl font-semibold">Set up your school</h1><p className="mt-2 text-muted-foreground">{user.workspace?.label || "No school assigned"}</p>{user.workspace?.canSwitch ? <Link className="mt-4 inline-block font-medium text-primary underline" href={workspaceSelectionHref("/owner")}>Change school</Link> : null}</header>
    {!user.centerIds.length ? <p role="alert">Contact your administrator to assign a school before starting setup.</p> : <div className="grid gap-4 sm:grid-cols-2">{tools.map(([title, description, href]) => <Link key={href} href={href} className="rounded-xl border bg-card p-5 transition-colors hover:border-primary focus-visible:outline-2 focus-visible:outline-primary"><h2 className="text-lg font-semibold">{title}</h2><p className="mt-2 text-sm text-muted-foreground">{description}</p></Link>)}</div>}
  </div></AppShell>;
}
