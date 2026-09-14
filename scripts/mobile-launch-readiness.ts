import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export function assertProductionLoginOptIn(directoryOnly: boolean, permission: string | undefined) {
  if (!directoryOnly && permission !== "true") throw new Error("Production login smoke requires ALLOW_SYNTHETIC_ROLE_QA_PRODUCTION_LOGIN=true. Use --directory-only for a read-only school export.");
}

export function readinessCsvCell(value: string) {
  const safe = /^\s*[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

export const MOBILE_LAUNCH_PUBLIC_PATHS = ["/mobile-apps", "/app", "/check-in", "/privacy", "/terms", "/support", "/api/health", ...["director", "teacher", "parent", "kiosk"].map(role => `/guides/mobile-${role}.pdf`)];

export function launchPublicResponseIsValid(path: string, response: { status: number; url: string; contentType: string; body: string }) {
  if (response.status !== 200 || response.url !== `https://thebeesuite.io${path}`) return false;
  const contentType = response.contentType.split(";")[0].trim().toLowerCase();
  if (path.endsWith(".pdf")) return contentType === "application/pdf" && response.body.startsWith("%PDF-");
  if (path === "/api/health") {
    try { const health = JSON.parse(response.body); return contentType === "application/json" && health.ok === true && health.database === "connected"; } catch { return false; }
  }
  if (contentType !== "text/html" || !/<html[\s>]/i.test(response.body) || /NEXT_REDIRECT;/.test(response.body)) return false;
  return path !== "/mobile-apps" || /<h1[^>]*>The BEE Suite Mobile Apps<\/h1>/.test(response.body);
}

export function mobileLaunchHttpSmokePassed(results: Record<string, unknown>[], publicChecks: { path: string; status: number; valid: boolean }[]) {
  const roles = ["director", "executive", "teacher", "parent"];
  return results.length === roles.length && roles.every(role => {
    const row = results.find(result => result.role === role);
    if (!row || row.login !== "passed" || row.correctRole !== true || row.correctPortal !== true || row.sessionPersistence !== true || row.resetLinkPresent !== true || row.logoutStatus !== 200 || row.protectedAfterLogout !== true) return false;
    if (role !== "parent") return true;
    return Array.isArray(row.views) && ["updates", "messages", "payments", "family"].every(view => (row.views as Record<string, unknown>[]).some(result => result.view === view && result.status === 200 && result.retainedPortal === true));
  }) && MOBILE_LAUNCH_PUBLIC_PATHS.every(path => publicChecks.some(check => check.path === path && check.status === 200 && check.valid));
}

export async function writeReadinessSnapshot(directory: string, csv: string, now = new Date()) {
  await mkdir(directory, { recursive: true });
  const timestamp = now.toISOString().replace(/[:.]/g, "-");
  const path = join(directory, `school-readiness-${timestamp}-${randomUUID()}.csv`);
  await writeFile(path, csv, { flag: "wx" });
  return path;
}
