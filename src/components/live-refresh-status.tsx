"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { RefreshCw, WifiOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { loginHrefForNextPath } from "@/lib/login-routing";
import { cn } from "@/lib/utils";
import { useSchoolTimeZone } from "@/components/school-time-zone-context";
import { formatZonedDateTime } from "@/lib/zoned-date-time";

type SyncState = "idle" | "offline" | "signed-out" | "syncing";

function subscribeClientReady() {
  return () => undefined;
}

function getClientReadySnapshot() {
  return true;
}

function getServerReadySnapshot() {
  return false;
}

function refreshIntervalMs(pathname: string, role?: string) {
  if (pathname.startsWith("/billing-invoices")) return 15_000;
  if (role === "TEACHER" || role === "PARENT_GUARDIAN" || role === "AUTHORIZED_PICKUP") return 30_000;
  if (pathname.startsWith("/attendance") || pathname.startsWith("/teacher-portal") || pathname.startsWith("/parent-portal")) return 30_000;
  return 60_000;
}

function syncText(state: SyncState, lastSyncedAt: Date | null, timeZone: string) {
  if (state === "offline") return "Offline";
  if (state === "signed-out") return "Session ended";
  if (state === "syncing") return "Syncing";
  if (!lastSyncedAt) return "Live";
  return `Live ${formatZonedDateTime(lastSyncedAt, timeZone, { hour: "numeric", minute: "2-digit", timeZoneName: "short" }, "")}`;
}

export function LiveRefreshStatus({ role }: { role?: string }) {
  const timeZone = useSchoolTimeZone();
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<SyncState>("idle");
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const billingVersionRef = useRef<string | null>(null);
  const mounted = useSyncExternalStore(subscribeClientReady, getClientReadySnapshot, getServerReadySnapshot);
  const intervalMs = refreshIntervalMs(pathname, role);

  useEffect(() => {
    let cancelled = false;

    async function sync() {
      if (document.visibilityState !== "visible") return;
      setState("syncing");
      try {
        const response = await fetch("/api/device-sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "heartbeat" }),
          cache: "no-store",
        });

        if (cancelled) return;
        if (response.status === 401) {
          setState("signed-out");
          router.push(loginHrefForNextPath(pathname || "/dashboard", role));
          router.refresh();
          return;
        }
        if (!response.ok) throw new Error("Live refresh failed.");

        if (pathname.startsWith("/billing-invoices")) {
          const versionResponse = await fetch("/api/billing/live-version", { cache: "no-store" });
          if (!versionResponse.ok) throw new Error("Billing refresh failed.");
          const json = await versionResponse.json().catch(() => null) as { version?: string } | null;
          const nextVersion = json?.version ?? null;
          const previousVersion = billingVersionRef.current;
          billingVersionRef.current = nextVersion;
          if (nextVersion && (!previousVersion || previousVersion !== nextVersion)) router.refresh();
        }
        setLastSyncedAt(new Date());
        setState("idle");
      } catch {
        if (!cancelled) setState("offline");
      }
    }

    const interval = window.setInterval(() => {
      void sync();
    }, intervalMs);
    const onFocus = () => {
      void sync();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void sync();
    };

    void sync();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [intervalMs, pathname, role, router]);

  const offline = state === "offline" || state === "signed-out";
  const Icon = offline ? WifiOff : RefreshCw;
  const statusText = mounted ? syncText(state, lastSyncedAt, timeZone) : "Live";

  return (
    <Badge
      variant={offline ? "outline" : "secondary"}
      className={cn(
        "hidden gap-1 rounded-lg px-2.5 py-1 text-[0.68rem] 2xl:inline-flex",
        offline && "border-amber-500/40 text-amber-700 dark:text-amber-300",
      )}
    >
      <Icon className={cn("size-3", state === "syncing" && "animate-spin")} />
      <span suppressHydrationWarning>{statusText}</span>
    </Badge>
  );
}
