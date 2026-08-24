import "./load-env";
import { createHash } from "node:crypto";
import { createClient, type User as SupabaseUser } from "@supabase/supabase-js";
import { UserRole } from "@prisma/client";
import { currentlyEnrolledChildWhere } from "@/lib/enrollment-status";
import { ensureParentPortalLoginForGuardian, parentPortalAccessDisabled } from "@/lib/parent-portal-logins";
import { parentVisibleBillingBalanceCents, AGENCY_LEDGER_ENTRY_TYPES, AGENCY_LEDGER_SOURCE_SYSTEM } from "@/lib/parent-billing-visibility";
import { prisma } from "@/lib/prisma";
import { stripeSchoolBillingApproval } from "@/lib/stripe-billing-approval";
import { getSupabaseAuthConfig, isSupabaseAuthCompatibleEmail } from "@/lib/supabase-auth";

const APPLY = process.argv.includes("--apply");
const ACKNOWLEDGE = process.argv.includes("--acknowledge-source-backed-parent-access");
const FINGERPRINT_PREFIX = "--confirm-fingerprint=";
const SOURCE = "source_backed_positive_balance_parent_access_2026_08_24";

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function clean(value: string | null | undefined) {
  return value?.trim() ?? "";
}

function email(value: string | null | undefined) {
  return clean(value).toLowerCase();
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function fingerprint(rows: Array<{ guardianId: string; familyId: string; centerId: string; email: string }>) {
  return createHash("sha256")
    .update(rows.map((row) => `${row.centerId}|${row.familyId}|${row.guardianId}|${row.email}`).sort().join("\n"))
    .digest("hex");
}

function activeAuthUser(user: SupabaseUser) {
  return Boolean(user.email_confirmed_at && (!user.banned_until || new Date(user.banned_until) <= new Date()));
}

async function loadSupabaseAuthInventory() {
  const { url, key } = getSupabaseAuthConfig("service");
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const allEmails = new Set<string>();
  const activeEmails = new Set<string>();
  let page = 1;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    for (const user of data.users) {
      const normalized = email(user.email);
      if (!normalized) continue;
      allEmails.add(normalized);
      if (activeAuthUser(user)) activeEmails.add(normalized);
    }
    const nextPage = "nextPage" in data ? data.nextPage : null;
    if (!nextPage) break;
    if (nextPage <= page) throw new Error("Supabase Auth pagination did not advance.");
    page = nextPage;
  }
  return { activeEmails, allEmails };
}

async function buildPlan() {
  const auth = await loadSupabaseAuthInventory();
  const centers = await prisma.center.findMany({
    where: { status: "active" },
    select: { id: true, name: true, customFields: true, organization: { select: { tenantId: true } } },
  });
  const eligible = centers.filter((center) => {
    const custom = record(center.customFields);
    return custom.livePaymentsEnabled === true
      && custom.tuitionBillingEnabled === true
      && stripeSchoolBillingApproval({ customFields: center.customFields, centerName: center.name }).approved;
  });
  const centerById = new Map(eligible.map((center) => [center.id, center]));
  const families = await prisma.family.findMany({
    where: { centerId: { in: eligible.map((center) => center.id) }, children: { some: currentlyEnrolledChildWhere() } },
    select: {
      id: true,
      centerId: true,
      sourceSystem: true,
      externalId: true,
      children: { where: currentlyEnrolledChildWhere(), select: { sourceSystem: true, externalId: true } },
      guardians: { select: { id: true, familyId: true, email: true, isBillingContact: true, sourceSystem: true, externalId: true, customFields: true, user: { select: { email: true, role: true, isActive: true, tenantId: true } } } },
      billingAccount: { select: { balanceCents: true, ledgerEntries: { where: { OR: [{ type: { in: [...AGENCY_LEDGER_ENTRY_TYPES] } }, { sourceSystem: AGENCY_LEDGER_SOURCE_SYSTEM }] }, select: { type: true, sourceSystem: true, amountCents: true } } } },
    },
    orderBy: { id: "asc" },
  });
  const candidateFamilies = families.filter((family) => family.billingAccount && parentVisibleBillingBalanceCents({ accountBalanceCents: family.billingAccount.balanceCents, agencyLedgerEntries: family.billingAccount.ledgerEntries }) > 0);
  const tenantCenterIds = new Map<string, string[]>();
  for (const center of centers) tenantCenterIds.set(center.organization.tenantId, [...(tenantCenterIds.get(center.organization.tenantId) ?? []), center.id]);
  const rows: Array<{ guardianId: string; familyId: string; centerId: string; email: string; school: string }> = [];
  const blocked: Record<string, number> = {};
  const block = (reason: string) => { blocked[reason] = (blocked[reason] ?? 0) + 1; };
  for (const family of candidateFamilies) {
    const center = family.centerId ? centerById.get(family.centerId) : null;
    if (!center || !family.billingAccount) continue;
    if (family.guardians.some((guardian) => guardian.user?.role === UserRole.PARENT_GUARDIAN
      && guardian.user.isActive
      && guardian.user.tenantId === center.organization.tenantId
      && auth.activeEmails.has(email(guardian.user.email)))) continue;
    if (clean(family.sourceSystem).toLowerCase() !== "procare" || !clean(family.externalId)) { block("family_source_identity_missing"); continue; }
    if (!family.children.length || family.children.some((child) => clean(child.sourceSystem).toLowerCase() !== "procare" || !clean(child.externalId))) { block("child_source_identity_missing"); continue; }
    const guardians = family.guardians.filter((guardian) => guardian.isBillingContact
      && clean(guardian.sourceSystem).toLowerCase() === "procare"
      && clean(guardian.externalId)
      && isSupabaseAuthCompatibleEmail(email(guardian.email))
      && !parentPortalAccessDisabled(guardian.customFields));
    if (!guardians.length) { block("source_backed_billing_guardian_missing"); continue; }
    let selected = null as typeof guardians[number] | null;
    for (const guardian of guardians) {
      const matching = await prisma.guardian.findMany({
        where: { email: { equals: email(guardian.email), mode: "insensitive" }, family: { centerId: { in: tenantCenterIds.get(center.organization.tenantId) ?? [] } } },
        select: { familyId: true, customFields: true },
      });
      const normalized = email(guardian.email);
      const appUser = await prisma.user.findFirst({ where: { email: { equals: normalized, mode: "insensitive" } }, select: { tenantId: true, role: true } });
      if (auth.allEmails.has(normalized) && !appUser) { block("auth_identity_without_app_user"); continue; }
      if (appUser && (appUser.tenantId !== center.organization.tenantId || appUser.role !== UserRole.PARENT_GUARDIAN)) { block("app_user_scope_conflict"); continue; }
      if (matching.length && matching.every((item) => item.familyId === family.id && !parentPortalAccessDisabled(item.customFields))) { selected = guardian; break; }
    }
    if (!selected) { block("email_family_scope_ambiguous"); continue; }
    rows.push({ guardianId: selected.id, familyId: family.id, centerId: center.id, email: email(selected.email), school: center.name });
  }
  return { rows, blocked, fingerprint: fingerprint(rows) };
}

async function main() {
  const plan = await buildPlan();
  const supplied = process.argv.find((arg) => arg.startsWith(FINGERPRINT_PREFIX))?.slice(FINGERPRINT_PREFIX.length).trim();
  if (!APPLY) {
    console.log(JSON.stringify({ mode: "read_only_preview", ready: plan.rows.length, blocked: plan.blocked, fingerprint: plan.fingerprint, targets: plan.rows.map((row) => ({ school: row.school, familyHash: hash(row.familyId), guardianHash: hash(row.guardianId) })), effects: { invitationsSent: 0, chargesCreated: 0, autopayChanged: 0 } }, null, 2));
    return;
  }
  if (!ACKNOWLEDGE || !supplied || supplied !== plan.fingerprint) throw new Error(`Apply requires --acknowledge-source-backed-parent-access ${FINGERPRINT_PREFIX}${plan.fingerprint}.`);
  const results = [];
  for (const [index, row] of plan.rows.entries()) {
    const fresh = await buildPlan();
    const expectedRemaining = plan.rows.slice(index);
    if (fresh.fingerprint !== fingerprint(expectedRemaining)
      || !fresh.rows.some((item) => item.guardianId === row.guardianId && item.familyId === row.familyId)) {
      throw new Error("Parent access target set changed during apply; stop and rerun preview.");
    }
    const result = await ensureParentPortalLoginForGuardian({ guardianId: row.guardianId, linkedBy: "system:parent-payment-readiness", linkedReason: SOURCE, prepareWithoutInvite: true });
    if (!result.ok) throw new Error(`Parent access preparation failed for ${hash(row.guardianId)}: ${result.reason}`);
    await prisma.auditLog.create({ data: { tenantId: (await prisma.center.findUniqueOrThrow({ where: { id: row.centerId }, select: { organization: { select: { tenantId: true } } } })).organization.tenantId, centerId: row.centerId, action: "parent_portal.payment_access_prepared", resource: "Guardian", resourceId: row.guardianId, metadata: { familyHash: hash(row.familyId), source: SOURCE, invitationsSent: 0, chargesCreated: 0, autopayChanged: 0 } } });
    results.push({ guardianHash: hash(row.guardianId), created: result.created, reactivated: result.reactivated, credentialCreated: result.credentialCreated });
  }
  console.log(JSON.stringify({ mode: "apply", applied: results.length, fingerprint: plan.fingerprint, results, invitationsSent: 0, chargesCreated: 0, autopayChanged: 0 }, null, 2));
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
