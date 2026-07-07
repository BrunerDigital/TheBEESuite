"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { RefreshCw, WifiOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { loginHrefForNextPath } from "@/lib/login-routing";
import { cn } from "@/lib/utils";

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
  if (role === "TEACHER" || role === "PARENT_GUARDIAN" || role === "AUTHORIZED_PICKUP") return 30_000;
  if (pathname.startsWith("/attendance") || pathname.startsWith("/teacher-portal") || pathname.startsWith("/parent-portal")) return 30_000;
  return 60_000;
}

function syncText(state: SyncState, lastSyncedAt: Date | null) {
  if (state === "offline") return "Offline";
  if (state === "signed-out") return "Session ended";
  if (state === "syncing") return "Syncing";
  if (!lastSyncedAt) return "Live";
  return `Live ${lastSyncedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}

export function LiveRefreshStatus({ role }: { role?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<SyncState>("idle");
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const mounted = useSyncExternalStore(subscribeClientReady, getClientReadySnapshot, getServerReadySnapshot);
  const intervalMs = refreshIntervalMs(pathname, role);

  useEffect(() => {
    let cancelled = false;

    async function sync(refreshPage: boolean) {
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

        setLastSyncedAt(new Date());
        setState("idle");
        if (refreshPage) router.refresh();
      } catch {
        if (!cancelled) setState("offline");
      }
    }

    const interval = window.setInterval(() => {
      void sync(true);
    }, intervalMs);
    const onFocus = () => {
      void sync(true);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void sync(true);
    };

    void sync(false);
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
  const statusText = mounted ? syncText(state, lastSyncedAt) : "Live";

  return (
    <Badge
      variant={offline ? "outline" : "secondary"}
      className={cn(
        "hidden gap-1 rounded-lg px-2.5 py-1 text-[0.68rem] xl:inline-flex",
        offline && "border-amber-500/40 text-amber-700 dark:text-amber-300",
      )}
    >
      <Icon className={cn("size-3", state === "syncing" && "animate-spin")} />
      <span suppressHydrationWarning>{statusText}</span>
    </Badge>
  );
}
