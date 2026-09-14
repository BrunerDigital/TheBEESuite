import "./load-env";
import { mkdir, writeFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { request } from "playwright";
import { MOBILE_LAUNCH_PUBLIC_PATHS, mobileLaunchHttpSmokePassed, writeReadinessSnapshot } from "./mobile-launch-readiness";
import { SYNTHETIC_ROLE_QA_ACCOUNTS, SYNTHETIC_ROLE_QA_TENANT_SLUG, hasSyntheticRoleQaMarker } from "../src/lib/synthetic-role-qa";

async function main() {
  const prisma = new PrismaClient();
  const output = "outputs/ios-launch";
  await mkdir(output, { recursive: true });
  const results: Record<string, unknown>[] = [];
  try {
    // Only school identifiers/names are exported, never family/contact/financial records.
    const schools = await prisma.center.findMany({ where: { status: { notIn: ["closed", "archived", "inactive"] } }, select: { id: true, name: true }, orderBy: { name: "asc" } });
    const columns = ["School ID", "School", "Status", "Director", "Correct access confirmed", "Classrooms confirmed", "Staff confirmed", "Families/children confirmed", "Tuition and balances confirmed", "Billing readiness", "Staff onboarding", "Parent pilot", "Open issues", "Owner", "Next action", "Target date", "Final approval", "Launch date"];
    const quote = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const snapshot = await writeReadinessSnapshot(output, [columns, ...schools.map(s => [s.id, s.name, "Not Started", ...Array(11).fill(""), "Director review and evidence required", "", "", ""])].map(r => r.map(quote).join(",")).join("\n") + "\n");
    console.log(JSON.stringify({ directoryEntries: schools.length, readinessSnapshot: snapshot }));
    if (process.argv.includes("--directory-only")) return;
    const tenant = await prisma.tenant.findUnique({ where: { slug: SYNTHETIC_ROLE_QA_TENANT_SLUG }, select: { id: true } });
    console.log(JSON.stringify({ schools: schools.length, isolatedTenantFound: Boolean(tenant) }));
    if (!tenant || !process.env.SYNTHETIC_ROLE_QA_PASSWORD) throw new Error("Synthetic prerequisites unavailable");
    for (const account of SYNTHETIC_ROLE_QA_ACCOUNTS.filter(a => ["director", "executive", "teacher", "parent"].includes(a.key))) {
      const user = await prisma.user.findUnique({ where: { email: account.email }, select: { tenantId: true, role: true, isActive: true, customFields: true } });
      if (!user || user.tenantId !== tenant.id || user.role !== account.role || !user.isActive || !hasSyntheticRoleQaMarker(user.customFields)) { results.push({ role: account.key, status: "blocked: synthetic account safety gate" }); console.log(JSON.stringify(results[results.length - 1])); continue; }
      console.log(JSON.stringify({ role: account.key, safetyGate: "passed" }));
      const context = await request.newContext({ baseURL: "https://thebeesuite.io", timeout: 20000, userAgent: "BEE Suite designated synthetic launch QA" });
      try {
        const loginPage = await context.get(account.loginPath);
        const resetLink = /forgot.{0,30}password/i.test(await loginPage.text());
        const login = await context.post("/api/auth/login", { data: { email: account.email, password: process.env.SYNTHETIC_ROLE_QA_PASSWORD, loginPortal: account.loginPath.slice(1), deviceLabel: "Synthetic launch smoke" } });
        const loginResult = await login.json();
        if (!login.ok() || !loginResult.ok) { results.push({ role: account.key, loginStatus: login.status(), status: "blocked: existing synthetic login failed" }); continue; }
        const landing = await context.get(account.landingPath);
        const persisted = landing.ok() && new URL(landing.url()).pathname === account.landingPath;
        const extra = [];
        if (account.key === "parent") for (const view of ["updates", "messages", "payments", "family"]) {
          const response = await context.get(`/parent-portal?view=${view}`);
          extra.push({ view, status: response.status(), retainedPortal: new URL(response.url()).pathname === account.landingPath });
        }
        const logout = await context.post("/api/auth/logout");
        const afterLogout = await context.get(account.landingPath);
        results.push({ role: account.key, login: "passed", correctRole: loginResult.user?.role === account.role, correctPortal: loginResult.nextPath === account.landingPath, sessionPersistence: persisted, resetLinkPresent: resetLink, views: extra, logoutStatus: logout.status(), protectedAfterLogout: new URL(afterLogout.url()).pathname !== account.landingPath });
      } catch { results.push({ role: account.key, status: "blocked: request smoke did not complete" }); }
      finally { await context.post("/api/auth/logout").catch(() => null); await context.dispose(); }
      await writeFile(`${output}/smoke-progress.json`, JSON.stringify(results, null, 2));
      console.log(JSON.stringify(results[results.length - 1]));
    }
    const publicChecks = [];
    for (const path of MOBILE_LAUNCH_PUBLIC_PATHS) {
      try {
        const response = await fetch(`https://thebeesuite.io${path}`, { signal: AbortSignal.timeout(15000) });
        publicChecks.push({ path, status: response.status });
      } catch { publicChecks.push({ path, status: 0 }); }
    }
    const passed = mobileLaunchHttpSmokePassed(results, publicChecks);
    await writeFile(`${output}/smoke.json`, JSON.stringify({ checkedAt: new Date().toISOString(), passed, schools: schools.length, results, publicChecks, limitations: ["HTTP session smoke, not native or visual browser validation", "No physical iOS device or approved binary", "No password-reset email sent", "No real attendance/messages/payments/invitations submitted", "School pilot approvals not inferred"] }, null, 2));
    console.log(JSON.stringify({ passed, schools: schools.length, results, publicChecks }, null, 2));
    if (!passed) process.exitCode = 2;
  } finally { await prisma.$disconnect(); }
}
main().catch(() => { console.error("Mobile smoke blocked; no business mutation performed. Check designated synthetic prerequisites."); process.exitCode = 1; });
