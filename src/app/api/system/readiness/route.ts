import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { envPresent, hasDatabaseConfig, hasStripeBillingConfig, hasSupabaseAuthConfig } from "@/lib/readiness-guardrails";
import { CHILD_MEDIA_BUCKET, isSupabaseStorageConfigured } from "@/lib/supabase-storage";

import { withApiLogging } from "@/lib/request-response-logging";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ReadinessStatus = "ready" | "warning" | "blocked";

const allowedRoles = new Set<UserRole>([
  UserRole.PLATFORM_OWNER,
  UserRole.BRAND_ADMIN,
  UserRole.REGIONAL_MANAGER,
]);

function env(name: string) {
  return envPresent(process.env, name);
}

function check(name: string, status: ReadinessStatus, detail: string) {
  return { name, status, detail };
}

async function GETHandler() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }
  if (!allowedRoles.has(user.role)) {
    return NextResponse.json({ ok: false, error: "Platform, brand, or regional access required." }, { status: 403 });
  }

  let databaseReady = false;
  let databaseDetail = hasDatabaseConfig(process.env) ? "Database query failed." : "Database URL is not configured.";
  if (hasDatabaseConfig(process.env)) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      databaseReady = true;
      databaseDetail = "Prisma can query the production database.";
    } catch {
      databaseReady = false;
    }
  }

  if (!databaseReady) {
    const checks = [check("Database", "blocked", databaseDetail)];
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

  let clientErrorReportingReady = false;
  let clientErrorReportingDetail = "Client error report table is not queryable. Run production migrations before App Store submission.";
  try {
    await prisma.clientErrorReport.count();
    clientErrorReportingReady = true;
    clientErrorReportingDetail = "Client crash/error reports can be stored and deduped server-side.";
  } catch {
    clientErrorReportingReady = false;
  }

  const checks = [
    check("Database", databaseReady ? "ready" : "blocked", databaseReady ? "Prisma can query the production database." : "Database query failed."),
    check("Tenant setup", tenants > 0 ? "ready" : "blocked", `${tenants} tenant record(s) available.`),
    check("Active centers", activeCenters > 0 ? "ready" : "warning", `${activeCenters} active center profile(s) are available.`),
    check(
      "Supabase Auth",
      hasSupabaseAuthConfig(process.env) ? "ready" : "blocked",
      "Password grant login and password recovery require Supabase URL, anon/publishable key, and server-side service role key.",
    ),
    check(
      "Supabase Storage",
      isSupabaseStorageConfigured() ? "ready" : "warning",
      `Private child media bucket is expected at "${CHILD_MEDIA_BUCKET}". Teacher uploads and parent photo viewing use server-side signed URLs.`,
    ),
    check(
      "Password recovery redirect",
      env("AUTH_PASSWORD_RESET_REDIRECT_URL") ? "ready" : "warning",
      env("AUTH_PASSWORD_RESET_REDIRECT_URL") ? "Reset redirect is configured." : "Set AUTH_PASSWORD_RESET_REDIRECT_URL and allow-list it in Supabase Auth.",
    ),
    check("Kid City centers", kidCityCenters >= 94 ? "ready" : "warning", `${kidCityCenters} Kid City center profile(s), ${openSchoolCount} with open-school location IDs.`),
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
      "Kid City FTE sheet",
      env("KIDCITY_FTE_SPREADSHEET_URL") || env("KIDCITY_FTE_SPREADSHEET_ID") || env("KIDCITY_FTE_CSV_URL") ? "ready" : "warning",
      "Executive reporting can read the Kid City FTE Google Sheet through public CSV export or Google Sheets API credentials.",
    ),
    check(
      "SendGrid",
      env("SENDGRID_API_KEY") && env("SENDGRID_FROM_EMAIL") ? "ready" : "warning",
      "Inquiry, onboarding, and reviewed lead emails can be sent by server routes.",
    ),
    check(
      "Payout processing",
      hasStripeBillingConfig(process.env) ? "ready" : "warning",
      "Parent checkout stays blocked until platform keys, webhook secret, and school connected payout accounts are ready.",
    ),
    check(
      "Twilio SMS",
      env("TWILIO_ACCOUNT_SID") && env("TWILIO_AUTH_TOKEN") && (env("TWILIO_FROM_NUMBER") || env("TWILIO_MESSAGING_SERVICE_SID")) ? "ready" : "warning",
      "SMS route is present; production messaging requires Twilio credentials and an approved sender.",
    ),
    check(
      "Client crash reporting",
      clientErrorReportingReady ? "ready" : "warning",
      clientErrorReportingDetail,
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

export const GET = withApiLogging("GET", GETHandler);
