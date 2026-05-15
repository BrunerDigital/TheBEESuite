import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ReadinessStatus = "ready" | "warning" | "blocked";

const allowedRoles = new Set<UserRole>([
  UserRole.PLATFORM_OWNER,
  UserRole.BRAND_ADMIN,
  UserRole.REGIONAL_MANAGER,
]);

function env(name: string) {
  return Boolean(process.env[name]);
}

function hasAnyEnv(names: string[]) {
  return names.some((name) => env(name));
}

function check(name: string, status: ReadinessStatus, detail: string) {
  return { name, status, detail };
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }
  if (!allowedRoles.has(user.role)) {
    return NextResponse.json({ ok: false, error: "Platform, brand, or regional access required." }, { status: 403 });
  }

  let databaseReady = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    databaseReady = true;
  } catch {
    databaseReady = false;
  }

  if (!databaseReady) {
    const checks = [check("Database", "blocked", "Database query failed.")];
    return NextResponse.json({
      ok: false,
      summary: {
        ready: 0,
        warnings: 0,
        blocked: 1,
        checkedAt: new Date().toISOString(),
      },
      checks,
    });
  }

  const [
    tenants,
    activeCenters,
    kidCityCenters,
    kidCityCentersWithEmail,
    kidCityUsers,
    importedLeads,
    openSchoolCount,
  ] = await Promise.all([
    prisma.tenant.count(),
    prisma.center.count({ where: { status: "active" } }),
    prisma.center.count({ where: { OR: [{ name: { startsWith: "Kid City USA" } }, { crmLocationId: { startsWith: "Kid City USA" } }] } }),
    prisma.center.count({
      where: {
        email: { not: null },
        OR: [{ name: { startsWith: "Kid City USA" } }, { crmLocationId: { startsWith: "Kid City USA" } }],
      },
    }),
    prisma.user.count({ where: { email: { endsWith: "@kidcityusa.com" }, isActive: true } }),
    prisma.lead.count(),
    prisma.center.count({ where: { locationId: { not: null } } }),
  ]);

  const checks = [
    check("Database", databaseReady ? "ready" : "blocked", databaseReady ? "Prisma can query the production database." : "Database query failed."),
    check("Tenant setup", tenants > 0 ? "ready" : "blocked", `${tenants} tenant record(s) available.`),
    check("Active centers", activeCenters > 0 ? "ready" : "warning", `${activeCenters} active center profile(s) are available.`),
    check(
      "Supabase Auth",
      hasAnyEnv(["SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]) && env("SUPABASE_SERVICE_ROLE_KEY") ? "ready" : "blocked",
      "Password grant login and password recovery require Supabase URL, anon/publishable key, and server-side service role key.",
    ),
    check(
      "Password recovery redirect",
      env("AUTH_PASSWORD_RESET_REDIRECT_URL") ? "ready" : "warning",
      env("AUTH_PASSWORD_RESET_REDIRECT_URL") ? "Reset redirect is configured." : "Set AUTH_PASSWORD_RESET_REDIRECT_URL and allow-list it in Supabase Auth.",
    ),
    check("Kid City centers", kidCityCenters >= 96 ? "ready" : "warning", `${kidCityCenters} Kid City center profile(s), ${openSchoolCount} with open-school location IDs.`),
    check("Location emails", kidCityCentersWithEmail >= 90 ? "ready" : "warning", `${kidCityCentersWithEmail} Kid City center profile(s) have a routed email.`),
    check("Kid City users", kidCityUsers > 0 ? "ready" : "warning", `${kidCityUsers} active @kidcityusa.com user account(s) are present.`),
    check("CRM leads", importedLeads > 0 ? "ready" : "warning", `${importedLeads} lead record(s) are available in the CRM.`),
    check(
      "Inquiry intake",
      env("INQUIRY_ALLOWED_ORIGINS") && env("INQUIRY_NOTIFICATION_EMAILS") ? "ready" : "warning",
      "Website inquiry CORS, admin notifications, location routing, and spam honeypot are server-side.",
    ),
    check(
      "Google Sheets backup",
      env("GOOGLE_SHEETS_WEBHOOK_URL") || (env("GOOGLE_SERVICE_ACCOUNT_EMAIL") && env("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY")) ? "ready" : "warning",
      "Lead backups are sent through either the Apps Script webhook or Google Sheets API credentials.",
    ),
    check(
      "SendGrid",
      env("SENDGRID_API_KEY") && env("SENDGRID_FROM_EMAIL") ? "ready" : "warning",
      "Inquiry, onboarding, and reviewed lead emails can be sent by server routes.",
    ),
    check(
      "Stripe Connect",
      env("STRIPE_SECRET_KEY") && env("STRIPE_WEBHOOK_SECRET") ? "ready" : "warning",
      "Parent checkout stays blocked until platform keys, webhook secret, and school connected payout accounts are ready.",
    ),
    check(
      "Twilio SMS",
      env("TWILIO_ACCOUNT_SID") && env("TWILIO_AUTH_TOKEN") && (env("TWILIO_FROM_NUMBER") || env("TWILIO_MESSAGING_SERVICE_SID")) ? "ready" : "warning",
      "SMS route is present; production messaging requires Twilio credentials and an approved sender.",
    ),
  ];

  const blocked = checks.filter((item) => item.status === "blocked").length;
  const warnings = checks.filter((item) => item.status === "warning").length;

  return NextResponse.json({
    ok: blocked === 0,
    summary: {
      ready: checks.length - blocked - warnings,
      warnings,
      blocked,
      checkedAt: new Date().toISOString(),
    },
    checks,
  });
}
