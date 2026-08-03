import "./load-env";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Prisma } from "@prisma/client";
import { writeSystemAuditLog } from "@/lib/audit";
import { resolveWorkspaceBranding } from "@/lib/brand-assets";
import { recordEmailDeliveryAttempt } from "@/lib/integration-deliveries";
import { sendEmail } from "@/lib/integrations";
import {
  buildParentLoginSetupUrl,
  buildParentPortalInvitationHtml,
  buildParentPortalInvitationText,
  DEFAULT_PARENT_INITIAL_PASSWORD,
  DIRECT_PARENT_PORTAL_INVITE_MODE,
} from "@/lib/parent-portal-invitations";
import {
  ensureParentPortalLoginForGuardian,
  parentPortalInvitationSentFields,
} from "@/lib/parent-portal-logins";
import { prisma } from "@/lib/prisma";
import { verifySupabasePassword } from "@/lib/supabase-auth";

const APPLY = "--apply";
const CONFIRM_REPAIR = "--confirm-family-consolidation";
const SETUP = "--setup-portals";
const SEND = "--send-invitations";
const CONFIRM_SEND = "--confirm-live-parent-email";
const BASE_URL = "https://thebeesuite.io";
const SOURCE = "source_locked_family_balance_access_2026_08_03";

const CENTENNIAL_RELATIONSHIPS = {
  path: "docs/procare-exports/CO - Centennial - Miss Honeys/raw/CO - Centennial - Miss Honeys - Child Relationships.csv",
  sha256: "b1d87e77f04ad45fa58e4402ce87717458630a980ad9767e16c8bdfc12f73fb1",
};

const IDS = {
  centennial: "cms3g2the000i6a7wdd8pa20s",
  cordera: "cmp4ew5yx00046alw8i1yf63m",
  lutesFamily: "cmsdej7hv00006ajwxkfad94i",
  li: "cmsdhvqye00016abkgavtlinq",
  mitchellShell: "cmsdev8kl00006ah4ommsuezc",
  mitchellFamily: "cms95cfnz000jkv04miej7d8k",
  mitchellShellBilling: "cmsdevggi00216ah4teaule72",
  mitchellEmptyBilling: "cms95cgcg000pkv04zzsjxtj4",
  theresa: "cms95cfyf000lkv04cmxqu4yt",
  miles: "cms95cg8x000nkv04g18ve69e",
  jurgensShell: "cmsdev8u000036ah41hhxiwl5",
  jurgensFamily: "cmrw9ygev0143jr04vziwv2hh",
  jurgensShellBilling: "cmsdevsuk005p6ah4rzwnpnq2",
  jurgensBilling: "cmsdevevo001j6ah4o4nmyu1l",
  jeyden: "cmrw9ygil0145jr04fvrp3bvk",
} as const;

const LUTES_CONTACTS = [
  { guardianId: IDS.li, externalId: "210701", fullName: "Li Lutes", email: "lilutes88@gmail.com", phone: "7208220706", billing: true },
  { guardianId: null, externalId: "210702", fullName: "Levi Lutes", email: "levilutes@gmail.com", phone: "7206184999", billing: false },
] as const;

function invariant(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function mergedFields(value: Prisma.JsonValue | null | undefined, operation: string) {
  return {
    ...record(value),
    familyBalanceAccessRepair: { source: SOURCE, operation, appliedAt: new Date().toISOString() },
  } as Prisma.InputJsonObject;
}

function hashFile(path: string) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function withdrawnFingerprint(rows: Array<Record<string, unknown>>) {
  return createHash("sha256").update(JSON.stringify(rows)).digest("hex");
}

async function withdrawnSnapshot(db: Pick<Prisma.TransactionClient, "child">) {
  const rows = await db.child.findMany({
    where: { family: { centerId: { in: [IDS.centennial, IDS.cordera] } }, enrollmentStatus: "withdrawn" },
    select: { id: true, familyId: true, classroomId: true, fullName: true, enrollmentStatus: true, sourceSystem: true, externalId: true, customFields: true },
    orderBy: { id: "asc" },
  });
  return { count: rows.length, fingerprint: withdrawnFingerprint(rows as Array<Record<string, unknown>>) };
}

async function state() {
  const [families, guardians, billing, children, withdrawn, priorAudit] = await Promise.all([
    prisma.family.findMany({
      where: { id: { in: [IDS.lutesFamily, IDS.mitchellShell, IDS.mitchellFamily, IDS.jurgensShell, IDS.jurgensFamily] } },
      select: { id: true, centerId: true, name: true, sourceSystem: true, externalId: true, _count: { select: { children: true, guardians: true } } },
    }),
    prisma.guardian.findMany({
      where: { OR: [{ id: { in: [IDS.li, IDS.theresa, IDS.jeyden] } }, { familyId: IDS.lutesFamily, externalId: "210702" }] },
      select: { id: true, familyId: true, fullName: true, email: true, phone: true, userId: true, sourceSystem: true, externalId: true, customFields: true },
    }),
    prisma.billingAccount.findMany({
      where: { id: { in: [IDS.mitchellShellBilling, IDS.mitchellEmptyBilling, IDS.jurgensShellBilling, IDS.jurgensBilling] } },
      select: { id: true, familyId: true, balanceCents: true, _count: { select: { invoices: true, payments: true, ledgerEntries: true } } },
    }),
    prisma.child.findMany({ where: { id: IDS.miles }, select: { id: true, familyId: true, fullName: true, enrollmentStatus: true, sourceSystem: true, externalId: true } }),
    withdrawnSnapshot(prisma),
    prisma.auditLog.count({ where: { action: "operations.family_balance_access.consolidated", resourceId: "2026-08-03" } }),
  ]);
  return { families, guardians, billing, children, withdrawn, priorAudit };
}

function portal(value: unknown) {
  return record(record(value).parentPortal);
}

async function consolidate() {
  return prisma.$transaction(async (tx) => {
    const beforeWithdrawn = await withdrawnSnapshot(tx);
    const [mitchellShell, mitchellFamily, mitchellShellBilling, mitchellEmptyBilling, theresa, miles, jurgensShell, jurgensFamily, jurgensShellBilling, jurgensBilling, li] = await Promise.all([
      tx.family.findUnique({ where: { id: IDS.mitchellShell }, include: { _count: { select: { children: true, guardians: true } } } }),
      tx.family.findUnique({ where: { id: IDS.mitchellFamily } }),
      tx.billingAccount.findUnique({ where: { id: IDS.mitchellShellBilling }, include: { _count: { select: { invoices: true, payments: true, ledgerEntries: true } } } }),
      tx.billingAccount.findUnique({ where: { id: IDS.mitchellEmptyBilling }, include: { _count: { select: { invoices: true, payments: true, ledgerEntries: true } } } }),
      tx.guardian.findUnique({ where: { id: IDS.theresa } }),
      tx.child.findUnique({ where: { id: IDS.miles } }),
      tx.family.findUnique({ where: { id: IDS.jurgensShell }, include: { _count: { select: { children: true, guardians: true } } } }),
      tx.family.findUnique({ where: { id: IDS.jurgensFamily } }),
      tx.billingAccount.findUnique({ where: { id: IDS.jurgensShellBilling }, include: { _count: { select: { invoices: true, payments: true, ledgerEntries: true } } } }),
      tx.billingAccount.findUnique({ where: { id: IDS.jurgensBilling }, include: { _count: { select: { invoices: true, payments: true, ledgerEntries: true } } } }),
      tx.guardian.findUnique({ where: { id: IDS.li } }),
    ]);

    invariant(mitchellShell && mitchellFamily && theresa && miles, "Mitchell records drifted or are missing.");
    invariant(jurgensShell && jurgensFamily && jurgensBilling, "Jurgens records drifted or are missing.");
    invariant(li?.familyId === IDS.lutesFamily && li.externalId === "210701", "Li Lutes no longer matches the source-proven guardian.");
    invariant(miles.familyId === IDS.mitchellFamily && miles.enrollmentStatus === "enrolled", "Miles Mitchell is no longer the reviewed enrolled child.");

    await tx.guardian.update({ where: { id: IDS.li }, data: { email: LUTES_CONTACTS[0].email, phone: LUTES_CONTACTS[0].phone, relation: "Mother", isBillingContact: true, customFields: mergedFields(li.customFields, "populate_lutes_contact") } });
    const levi = await tx.guardian.findFirst({ where: { familyId: IDS.lutesFamily, sourceSystem: "procare", externalId: "210702" } });
    if (levi) {
      await tx.guardian.update({ where: { id: levi.id }, data: { fullName: "Levi Lutes", email: LUTES_CONTACTS[1].email, phone: LUTES_CONTACTS[1].phone, relation: "Father", customFields: mergedFields(levi.customFields, "populate_lutes_contact") } });
    } else {
      await tx.guardian.create({ data: { familyId: IDS.lutesFamily, fullName: "Levi Lutes", email: LUTES_CONTACTS[1].email, phone: LUTES_CONTACTS[1].phone, relation: "Father", sourceSystem: "procare", externalId: "210702", customFields: mergedFields(null, "populate_lutes_contact") } });
    }

    if (mitchellShellBilling?.familyId === IDS.mitchellShell) {
      invariant(mitchellShell.centerId === IDS.cordera && mitchellShell.externalId === "MITCHELL", "Mitchell shell identity drifted.");
      invariant(mitchellShell._count.children === 0 && mitchellShell._count.guardians === 0, "Mitchell shell gained related people.");
      invariant(mitchellShellBilling.balanceCents === 9_500 && mitchellShellBilling._count.invoices === 0 && mitchellShellBilling._count.payments === 0 && mitchellShellBilling._count.ledgerEntries === 1, "Mitchell balance shell drifted.");
      invariant(mitchellEmptyBilling?.balanceCents === 0 && mitchellEmptyBilling._count.invoices === 0 && mitchellEmptyBilling._count.payments === 0 && mitchellEmptyBilling._count.ledgerEntries === 0, "Mitchell destination billing account is not empty.");
      await tx.billingAccount.delete({ where: { id: IDS.mitchellEmptyBilling } });
      await tx.billingAccount.update({ where: { id: IDS.mitchellShellBilling }, data: { familyId: IDS.mitchellFamily, customFields: mergedFields(mitchellShellBilling.customFields, "consolidate_mitchell") } });
    } else {
      const final = await tx.billingAccount.findUnique({ where: { familyId: IDS.mitchellFamily } });
      invariant(final?.id === IDS.mitchellShellBilling && final.balanceCents === 9_500, "Mitchell is neither in reviewed nor final state.");
    }
    await tx.family.update({ where: { id: IDS.mitchellFamily }, data: { name: "Mitchell Household", sourceSystem: "procare", externalId: "MITCHELL", customFields: mergedFields(mitchellFamily.customFields, "consolidate_mitchell") } });
    await tx.guardian.update({ where: { id: IDS.theresa }, data: { sourceSystem: "procare", externalId: "1720", isBillingContact: true, customFields: mergedFields(theresa.customFields, "consolidate_mitchell") } });
    await tx.child.update({ where: { id: IDS.miles }, data: { sourceSystem: "procare", externalId: "481", customFields: mergedFields(miles.customFields, "consolidate_mitchell") } });
    await tx.family.update({ where: { id: IDS.mitchellShell }, data: { centerId: null, name: "[Merged] Mitchell balance shell", externalId: "merged:MITCHELL", customFields: mergedFields(mitchellShell.customFields, "archive_mitchell_shell") } });

    if (jurgensShellBilling) {
      invariant(jurgensShell.centerId === IDS.cordera && jurgensShell.externalId === "JURGENS", "Jurgens shell identity drifted.");
      invariant(jurgensShell._count.children === 0 && jurgensShell._count.guardians === 0, "Jurgens shell gained related people.");
      invariant(jurgensShellBilling.balanceCents === 69_000 && jurgensShellBilling._count.invoices === 0 && jurgensShellBilling._count.payments === 0 && jurgensShellBilling._count.ledgerEntries === 1, "Jurgens shell balance drifted.");
      invariant(jurgensBilling.balanceCents === 30_000 && jurgensBilling._count.invoices === 0 && jurgensBilling._count.payments === 0 && jurgensBilling._count.ledgerEntries === 1, "Jurgens destination balance drifted.");
      await tx.ledgerEntry.updateMany({ where: { billingAccountId: IDS.jurgensShellBilling }, data: { billingAccountId: IDS.jurgensBilling, balanceAfterCents: 99_000 } });
      await tx.billingAccount.update({ where: { id: IDS.jurgensBilling }, data: { balanceCents: 99_000, customFields: mergedFields(jurgensBilling.customFields, "consolidate_jurgens_accounts_2248_2374") } });
      await tx.billingAccount.delete({ where: { id: IDS.jurgensShellBilling } });
    } else {
      const final = await tx.billingAccount.findUnique({ where: { id: IDS.jurgensBilling }, include: { _count: { select: { ledgerEntries: true } } } });
      invariant(final?.balanceCents === 99_000 && final._count.ledgerEntries === 2, "Jurgens is neither in reviewed nor final state.");
    }
    await tx.family.update({ where: { id: IDS.jurgensShell }, data: { centerId: null, name: "[Merged] Jurgens hidden account", externalId: "merged:2248", customFields: mergedFields(jurgensShell.customFields, "archive_jurgens_shell") } });
    await tx.family.update({ where: { id: IDS.jurgensFamily }, data: { customFields: mergedFields(jurgensFamily.customFields, "consolidate_jurgens_accounts_2248_2374") } });

    const afterWithdrawn = await withdrawnSnapshot(tx);
    invariant(afterWithdrawn.count === beforeWithdrawn.count && afterWithdrawn.fingerprint === beforeWithdrawn.fingerprint, "A withdrawn child changed; rolling back.");
    const center = await tx.center.findUnique({ where: { id: IDS.cordera }, select: { organization: { select: { tenantId: true } } } });
    invariant(center, "Cordera tenant missing.");
    await tx.auditLog.create({ data: { tenantId: center.organization.tenantId, centerId: IDS.cordera, action: "operations.family_balance_access.consolidated", resource: "Family", resourceId: "2026-08-03", metadata: { source: SOURCE, withdrawnBefore: beforeWithdrawn, withdrawnAfter: afterWithdrawn, mitchellBalanceCents: 9500, jurgensBalanceCents: 99000, invoicesChanged: 0, paymentsChanged: 0 } } });
    return { withdrawnBefore: beforeWithdrawn, withdrawnAfter: afterWithdrawn };
  }, { isolationLevel: "Serializable", maxWait: 10_000, timeout: 30_000 });
}

async function invite(guardianId: string) {
  const existing = await prisma.guardian.findUnique({ where: { id: guardianId }, select: { id: true, fullName: true, email: true, customFields: true, familyId: true, family: { select: { centerId: true } } } });
  invariant(existing?.email && existing.family.centerId, `Invitation guardian ${guardianId} is incomplete.`);
  if (portal(existing.customFields).invitationSentAt) return { guardianId, status: "already_sent" };
  const provisioned = await ensureParentPortalLoginForGuardian({ guardianId, linkedBy: "system:family-balance-access-20260803", linkedReason: SOURCE, resetToInitialPassword: true, inviteMode: DIRECT_PARENT_PORTAL_INVITE_MODE });
  invariant(provisioned.ok, `Portal provisioning failed for ${guardianId}: ${provisioned.ok ? "unknown" : provisioned.reason}`);
  const center = await prisma.center.findUnique({ where: { id: existing.family.centerId }, select: { id: true, name: true, crmLocationId: true, email: true, organization: { select: { name: true, tenantId: true, tenant: { select: { name: true, slug: true } }, brand: { select: { name: true, slug: true } } } } } });
  invariant(center, `Invitation center ${existing.family.centerId} is missing.`);
  const branding = resolveWorkspaceBranding({ tenantName: center.organization.tenant.name, tenantSlug: center.organization.tenant.slug, brandName: center.organization.brand?.name, brandSlug: center.organization.brand?.slug, organizationName: center.organization.name, email: center.email });
  const centerLabel = center.crmLocationId ?? center.name;
  const loginUrl = buildParentLoginSetupUrl(BASE_URL);
  const text = buildParentPortalInvitationText({ guardianName: existing.fullName, centerLabel, email: existing.email, loginUrl, initialPasswordIssued: true, transitioningFromProcare: true, billingCutoverApproved: false });
  const html = buildParentPortalInvitationHtml({ guardianName: existing.fullName, centerLabel, email: existing.email, loginUrl, initialPasswordIssued: true, transitioningFromProcare: true, billingCutoverApproved: false, branding });
  const subject = `${centerLabel}: your BEE Suite Parent Portal is ready`;
  const dedupeBase = `parent-invite:family-balance-access:20260803:${guardianId}`;
  const priorAttempts = await prisma.integrationDelivery.count({ where: { dedupeKey: { startsWith: dedupeBase } } });
  const dedupeKey = priorAttempts === 0 ? dedupeBase : `${dedupeBase}:retry-${priorAttempts}`;
  const result = await sendEmail({ to: [existing.email], subject, text, html, fromName: branding.name, disableClickTracking: true, categories: ["parent_invitation_email"], customArgs: { guardianId, familyId: existing.familyId, centerId: center.id, authorizedFamilyBalanceAccess: true }, tenantId: center.organization.tenantId });
  await recordEmailDeliveryAttempt({ tenantId: center.organization.tenantId, centerId: center.id, dedupeKey, purpose: "parent_invitation_email", to: [existing.email], subject, text, html, fromName: branding.name, result, metadata: { guardianId, familyId: existing.familyId, source: SOURCE, userAuthorizedLiveInvitation: true } });
  invariant(result.ok, `Email provider did not accept invitation for ${guardianId}.`);
  const linked = await prisma.guardian.findMany({ where: { id: { in: provisioned.linkedGuardianIds } }, select: { id: true, customFields: true } });
  await prisma.$transaction(linked.map((item) => prisma.guardian.update({ where: { id: item.id }, data: { customFields: parentPortalInvitationSentFields(item.customFields) } })));
  const loginWorks = await verifySupabasePassword(existing.email, DEFAULT_PARENT_INITIAL_PASSWORD);
  invariant(loginWorks, `First-login verification failed for ${guardianId}.`);
  await writeSystemAuditLog({ tenantId: center.organization.tenantId, centerId: center.id, action: "parent_portal.guardian_invited", resource: "Guardian", resourceId: guardianId, metadata: { familyId: existing.familyId, parentUserId: provisioned.userId, source: SOURCE, emailAcceptedByProvider: true, firstLoginVerified: true, userAuthorizedLiveInvitation: true } });
  return { guardianId, status: "sent_and_login_verified", providerMessageId: result.id ?? null };
}

async function main() {
  invariant(hashFile(CENTENNIAL_RELATIONSHIPS.path) === CENTENNIAL_RELATIONSHIPS.sha256, "The reviewed Centennial relationship source changed.");
  const args = new Set(process.argv.slice(2));
  const before = await state();
  if (!args.has(APPLY)) {
    console.log(JSON.stringify({ mode: "dry-run", sourceHashVerified: true, before, wouldConsolidate: ["Mitchell", "Jurgens"], wouldPopulateLutesGuardians: 2, wouldInviteGuardianIds: [IDS.li, "lutes:210702", IDS.theresa], alreadyInvitedGuardianIds: [IDS.jeyden], withdrawnMutationCount: 0 }, null, 2));
    return;
  }
  invariant(args.has(CONFIRM_REPAIR), `Apply requires ${CONFIRM_REPAIR}.`);
  const repair = await consolidate();
  const results: unknown[] = [];
  if (args.has(SETUP) || args.has(SEND)) {
    invariant(args.has(SETUP), `${SEND} requires ${SETUP}.`);
    const levi = await prisma.guardian.findFirst({ where: { familyId: IDS.lutesFamily, sourceSystem: "procare", externalId: "210702" }, select: { id: true } });
    invariant(levi, "Levi Lutes was not created.");
    const targets = [IDS.li, levi.id, IDS.theresa];
    if (args.has(SEND)) invariant(args.has(CONFIRM_SEND), `Live email requires ${CONFIRM_SEND}.`);
    for (const guardianId of targets) {
      if (args.has(SEND)) results.push(await invite(guardianId));
      else results.push(await ensureParentPortalLoginForGuardian({ guardianId, linkedBy: "system:family-balance-access-20260803", linkedReason: SOURCE, prepareWithoutInvite: true }));
    }
  }
  const after = await state();
  invariant(after.withdrawn.count === before.withdrawn.count && after.withdrawn.fingerprint === before.withdrawn.fingerprint, "Withdrawn snapshot changed outside the transaction.");
  console.log(JSON.stringify({ mode: "applied", repair, portalResults: results, after }, null, 2));
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
