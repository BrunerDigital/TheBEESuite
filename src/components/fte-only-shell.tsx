"use client";

import Link from "next/link";
import { SchoolTimeZoneProvider } from "@/components/school-time-zone-context";
import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { clearClassroomOfflineQueues } from "@/lib/classroom-offline-queue";

/** Deliberately does not mount global search, notifications, billing summaries,
 * web-push setup, background data refresh, or the general operations navigation. */
export function FteOnlyShell({ currentUser, children }: {
  currentUser: { name: string; timeZone?: string; timeZonesByCenterId?: Record<string, string>; workspace?: { label?: string; canSwitch?: boolean } };
  children: ReactNode;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function signOut() {
    if (busy) return;
    setBusy(true); setError("");
    try {
      try { clearClassroomOfflineQueues(window.localStorage); } catch { /* Server logout still runs. */ }
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Sign out failed");
      router.replace("/login?next=%2Ffte-reports"); router.refresh();
    } catch { setError("Could not sign out. Please try again."); }
    finally { setBusy(false); }
  }
  return <SchoolTimeZoneProvider timeZone={currentUser.timeZone} timeZonesByCenterId={currentUser.timeZonesByCenterId}><div className="min-h-screen bg-background text-foreground">
    <header className="flex flex-wrap items-center justify-between gap-4 border-b p-4">
      <div><p className="font-semibold">FTE reporting</p><p className="text-sm text-muted-foreground">{currentUser.name} · {currentUser.workspace?.label}</p></div>
      <nav aria-label="FTE account navigation" className="flex flex-wrap gap-4 text-sm">
        <Link href="/fte-reports">FTE reports</Link>
        {currentUser.workspace?.canSwitch ? <Link href="/workspace?next=%2Ffte-reports">Change school</Link> : null}
        <Link href="/account/security">Account security</Link>
        <button type="button" disabled={busy} onClick={() => void signOut()}>{busy ? "Signing out…" : "Sign out"}</button>
      </nav>
    </header>
    {error ? <p role="alert" className="p-4 text-destructive">{error}</p> : null}
    <main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">{children}</main>
  </div></SchoolTimeZoneProvider>;
}
