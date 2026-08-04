import "./load-env";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { PrismaClient, UserRole } from "@prisma/client";

type CheckConfig = { centerId: string; email: string; password: string };
const prisma = new PrismaClient();
const live = process.argv.includes("--live");

function marker(value: unknown) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && (value as Record<string, unknown>).syntheticTest === true);
}

function accountRef(email: string) {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 12);
}

function readConfig(): CheckConfig[] {
  const raw = process.env.SYNTHETIC_PARENT_CHECKS_JSON;
  if (!raw) return [];
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) throw new Error("SYNTHETIC_PARENT_CHECKS_JSON must be an array.");
  return parsed.map((item) => {
    const row = item as Partial<CheckConfig>;
    if (!row.centerId || !row.email || !row.password) throw new Error("Each synthetic check needs centerId, email, and password.");
    return { centerId: row.centerId, email: row.email.trim().toLowerCase(), password: row.password };
  });
}

async function main() {
  const checks = readConfig();
  const centers = await prisma.center.findMany({
    where: { status: { notIn: ["closed", "archived"] } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const configuredCenterIds = new Set(checks.map((check) => check.centerId));
  const missingCenters = centers.filter((center) => !configuredCenterIds.has(center.id));
  const results: Array<Record<string, unknown>> = [];

  for (const check of checks) {
    const user = await prisma.user.findUnique({
      where: { email: check.email },
      select: {
        id: true,
        role: true,
        isActive: true,
        customFields: true,
        guardians: { select: { customFields: true, family: { select: { id: true, centerId: true, customFields: true } } } },
      },
    });
    const familyIds = new Set(user?.guardians.map((guardian) => guardian.family.id) ?? []);
    const synthetic = check.email.endsWith("@synthetic.thebeesuite.io")
      || marker(user?.customFields)
      || Boolean(user?.guardians.some((guardian) => marker(guardian.customFields) || marker(guardian.family.customFields)));
    const safe = Boolean(user && user.role === UserRole.PARENT_GUARDIAN && user.isActive && synthetic && familyIds.size === 1 && user.guardians.every((guardian) => guardian.family.centerId === check.centerId));
    if (!safe) throw new Error(`Synthetic safety gate failed for account ${accountRef(check.email)}; no login attempted.`);

    let login = "not_run";
    if (live) {
      if (process.env.ALLOW_SYNTHETIC_PARENT_LOGIN_CHECKS !== "true") throw new Error("Set ALLOW_SYNTHETIC_PARENT_LOGIN_CHECKS=true with --live.");
      const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!url || !key) throw new Error("Supabase URL and anon key are required for --live.");
      const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
      const response = await client.auth.signInWithPassword({ email: check.email, password: check.password });
      login = response.error ? `failed:${response.error.status ?? "unknown"}` : "passed";
      if (!response.error) await client.auth.signOut();
    }
    results.push({ centerId: check.centerId, accountRef: accountRef(check.email), preflight: "passed", login });
  }

  console.log(JSON.stringify({ mode: live ? "live" : "preflight", configured: results, missingCenters: missingCenters.map((center) => ({ centerId: center.id, name: center.name })) }, null, 2));
  if (missingCenters.length) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Synthetic parent check failed.");
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
