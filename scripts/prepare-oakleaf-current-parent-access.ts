import "./load-env";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { UserRole } from "@prisma/client";
import { writeSystemAuditLog } from "@/lib/audit";
import { currentlyEnrolledChildWhere } from "@/lib/enrollment-status";
import { ensureParentPortalLoginForGuardian, parentPortalAccessDisabled, parentPortalAccessFields } from "@/lib/parent-portal-logins";
import { prisma } from "@/lib/prisma";

const CENTER_ID = "cmp4ew9h2001m6alwxssr4wr6";
const CENTER_NAME = "Kid City USA - Oakleaf";
const SOURCE_SHA256 = "ea0a2df899fe77b75af65f2505a129549d77acc2b048199d2cb751e434f2caf0";
const APPLY = "--apply";
const CONFIRM = "--confirm-oakleaf-parent-access";
const FINGERPRINT = "--confirm-fingerprint=";

const targets = [
  ["cmsnpty8y001djl04y0745dtf", "Correra Family", "Katherine Correra", "SAUNDER", "Correa, Katherine"],
] as const;

const blockedMissingEmail = [
  "Balais Family",
  "Cadet Family",
  "Nsairat Family",
  "Tyler Ramirez Family",
] as const;

function invariant(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stable(item)]));
  }
  return value;
}

function fingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}

function validEmail(value: string | null) {
  return Boolean(value?.trim().match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/));
}

function sourceEmails() {
  const path = process.env.OAKLEAF_PROCARE_ACCOUNT_CSV_PATH?.trim() ?? "";
  invariant(path, "OAKLEAF_PROCARE_ACCOUNT_CSV_PATH is required.");
  const buffer = readFileSync(path);
  invariant(createHash("sha256").update(buffer).digest("hex") === SOURCE_SHA256, "Oakleaf account-information source fingerprint changed.");
  const text = buffer.toString("utf8");
  const result = new Map<string, string>();
  for (const [familyId, , , accountKey, payerName] of targets) {
    const row = text.split(/\r?\n(?=\"Kid City Oakleaf\")/).find((item) => item.includes(`[${accountKey}]`) || item.includes(`[${accountKey}*]`));
    invariant(row, `${payerName} source account row is missing.`);
    invariant(row.toLowerCase().includes(payerName.toLowerCase()), `${payerName} source account payer changed.`);
    const email = [...row.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)]
      .map((match) => match[0].toLowerCase())
      .find((value) => value !== "oakleaf@kidcityusa.com") ?? "";
    invariant(validEmail(email), `${payerName} has no authoritative source email.`);
    result.set(familyId, email);
  }
  return { path, emails: result };
}

async function loadState(source: ReturnType<typeof sourceEmails>) {
  const familyIds = targets.map(([familyId]) => familyId);
  const [center, families, accounts, invoices, payments, ledgerEntries] = await Promise.all([
    prisma.center.findUnique({ where: { id: CENTER_ID }, select: { id: true, name: true, status: true, organization: { select: { tenantId: true } } } }),
    prisma.family.findMany({
      where: { id: { in: familyIds } },
      select: {
        id: true,
        name: true,
        centerId: true,
        children: { where: currentlyEnrolledChildWhere(), select: { id: true, fullName: true } },
        guardians: { select: { id: true, fullName: true, email: true, phone: true, userId: true, customFields: true, user: { select: { id: true, tenantId: true, role: true, isActive: true } } } },
        billingAccount: { select: { id: true, balanceCents: true } },
      },
      orderBy: { id: "asc" },
    }),
    prisma.billingAccount.findMany({ where: { family: { centerId: CENTER_ID } }, select: { id: true, familyId: true, balanceCents: true }, orderBy: { id: "asc" } }),
    prisma.invoice.findMany({ where: { billingAccount: { family: { centerId: CENTER_ID } } }, select: { id: true }, orderBy: { id: "asc" } }),
    prisma.payment.findMany({ where: { billingAccount: { family: { centerId: CENTER_ID } } }, select: { id: true }, orderBy: { id: "asc" } }),
    prisma.ledgerEntry.findMany({ where: { billingAccount: { family: { centerId: CENTER_ID } } }, select: { id: true }, orderBy: { id: "asc" } }),
  ]);
  invariant(center?.name === CENTER_NAME && center.status === "active", "Oakleaf center identity or status changed.");
  invariant(families.length === targets.length, "An Oakleaf parent-access target family is missing.");
  const targetGuardians = targets.map(([familyId, familyName, guardianName]) => {
    const family = families.find((item) => item.id === familyId);
    invariant(family?.name === familyName && family.centerId === CENTER_ID, `${familyName} identity changed.`);
    invariant(family.children.length > 0, `${familyName} has no current child.`);
    invariant(family.guardians.length === 1, `${familyName} no longer has exactly one reviewed guardian.`);
    const guardian = family.guardians[0];
    invariant(guardian.fullName.trim().toLowerCase() === guardianName.toLowerCase(), `${guardianName} identity changed.`);
    const sourceEmail = source.emails.get(familyId) ?? "";
    invariant(validEmail(sourceEmail), `${guardianName} source email is missing.`);
    invariant(!validEmail(guardian.email) || guardian.email!.trim().toLowerCase() === sourceEmail, `${guardianName} gained a conflicting email.`);
    invariant((guardian.phone ?? "").replace(/\D/g, "").length >= 4, `${guardianName} needs a reviewed phone/PIN source.`);
    invariant(!guardian.userId || (guardian.user?.tenantId === center.organization.tenantId && guardian.user.role === UserRole.PARENT_GUARDIAN), `${guardianName} has a conflicting app-user link.`);
    return { familyId, familyName, guardianId: guardian.id, guardianName, sourceEmail, currentEmailReady: validEmail(guardian.email), currentUserId: guardian.userId, currentUserActive: guardian.user?.isActive ?? false, currentAccessDisabled: parentPortalAccessDisabled(guardian.customFields) };
  });
  invariant(new Set(targetGuardians.map((guardian) => guardian.sourceEmail)).size === targetGuardians.length, "Oakleaf parent-access targets contain a duplicate email across families.");
  const state = {
    targetGuardians,
    accountBalances: accounts,
    invoiceIds: invoices.map((invoice) => invoice.id),
    paymentIds: payments.map((payment) => payment.id),
    ledgerEntryIds: ledgerEntries.map((entry) => entry.id),
  };
  return { center, state, fingerprint: fingerprint({ centerId: CENTER_ID, targets, state }) };
}

async function main() {
  const startedAt = new Date();
  const source = sourceEmails();
  const before = await loadState(source);
  const applyRequested = process.argv.includes(APPLY);
  console.log(JSON.stringify({
    mode: applyRequested ? "apply-preflight" : "dry-run",
    center: { id: before.center.id, name: before.center.name, status: before.center.status },
    source: { sha256: SOURCE_SHA256, matchedEmails: source.emails.size },
    fingerprint: before.fingerprint,
    targets: before.state.targetGuardians.map((guardian) => ({ familyName: guardian.familyName, guardianName: guardian.guardianName, alreadyActive: Boolean(guardian.currentUserId && guardian.currentUserActive) })),
    planned: { parentAccountsToPrepare: before.state.targetGuardians.filter((guardian) => !(guardian.currentUserId && guardian.currentUserActive)).length, heldMissingAuthoritativeEmail: blockedMissingEmail, invitationsToSend: 0, billingChanges: 0 },
  }, null, 2));
  if (!applyRequested) return;
  invariant(process.argv.includes(CONFIRM), `Apply requires ${CONFIRM}.`);
  const expectedFingerprint = process.argv.find((arg) => arg.startsWith(FINGERPRINT))?.slice(FINGERPRINT.length) ?? "";
  invariant(expectedFingerprint === before.fingerprint, "Oakleaf parent-access state changed; rerun the dry run.");

  let prepared = 0;
  let alreadyActive = 0;
  let guardianEmailsReconciled = 0;
  for (const target of before.state.targetGuardians) {
    if (target.currentUserId && target.currentUserActive) {
      alreadyActive += 1;
      continue;
    }
    if (!target.currentEmailReady) {
      const guardian = await prisma.guardian.findUnique({ where: { id: target.guardianId }, select: { email: true, customFields: true } });
      invariant(guardian && !validEmail(guardian.email), `${target.guardianName} email changed during apply.`);
      await prisma.guardian.update({
        where: { id: target.guardianId },
        data: {
          email: target.sourceEmail,
          customFields: {
            ...(guardian.customFields && typeof guardian.customFields === "object" && !Array.isArray(guardian.customFields) ? guardian.customFields : {}),
            oakleafContactEvidence: { sourceSha256: SOURCE_SHA256, sourceAsOf: "2026-08-02", accountInformationPayer: target.guardianName, emailReconciled: true },
          },
        },
      });
      guardianEmailsReconciled += 1;
    }
    if (target.currentAccessDisabled) {
      const guardian = await prisma.guardian.findUnique({ where: { id: target.guardianId }, select: { customFields: true } });
      invariant(guardian && parentPortalAccessDisabled(guardian.customFields), `${target.guardianName} access state changed during apply.`);
      await prisma.guardian.update({
        where: { id: target.guardianId },
        data: { customFields: parentPortalAccessFields({ customFields: guardian.customFields, enabled: true, actorEmail: "brenden@kidcityusa.com" }) },
      });
    }
    const result = await ensureParentPortalLoginForGuardian({
      guardianId: target.guardianId,
      linkedBy: "system:oakleaf-current-family-visibility",
      linkedReason: "oakleaf_current_parent_access_prepared_without_invite",
      prepareWithoutInvite: true,
    });
    invariant(result.ok, `${target.guardianName} parent access failed: ${"reason" in result ? result.reason : "unknown"}.`);
    await writeSystemAuditLog({
      tenantId: before.center.organization.tenantId,
      centerId: CENTER_ID,
      action: "parent_portal.oakleaf_account_prepared",
      resource: "Guardian",
      resourceId: target.guardianId,
      metadata: { familyId: target.familyId, parentUserId: result.userId, linkedGuardianCount: result.linkedGuardianIds.length, created: result.created, reactivated: result.reactivated, credentialCreated: result.credentialCreated, invitationSent: false },
    });
    prepared += 1;
  }

  const after = await loadState(source);
  invariant(after.state.targetGuardians.every((guardian) => guardian.currentUserId && guardian.currentUserActive), "One or more Oakleaf guardians still lack active parent access.");
  invariant(JSON.stringify(after.state.accountBalances) === JSON.stringify(before.state.accountBalances), "An Oakleaf balance changed while preparing parent access.");
  invariant(JSON.stringify(after.state.invoiceIds) === JSON.stringify(before.state.invoiceIds), "An Oakleaf invoice changed while preparing parent access.");
  invariant(JSON.stringify(after.state.paymentIds) === JSON.stringify(before.state.paymentIds), "An Oakleaf payment changed while preparing parent access.");
  invariant(JSON.stringify(after.state.ledgerEntryIds) === JSON.stringify(before.state.ledgerEntryIds), "An Oakleaf ledger entry changed while preparing parent access.");
  const [invitationAuditCount, invitationDeliveryCount] = await Promise.all([
    prisma.auditLog.count({ where: { createdAt: { gte: startedAt }, action: { in: ["parent_portal.guardian_invited", "parent_portal.guide_sent"] } } }),
    prisma.integrationDelivery.count({ where: { createdAt: { gte: startedAt }, purpose: { in: ["parent_invitation_email", "parent_guide_email"] } } }),
  ]);
  invariant(invitationAuditCount === 0 && invitationDeliveryCount === 0, "Unexpected invitation activity occurred during Oakleaf parent-access preparation.");
  console.log(JSON.stringify({ ok: true, guardianEmailsReconciled, prepared, alreadyActive, activeParentFamilies: after.state.targetGuardians.length, heldMissingAuthoritativeEmail: blockedMissingEmail.length, invitationsSent: 0, balancesChanged: 0, invoicesChanged: 0, paymentsChanged: 0, ledgerEntriesChanged: 0 }, null, 2));
}

void main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
