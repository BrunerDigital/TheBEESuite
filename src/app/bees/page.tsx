import { notFound, redirect } from "next/navigation";
import { ExternalLink, FolderOpen } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { getCurrentUser, requiresPasswordResetGate } from "@/lib/auth";
import { beesOnlineForms, beesResourceFolders, canUseBeesResources } from "@/lib/bees-resources";
import { loginHrefForNextPath } from "@/lib/login-routing";
import { workspaceSelectionRedirect } from "@/lib/workspace-selection";

export const dynamic = "force-dynamic";

export default async function BeesPage() {
  const user = await getCurrentUser({ allowPasswordResetRequired: true });
  if (!user) redirect(loginHrefForNextPath("/bees"));
  if (requiresPasswordResetGate(user)) redirect("/reset-password?force=1&next=/bees");
  const workspaceRedirect = workspaceSelectionRedirect(user.workspace, "/bees");
  if (workspaceRedirect) redirect(workspaceRedirect);
  if (!canUseBeesResources(user)) notFound();

  return (
    <AppShell currentUser={user}>
      <div className="mx-auto w-full max-w-5xl space-y-8">
        <header className="space-y-2">
          <p className="text-sm font-medium text-primary">Kid City USA · Director & owner resources</p>
          <h1 className="text-3xl font-semibold tracking-tight">BEES</h1>
          <p className="max-w-2xl text-muted-foreground">Your school’s forms, training, curriculum, and operational resources, linked directly to the same Google Drive folders used on the Kid City USA website.</p>
        </header>
        <div className="rounded-xl border bg-muted/40 p-4 text-sm leading-6">
          Sign in to Google Drive with your active Kid City USA school email. Links open in a new tab.
          If Google shows “You need access,” check the signed-in Google account or contact corporate support.
        </div>
        <section aria-labelledby="bees-files" className="space-y-4">
          <h2 id="bees-files" className="text-xl font-semibold">Files & resources</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {beesResourceFolders.map(({ title, description, id }) => (
              <a key={id} href={`https://drive.google.com/drive/folders/${id}`} target="_blank" rel="noopener noreferrer" className="group flex min-w-0 items-start gap-4 rounded-xl border bg-card p-5 shadow-sm transition-colors hover:border-primary/50 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <FolderOpen className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{title}</span>
                  <span className="mt-1 block text-sm leading-5 text-muted-foreground">{description}</span>
                  <span className="mt-3 block text-xs font-medium text-primary">Open in Google Drive<span className="sr-only"> (new tab)</span></span>
                </span>
                <ExternalLink className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </a>
            ))}
          </div>
        </section>
        <section aria-labelledby="bees-forms" className="space-y-4">
          <h2 id="bees-forms" className="text-xl font-semibold">Online forms</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {beesOnlineForms.map(({ title, href }) => (
              <a key={title} href={href} target="_blank" rel="noopener noreferrer" className="flex min-h-12 items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <span>{title}<span className="sr-only"> (new tab)</span></span>
                <ExternalLink className="size-4 shrink-0" aria-hidden="true" />
              </a>
            ))}
          </div>
          <a href="https://kidcityusa.com/bees/" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-primary underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Open the BEES website for additional requests<span className="sr-only"> (new tab)</span><ExternalLink className="size-4" aria-hidden="true" />
          </a>
        </section>
      </div>
    </AppShell>
  );
}
