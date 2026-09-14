import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const MOBILE_LAUNCH_PUBLIC_PATHS = ["/mobile-apps", "/app", "/check-in", "/privacy", "/terms", "/support", "/api/health", ...["director", "teacher", "parent", "kiosk"].map(role => `/guides/mobile-${role}.pdf`)];

export function mobileLaunchHttpSmokePassed(results: Record<string, unknown>[], publicChecks: { path: string; status: number }[]) {
  const roles = ["director", "executive", "teacher", "parent"];
  return results.length === roles.length && roles.every(role => {
    const row = results.find(result => result.role === role);
    if (!row || row.login !== "passed" || row.correctRole !== true || row.correctPortal !== true || row.sessionPersistence !== true || row.resetLinkPresent !== true || row.logoutStatus !== 200 || row.protectedAfterLogout !== true) return false;
    if (role !== "parent") return true;
    return Array.isArray(row.views) && ["updates", "messages", "payments", "family"].every(view => (row.views as Record<string, unknown>[]).some(result => result.view === view && result.status === 200 && result.retainedPortal === true));
  }) && MOBILE_LAUNCH_PUBLIC_PATHS.every(path => publicChecks.some(check => check.path === path && check.status === 200));
}

export async function writeReadinessSnapshot(directory: string, csv: string, now = new Date()) {
  await mkdir(directory, { recursive: true });
  const timestamp = now.toISOString().replace(/[:.]/g, "-");
  const path = join(directory, `school-readiness-${timestamp}-${randomUUID()}.csv`);
  await writeFile(path, csv, { flag: "wx" });
  return path;
}
