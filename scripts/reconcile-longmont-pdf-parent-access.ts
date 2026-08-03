import "./load-env";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient, type User as SupabaseUser } from "@supabase/supabase-js";
import { UserRole } from "@prisma/client";
import { writeSystemAuditLog } from "@/lib/audit";
import { resolveWorkspaceBranding } from "@/lib/brand-assets";
import { defaultGuardianPinUpdate } from "@/lib/guardian-kiosk-pin";
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
  parentPortalAccessDisabled,
  parentPortalInvitationSentFields,
} from "@/lib/parent-portal-logins";
import { prisma } from "@/lib/prisma";
import { getSupabaseAuthConfig, verifySupabasePassword } from "@/lib/supabase-auth";

const APPLY_FLAG = "--apply";
const CONFIRM_RECONCILIATION_FLAG = "--confirm-longmont-pdf-reconciliation";
const CONFIRM_PAYMENTS_FLAG = "--confirm-preserve-payments-and-invoices";
const CONFIRM_PASSWORD_FLAG = "--confirm-reset-invited-parent-passwords";
const CENTER_ID = "cmp4ew6f3000a6alwmz62n7w2";
const CENTER_LABEL = "Kid City USA - CO | Longmont";
const CORPORATE_ACTOR_EMAIL = "corpschools@kidcityusa.com";
const DEFAULT_BASE_URL = "https://thebeesuite.io";
const EXPECTED_PLAN_SHA256 = "2d5eead927b7a76d508b2fe9fdb0a90005e04750c24459c755a46ab51ffca986";
const SOURCE_PDF_SHA256 = "ac04f12c3c011041d2ea60a6fe33bbaf36c564906a10d49b3eb35a746a974b78";
const EXPECTED_PDF_ROWS = 135;
const EXPECTED_PDF_TOTAL_CENTS = 1_858_610;
const EXPECTED_MATCHED_ROWS = 123;
const EXPECTED_MATCHED_FAMILIES = 115;
const EXPECTED_MATCHED_CENTS = 1_654_910;
const EXPECTED_UNRESOLVED_CENTS = 203_700;
const EXPECTED_ACCEPTED_DELIVERY_EMAILS = 62;
const EXPECTED_EXISTING_INVITES = 61;
const EXPECTED_NEW_INVITES = 7;

type SourceRow = {
  section: "visible" | "hidden";
  key: string;
  payer: string;
  balanceCents: number;
  accountId: string;
  accountIds: string[];
  personId: string;
  sourceEmail: string;
  sourceHidden: string;
  sourceBalanceCents: number;
};

type SourcePlan = {
  sourcePdf: string;
  asOf: string;
  rows: SourceRow[];
  errors: unknown[];
};

type Args = {
  apply: boolean;
  confirmReconciliation: boolean;
  confirmPayments: boolean;
  confirmPassword: boolean;
};

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizedEmail(value: unknown) {
  return clean(value).toLowerCase();
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalizedName(value: unknown) {
  return clean(value)
    .toLowerCase()
    .replace(/\bhousehold\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizedKey(value: unknown) {
  return clean(value).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function phoneReady(value: unknown) {
  return clean(value).replace(/\D/g, "").length >= 4;
}

function activeAuthUser(user: SupabaseUser | undefined) {
  return Boolean(
    user?.email_confirmed_at
    && (!user.banned_until || new Date(user.banned_until) <= new Date()),
  );
}

function parseArgs(argv = process.argv.slice(2)): Args {
  const result: Args = {
    apply: false,
    confirmReconciliation: false,
    confirmPayments: false,
    confirmPassword: false,
  };
  for (const arg of argv) {
    if (arg === APPLY_FLAG) result.apply = true;
    else if (arg === CONFIRM_RECONCILIATION_FLAG) result.confirmReconciliation = true;
    else if (arg === CONFIRM_PAYMENTS_FLAG) result.confirmPayments = true;
    else if (arg === CONFIRM_PASSWORD_FLAG) result.confirmPassword = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  if (result.apply && (!result.confirmReconciliation || !result.confirmPayments || !result.confirmPassword)) {
    throw new Error(
      `Live reconciliation requires ${APPLY_FLAG} ${CONFIRM_RECONCILIATION_FLAG} ${CONFIRM_PAYMENTS_FLAG} ${CONFIRM_PASSWORD_FLAG}.`,
    );
  }
  return result;
}

function readSourcePlan() {
  const path = clean(process.env.LONGMONT_BALANCE_PLAN_PATH);
  invariant(path, "LONGMONT_BALANCE_PLAN_PATH is required.");
  const raw = readFileSync(path, "utf8");
  const sha256 = createHash("sha256").update(raw).digest("hex");
  invariant(sha256 === EXPECTED_PLAN_SHA256, "The Longmont balance plan does not match the reviewed PDF extraction.");
  const plan = JSON.parse(raw) as SourcePlan;
  invariant(Array.isArray(plan.errors) && plan.errors.length === 0, "The Longmont source plan contains extraction errors.");
  invariant(plan.asOf === "2026-08-09", `Expected PDF as-of date 2026-08-09; found ${plan.asOf}.`);
  invariant(plan.rows.length === EXPECTED_PDF_ROWS, `Expected ${EXPECTED_PDF_ROWS} PDF rows; found ${plan.rows.length}.`);
  invariant(
    plan.rows.reduce((sum, row) => sum + row.balanceCents, 0) === EXPECTED_PDF_TOTAL_CENTS,
    "The PDF balance total changed.",
  );
  invariant(plan.rows.filter((row) => row.section === "visible").length === 57, "Expected 57 visible PDF accounts.");
  invariant(plan.rows.filter((row) => row.section === "hidden").length === 78, "Expected 78 hidden PDF accounts.");
  invariant(plan.rows.every((row) => clean(row.key) && clean(row.payer) && Number.isInteger(row.balanceCents)), "A PDF row is incomplete.");
  return { path, plan, sha256 };
}

async function listAuthUsers() {
  const { url, key } = getSupabaseAuthConfig("service");
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const users = new Map<string, SupabaseUser>();
  for (let page = 1; page <= 30; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    for (const user of data.users) {
      const email = normalizedEmail(user.email);
      if (email) users.set(email, user);
    }
    if (data.users.length < 1000) break;
  }
  return users;
}

async function loadState() {
  const center = await prisma.center.findUnique({
    where: { id: CENTER_ID },
    select: {
      id: true,
      name: true,
      crmLocationId: true,
      status: true,
      email: true,
      customFields: true,
      organizationId: true,
      organization: {
        select: {
          name: true,
          tenantId: true,
          tenant: { select: { name: true, slug: true } },
          brand: { select: { name: true, slug: true } },
        },
      },
    },
  });
  invariant(center, "Longmont center not found.");
  invariant(center.status === "active", `Expected active Longmont center; found ${center.status}.`);
  invariant((center.crmLocationId ?? center.name).includes("Longmont"), "The target center is not Longmont.");

  const families = await prisma.family.findMany({
    where: { centerId: CENTER_ID, sourceSystem: { equals: "procare", mode: "insensitive" } },
    select: {
      id: true,
      name: true,
      externalId: true,
      customFields: true,
      billingAccount: {
        select: {
          id: true,
          balanceCents: true,
          sourceSystem: true,
          externalId: true,
          customFields: true,
          payments: { select: { id: true } },
          invoices: { select: { id: true } },
          ledgerEntries: { select: { id: true, sourceSystem: true, externalId: true, balanceAfterCents: true } },
        },
      },
      children: { select: { enrollmentStatus: true, sourceSystem: true, externalId: true } },
      guardians: {
        select: {
          id: true,
          fullName: true,
          email: true,
          phone: true,
          isBillingContact: true,
          sourceSystem: true,
          externalId: true,
          userId: true,
          customFields: true,
          checkInPinHash: true,
        },
      },
      pickups: { select: { sourceSystem: true, externalId: true } },
    },
  });
  return { center, families };
}

type LoadedState = Awaited<ReturnType<typeof loadState>>;
type FamilyRecord = LoadedState["families"][number];

function activeVerifiedChild(family: FamilyRecord) {
  return family.children.some((child) => (
    ["enrolled", "pending", "waitlisted", "tour_scheduled", "summer_break"].includes(clean(child.enrollmentStatus).toLowerCase())
    && clean(child.sourceSystem).toLowerCase() === "procare"
    && Boolean(clean(child.externalId))
  ));
}

function scoreFamily(row: SourceRow, family: FamilyRecord) {
  let score = 0;
  if (normalizedKey(family.externalId) === normalizedKey(row.key)) score += 16;
  if (normalizedName(family.name) === normalizedName(row.payer)) score += 8;
  if (family.guardians.some((guardian) => clean(guardian.externalId) === row.personId)) score += 12;
  if (family.guardians.some((guardian) => normalizedName(guardian.fullName) === normalizedName(row.payer))) score += 6;
  if (row.sourceEmail && family.guardians.some((guardian) => normalizedEmail(guardian.email) === normalizedEmail(row.sourceEmail))) score += 4;
  const evidenceScore = score;
  if (evidenceScore && row.section === "visible" && activeVerifiedChild(family)) score += 2;
  return { score, evidenceScore };
}

function mapRows(source: SourcePlan, state: LoadedState) {
  const mapped: Array<{ row: SourceRow; family: FamilyRecord }> = [];
  const unresolved: SourceRow[] = [];
  for (const row of source.rows) {
    const scored = state.families
      .map((family) => ({ family, ...scoreFamily(row, family) }))
      .filter((item) => item.evidenceScore > 0)
      .sort((left, right) => right.score - left.score);
    const top = scored[0];
    const ties = top ? scored.filter((item) => item.score === top.score) : [];
    if (ties.length === 1) mapped.push({ row, family: top.family });
    else unresolved.push(row);
  }

  const unresolvedIdentity = unresolved.map((row) => `${row.section}:${row.key}:${row.balanceCents}`).sort();
  const expectedUnresolved = [
    "hidden:BERNAL:7500",
    "hidden:BRADY:6800",
    "hidden:CANO:52800",
    "hidden:DESIGNOR:-5000",
    "hidden:KEYS:15000",
    "hidden:KRAMMERS:23400",
    "hidden:ORLOFF:20800",
    "hidden:WILLIAMS:40300",
    "hidden:YOUNG:42100",
    "visible:BOSCO:0",
    "visible:HARDY:0",
    "visible:MONROE:0",
  ].sort();
  invariant(JSON.stringify(unresolvedIdentity) === JSON.stringify(expectedUnresolved), "The unresolved PDF account set changed.");
  invariant(mapped.length === EXPECTED_MATCHED_ROWS, `Expected ${EXPECTED_MATCHED_ROWS} mapped rows; found ${mapped.length}.`);
  invariant(unresolved.reduce((sum, row) => sum + row.balanceCents, 0) === EXPECTED_UNRESOLVED_CENTS, "The unresolved balance total changed.");

  const byFamily = new Map<string, { family: FamilyRecord; rows: SourceRow[]; desiredCents: number }>();
  for (const item of mapped) {
    const current = byFamily.get(item.family.id) ?? { family: item.family, rows: [], desiredCents: 0 };
    current.rows.push(item.row);
    current.desiredCents += item.row.balanceCents;
    byFamily.set(item.family.id, current);
  }
  const balances = [...byFamily.values()];
  invariant(balances.length === EXPECTED_MATCHED_FAMILIES, `Expected ${EXPECTED_MATCHED_FAMILIES} mapped families; found ${balances.length}.`);
  invariant(balances.reduce((sum, item) => sum + item.desiredCents, 0) === EXPECTED_MATCHED_CENTS, "The mapped balance total changed.");
  return { mapped, unresolved, balances };
}

function recipientsFromPayload(payload: unknown) {
  const to = record(payload).to;
  return Array.isArray(to) ? to.map(normalizedEmail).filter(validEmail) : [];
}

function guardianIdFromPayload(payload: unknown) {
  return clean(record(payload).guardianId);
}

function verifiedParentPayer(family: FamilyRecord, guardian: FamilyRecord["guardians"][number]) {
  if (guardian.isBillingContact) return true;
  const externalId = clean(guardian.externalId);
  if (clean(guardian.sourceSystem).toLowerCase() !== "procare" || !externalId) return false;
  return family.pickups.some((pickup) => (
    clean(pickup.sourceSystem).toLowerCase() === "procare" && clean(pickup.externalId) === externalId
  ));
}

async function buildAccessPlan(state: LoadedState, mapped: ReturnType<typeof mapRows>["mapped"]) {
  const deliveries = await prisma.integrationDelivery.findMany({
    where: { centerId: CENTER_ID, purpose: "parent_invitation_email", status: { in: ["accepted", "delivered"] } },
    select: { payload: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  const latestDeliveryByEmail = new Map<string, (typeof deliveries)[number]>();
  for (const delivery of deliveries) {
    for (const email of recipientsFromPayload(delivery.payload)) {
      if (!latestDeliveryByEmail.has(email)) latestDeliveryByEmail.set(email, delivery);
    }
  }
  invariant(latestDeliveryByEmail.size === EXPECTED_ACCEPTED_DELIVERY_EMAILS, `Expected ${EXPECTED_ACCEPTED_DELIVERY_EMAILS} accepted Longmont delivery emails; found ${latestDeliveryByEmail.size}.`);

  const familyById = new Map(state.families.map((family) => [family.id, family]));
  const existingTargets: Array<{ email: string; guardianId: string }> = [];
  const unmatchedDeliveryEmails: string[] = [];
  for (const [email, delivery] of latestDeliveryByEmail) {
    const payloadGuardianId = guardianIdFromPayload(delivery.payload);
    const guardians = state.families.flatMap((family) => family.guardians.map((guardian) => ({ family, guardian })));
    const match = guardians.find((item) => item.guardian.id === payloadGuardianId && normalizedEmail(item.guardian.email) === email)
      ?? guardians.find((item) => normalizedEmail(item.guardian.email) === email);
    if (!match) {
      unmatchedDeliveryEmails.push(email);
      continue;
    }
    invariant(verifiedParentPayer(match.family, match.guardian), `Accepted Longmont delivery ${email} is no longer a verified parent/payer.`);
    existingTargets.push({ email, guardianId: match.guardian.id });
  }
  invariant(existingTargets.length === EXPECTED_EXISTING_INVITES, `Expected ${EXPECTED_EXISTING_INVITES} accepted Longmont guardian accounts; found ${existingTargets.length}.`);
  invariant(unmatchedDeliveryEmails.length === 1, "The known historical Longmont test delivery set changed.");

  const additionalByEmail = new Map<string, { email: string; guardianId: string; familyId: string }>();
  for (const item of mapped.filter((candidate) => candidate.row.section === "visible")) {
    const email = normalizedEmail(item.row.sourceEmail);
    if (!validEmail(email) || latestDeliveryByEmail.has(email) || additionalByEmail.has(email)) continue;
    const matching = item.family.guardians.filter((guardian) => (
      clean(guardian.externalId) === item.row.personId || normalizedEmail(guardian.email) === email
    ));
    const exactProfile = matching.filter((guardian) => normalizedEmail(guardian.email) === email);
    if (exactProfile.length !== 1) continue;
    const guardian = exactProfile[0];
    if (!verifiedParentPayer(item.family, guardian) || !phoneReady(guardian.phone) || parentPortalAccessDisabled(guardian.customFields)) continue;
    additionalByEmail.set(email, { email, guardianId: guardian.id, familyId: item.family.id });
  }
  const additionalTargets = [...additionalByEmail.values()];
  invariant(additionalTargets.length === EXPECTED_NEW_INVITES, `Expected ${EXPECTED_NEW_INVITES} additional Longmont invites; found ${additionalTargets.length}.`);

  const targetEmails = [...new Set([...existingTargets.map((item) => item.email), ...additionalTargets.map((item) => item.email)])];
  const [users, authUsers, globalGuardians] = await Promise.all([
    prisma.user.findMany({
      where: { email: { in: targetEmails } },
      select: { id: true, email: true, tenantId: true, role: true, isActive: true },
    }),
    listAuthUsers(),
    prisma.guardian.findMany({
      where: { email: { in: additionalTargets.map((item) => item.email), mode: "insensitive" } },
      select: {
        id: true,
        fullName: true,
        email: true,
        sourceSystem: true,
        externalId: true,
        isBillingContact: true,
        customFields: true,
        family: {
          select: {
            id: true,
            centerId: true,
            sourceSystem: true,
            externalId: true,
            pickups: { select: { sourceSystem: true, externalId: true } },
          },
        },
      },
    }),
  ]);
  const userByEmail = new Map(users.map((user) => [normalizedEmail(user.email), user]));
  for (const email of targetEmails) {
    const user = userByEmail.get(email);
    const authUser = authUsers.get(email);
    if (user) {
      invariant(user.tenantId === state.center.organization.tenantId, `${email} belongs to another tenant.`);
      invariant(user.role === UserRole.PARENT_GUARDIAN && user.isActive, `${email} is not an active parent user.`);
    }
    invariant(!authUser || activeAuthUser(authUser), `${email} has an inactive Supabase Auth identity.`);
    invariant(!authUser || Boolean(user), `${email} has an orphaned Supabase Auth identity.`);
  }
  for (const target of additionalTargets) {
    const targetGuardian = state.families
      .flatMap((family) => family.guardians)
      .find((guardian) => guardian.id === target.guardianId);
    invariant(targetGuardian, `${target.email} lost its source-matched guardian profile.`);
    const matches = globalGuardians.filter((guardian) => normalizedEmail(guardian.email) === target.email);
    invariant(matches.length > 0, `${target.email} has no guardian profile.`);
    invariant(matches.every((guardian) => guardian.family.centerId === CENTER_ID), `${target.email} crosses center boundaries.`);
    invariant(matches.every((guardian) => (
      clean(guardian.sourceSystem).toLowerCase() === "procare"
      && Boolean(clean(guardian.externalId))
      && clean(guardian.family.sourceSystem).toLowerCase() === "procare"
      && Boolean(clean(guardian.family.externalId))
      && !parentPortalAccessDisabled(guardian.customFields)
      && (
        guardian.isBillingContact
        || guardian.family.pickups.some((pickup) => (
          clean(pickup.sourceSystem).toLowerCase() === "procare"
          && clean(pickup.externalId) === clean(guardian.externalId)
        ))
        || (
          clean(guardian.externalId) === clean(targetGuardian.externalId)
          && normalizedName(guardian.fullName) === normalizedName(targetGuardian.fullName)
        )
      )
    )), `${target.email} has a matching record outside verified parent/payer scope.`);
    invariant(familyById.has(target.familyId), `${target.email} resolved outside the Longmont family plan.`);
  }
  return { existingTargets, additionalTargets, targetEmails };
}

async function applyBalances(
  state: LoadedState,
  balancePlan: ReturnType<typeof mapRows>["balances"],
  actorUserId: string,
) {
  const paymentCountBefore = balancePlan.reduce((sum, item) => sum + (item.family.billingAccount?.payments.length ?? 0), 0);
  const invoiceCountBefore = balancePlan.reduce((sum, item) => sum + (item.family.billingAccount?.invoices.length ?? 0), 0);
  invariant(paymentCountBefore === 0, "Longmont matched families now contain payments; stopping before balance mutation.");
  const appliedAt = new Date();
  let createdAccounts = 0;
  let updatedAccounts = 0;
  let createdLedgerEntries = 0;

  await prisma.$transaction(async (tx) => {
    for (const item of balancePlan) {
      const current = await tx.billingAccount.findUnique({
        where: { familyId: item.family.id },
        select: {
          id: true,
          balanceCents: true,
          sourceSystem: true,
          externalId: true,
          customFields: true,
          _count: { select: { payments: true, invoices: true } },
        },
      });
      invariant((current?._count.payments ?? 0) === 0, `Family ${item.family.id} gained a payment during reconciliation.`);
      invariant((current?._count.invoices ?? 0) === (item.family.billingAccount?.invoices.length ?? 0), `Family ${item.family.id} invoice state changed during reconciliation.`);
      const previousBalanceCents = current?.balanceCents ?? 0;
      const sourceKeys = item.rows.map((row) => row.key).sort();
      const account = await tx.billingAccount.upsert({
        where: { familyId: item.family.id },
        update: {
          balanceCents: item.desiredCents,
          ledgerSyncedAt: appliedAt,
          sourceSystem: current?.sourceSystem ?? "procare",
          externalId: current?.externalId ?? `longmont-pdf:${item.family.id}`,
          customFields: {
            ...record(current?.customFields),
            longmontPdfBalance: {
              sourcePdfSha256: SOURCE_PDF_SHA256,
              sourcePlanSha256: EXPECTED_PLAN_SHA256,
              sourceAsOf: "2026-08-09",
              sourceAccountKeys: sourceKeys,
              reconciledAt: appliedAt.toISOString(),
              paymentsMutated: false,
              invoicesMutated: false,
            },
          },
        },
        create: {
          familyId: item.family.id,
          balanceCents: item.desiredCents,
          ledgerSyncedAt: appliedAt,
          sourceSystem: "procare",
          externalId: `longmont-pdf:${item.family.id}`,
          customFields: {
            longmontPdfBalance: {
              sourcePdfSha256: SOURCE_PDF_SHA256,
              sourcePlanSha256: EXPECTED_PLAN_SHA256,
              sourceAsOf: "2026-08-09",
              sourceAccountKeys: sourceKeys,
              reconciledAt: appliedAt.toISOString(),
              paymentsMutated: false,
              invoicesMutated: false,
            },
          },
        },
        select: { id: true },
      });
      if (current) updatedAccounts += 1;
      else createdAccounts += 1;

      const ledgerExternalId = `longmont-pdf-balance:2026-08-09:${item.family.id}`;
      const existingLedger = await tx.ledgerEntry.findUnique({
        where: { sourceSystem_externalId: { sourceSystem: "procare", externalId: ledgerExternalId } },
        select: { id: true, billingAccountId: true, balanceAfterCents: true },
      });
      if (existingLedger) {
        invariant(existingLedger.billingAccountId === account.id, `Existing reconciliation ledger entry belongs to another account for ${item.family.id}.`);
        invariant(existingLedger.balanceAfterCents === item.desiredCents, `Existing reconciliation ledger balance differs for ${item.family.id}.`);
      } else {
        await tx.ledgerEntry.create({
          data: {
            billingAccountId: account.id,
            type: "procare_balance_reconciliation",
            description: "Longmont ProCare balance reconciled from account summary PDF",
            amountCents: item.desiredCents - previousBalanceCents,
            balanceAfterCents: item.desiredCents,
            effectiveAt: appliedAt,
            sourceSystem: "procare",
            externalId: ledgerExternalId,
            metadata: {
              centerId: CENTER_ID,
              sourcePdfSha256: SOURCE_PDF_SHA256,
              sourcePlanSha256: EXPECTED_PLAN_SHA256,
              sourceAsOf: "2026-08-09",
              sourceAccountKeys: sourceKeys,
              previousBalanceCents,
              reconciledBalanceCents: item.desiredCents,
              paymentsMutated: false,
              invoicesMutated: false,
            },
          },
        });
        await tx.auditLog.create({
          data: {
            tenantId: state.center.organization.tenantId,
            centerId: CENTER_ID,
            userId: null,
            action: "billing.longmont_pdf_balance_reconciled",
            resource: "Family",
            resourceId: item.family.id,
            metadata: {
              authorizedActorUserId: actorUserId,
              sourcePdfSha256: SOURCE_PDF_SHA256,
              sourcePlanSha256: EXPECTED_PLAN_SHA256,
              sourceAsOf: "2026-08-09",
              sourceAccountKeys: sourceKeys,
              previousBalanceCents,
              reconciledBalanceCents: item.desiredCents,
              paymentsMutated: false,
              invoicesMutated: false,
            },
          },
        });
        createdLedgerEntries += 1;
      }
    }
  }, { maxWait: 10_000, timeout: 180_000 });

  const verified = await prisma.billingAccount.findMany({
    where: { familyId: { in: balancePlan.map((item) => item.family.id) } },
    select: { familyId: true, balanceCents: true, _count: { select: { payments: true, invoices: true } } },
  });
  const expectedByFamily = new Map(balancePlan.map((item) => [item.family.id, item.desiredCents]));
  invariant(verified.length === EXPECTED_MATCHED_FAMILIES, "Not every matched Longmont family has a billing account after reconciliation.");
  invariant(verified.every((account) => account.balanceCents === expectedByFamily.get(account.familyId)), "A reconciled Longmont balance does not match the PDF plan.");
  invariant(verified.reduce((sum, account) => sum + account._count.payments, 0) === paymentCountBefore, "Longmont payments changed during reconciliation.");
  invariant(verified.reduce((sum, account) => sum + account._count.invoices, 0) === invoiceCountBefore, "Longmont invoices changed during reconciliation.");
  return { createdAccounts, updatedAccounts, createdLedgerEntries, paymentCountBefore, invoiceCountBefore };
}

async function resetAndVerifyExistingAccess(
  targets: Awaited<ReturnType<typeof buildAccessPlan>>["existingTargets"],
  actorUserId: string,
  tenantId: string,
) {
  let verified = 0;
  for (const target of targets) {
    const result = await ensureParentPortalLoginForGuardian({
      guardianId: target.guardianId,
      linkedBy: "system:longmont-pdf-parent-access",
      linkedReason: "longmont_pdf_existing_invite_password_reset_authorized_by_user",
      resetToInitialPassword: true,
      inviteMode: DIRECT_PARENT_PORTAL_INVITE_MODE,
    });
    if (!result.ok) throw new Error(`Existing Longmont parent access reset failed: ${result.reason}`);
    const loginWorks = await verifySupabasePassword(target.email, DEFAULT_PARENT_INITIAL_PASSWORD);
    invariant(loginWorks, `Existing Longmont parent password verification failed for ${target.email}.`);
    await writeSystemAuditLog({
      tenantId,
      centerId: CENTER_ID,
      action: "parent_portal.longmont_pdf_password_verified",
      resource: "Guardian",
      resourceId: target.guardianId,
      metadata: {
        parentUserId: result.userId,
        authorizedActorUserId: actorUserId,
        sourcePdfSha256: SOURCE_PDF_SHA256,
        initialPasswordVerified: true,
        invitationResent: false,
      },
    });
    verified += 1;
  }
  return verified;
}

async function sendAdditionalInvites(
  state: LoadedState,
  targets: Awaited<ReturnType<typeof buildAccessPlan>>["additionalTargets"],
  actorUserId: string,
) {
  const branding = resolveWorkspaceBranding({
    tenantName: state.center.organization.tenant.name,
    tenantSlug: state.center.organization.tenant.slug,
    brandName: state.center.organization.brand?.name,
    brandSlug: state.center.organization.brand?.slug,
    organizationName: state.center.organization.name,
    email: state.center.email,
  });
  let accepted = 0;
  let verified = 0;
  for (const target of targets) {
    const guardian = state.families.flatMap((family) => family.guardians).find((item) => item.id === target.guardianId);
    invariant(guardian, `Additional Longmont guardian ${target.guardianId} disappeared.`);
    const provisioned = await ensureParentPortalLoginForGuardian({
      guardianId: target.guardianId,
      linkedBy: "system:longmont-pdf-parent-access",
      linkedReason: "longmont_pdf_primary_payer_invitation_authorized_by_user",
      resetToInitialPassword: true,
      inviteMode: DIRECT_PARENT_PORTAL_INVITE_MODE,
    });
    if (!provisioned.ok) throw new Error(`Additional Longmont parent provisioning failed: ${provisioned.reason}`);
    if (!guardian.checkInPinHash) {
      const pinData = defaultGuardianPinUpdate({ guardianId: guardian.id, phone: guardian.phone, setById: actorUserId });
      invariant(pinData, `Additional Longmont guardian ${guardian.id} has no secure default PIN source.`);
      await prisma.guardian.update({ where: { id: guardian.id }, data: pinData });
    }
    const loginUrl = buildParentLoginSetupUrl(DEFAULT_BASE_URL);
    const text = buildParentPortalInvitationText({
      guardianName: guardian.fullName,
      centerLabel: CENTER_LABEL,
      email: target.email,
      loginUrl,
      initialPasswordIssued: true,
      transitioningFromProcare: true,
      billingCutoverApproved: false,
    });
    const html = buildParentPortalInvitationHtml({
      guardianName: guardian.fullName,
      centerLabel: CENTER_LABEL,
      email: target.email,
      loginUrl,
      initialPasswordIssued: true,
      transitioningFromProcare: true,
      billingCutoverApproved: false,
      branding,
    });
    const subject = `${CENTER_LABEL}: your BEE Suite Parent Portal is ready`;
    const emailResult = await sendEmail({
      to: [target.email],
      subject,
      text,
      html,
      fromName: branding.name,
      disableClickTracking: true,
      categories: ["parent_invitation_email"],
      customArgs: { guardianId: guardian.id, familyId: target.familyId, centerId: CENTER_ID, authorizedLongmontPdfWave: true },
      tenantId: state.center.organization.tenantId,
    });
    const emailHash = createHash("sha256").update(target.email).digest("hex").slice(0, 24);
    await recordEmailDeliveryAttempt({
      tenantId: state.center.organization.tenantId,
      centerId: CENTER_ID,
      dedupeKey: `parent-invite:longmont-pdf:20260803:${emailHash}`,
      purpose: "parent_invitation_email",
      to: [target.email],
      subject,
      text,
      html,
      fromName: branding.name,
      result: emailResult,
      metadata: {
        guardianId: guardian.id,
        familyId: target.familyId,
        brand: branding.kind,
        authorizedLongmontPdfWave: true,
        sourcePdfSha256: SOURCE_PDF_SHA256,
      },
    });
    invariant(emailResult.ok, emailResult.error || `Longmont invite was not accepted for ${target.email}.`);
    const linkedGuardians = await prisma.guardian.findMany({
      where: { id: { in: provisioned.linkedGuardianIds } },
      select: { id: true, customFields: true },
    });
    await prisma.$transaction(linkedGuardians.map((item) => prisma.guardian.update({
      where: { id: item.id },
      data: { customFields: parentPortalInvitationSentFields(item.customFields) },
    })));
    const loginWorks = await verifySupabasePassword(target.email, DEFAULT_PARENT_INITIAL_PASSWORD);
    invariant(loginWorks, `Additional Longmont parent password verification failed for ${target.email}.`);
    await writeSystemAuditLog({
      tenantId: state.center.organization.tenantId,
      centerId: CENTER_ID,
      action: "parent_portal.guardian_invited",
      resource: "Guardian",
      resourceId: guardian.id,
      metadata: {
        familyId: target.familyId,
        parentUserId: provisioned.userId,
        email: target.email,
        authMode: DIRECT_PARENT_PORTAL_INVITE_MODE,
        emailAcceptedByProvider: true,
        initialPasswordVerified: true,
        authorizedActorUserId: actorUserId,
        sourceEvidence: "longmont_visible_primary_account_pdf_and_procare_payer_profile",
        sourcePdfSha256: SOURCE_PDF_SHA256,
      },
    });
    accepted += 1;
    verified += 1;
  }
  return { accepted, verified };
}

async function main() {
  const args = parseArgs();
  const source = readSourcePlan();
  const state = await loadState();
  const rowPlan = mapRows(source.plan, state);
  const accessPlan = await buildAccessPlan(state, rowPlan.mapped);
  const existingPaymentCount = rowPlan.balances.reduce((sum, item) => sum + (item.family.billingAccount?.payments.length ?? 0), 0);
  const existingInvoiceCount = rowPlan.balances.reduce((sum, item) => sum + (item.family.billingAccount?.invoices.length ?? 0), 0);
  const summary = {
    mode: args.apply ? "apply" : "dry-run",
    source: {
      pdfSha256: SOURCE_PDF_SHA256,
      planSha256: source.sha256,
      asOf: source.plan.asOf,
      rows: source.plan.rows.length,
      totalCents: EXPECTED_PDF_TOTAL_CENTS,
    },
    balances: {
      matchedRows: rowPlan.mapped.length,
      matchedFamilies: rowPlan.balances.length,
      matchedCents: rowPlan.balances.reduce((sum, item) => sum + item.desiredCents, 0),
      unresolvedRows: rowPlan.unresolved.length,
      unresolvedCents: rowPlan.unresolved.reduce((sum, row) => sum + row.balanceCents, 0),
      accountsToCreate: rowPlan.balances.filter((item) => !item.family.billingAccount).length,
      accountsToChange: rowPlan.balances.filter((item) => item.family.billingAccount?.balanceCents !== item.desiredCents).length,
      existingPaymentsPreserved: existingPaymentCount,
      existingInvoicesPreserved: existingInvoiceCount,
    },
    access: {
      existingAcceptedEmailsToResetAndVerify: accessPlan.existingTargets.length,
      additionalInvitesToSend: accessPlan.additionalTargets.length,
      totalRequestedPasswordVerifications: accessPlan.targetEmails.length,
    },
  };
  console.log(JSON.stringify(summary, null, 2));
  if (!args.apply) return;

  invariant(clean(process.env.SENDGRID_API_KEY).length > 10 && validEmail(clean(process.env.SENDGRID_FROM_EMAIL)), "Live sending requires configured platform SendGrid credentials.");
  const actor = await prisma.user.findUnique({
    where: { email: CORPORATE_ACTOR_EMAIL },
    select: { id: true, tenantId: true, isActive: true },
  });
  invariant(actor?.isActive && actor.tenantId === state.center.organization.tenantId, "The active Kid City corporate audit actor is unavailable.");

  const balanceResult = await applyBalances(state, rowPlan.balances, actor.id);
  const existingPasswordsVerified = await resetAndVerifyExistingAccess(
    accessPlan.existingTargets,
    actor.id,
    state.center.organization.tenantId,
  );
  const inviteResult = await sendAdditionalInvites(state, accessPlan.additionalTargets, actor.id);
  console.log(JSON.stringify({
    mode: "apply-result",
    balances: balanceResult,
    access: {
      existingPasswordsVerified,
      additionalAccepted: inviteResult.accepted,
      additionalPasswordsVerified: inviteResult.verified,
      totalPasswordsVerified: existingPasswordsVerified + inviteResult.verified,
    },
  }, null, 2));
}

void main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
