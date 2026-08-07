import "./load-env";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { Prisma } from "@prisma/client";
import { currentlyEnrolledChildWhere } from "@/lib/enrollment-status";
import {
  WEEKLY_TUITION_AUTOBILL_CADENCE,
  WEEKLY_TUITION_AUTOBILL_DAY,
  nextWeeklyBillingPeriod,
} from "@/lib/billing-workflows";
import { prisma } from "@/lib/prisma";

const APPLY = "--apply";
const BILLING_CSV = "--billing-csv=";
const BALANCE_CSV = "--balance-csv=";
const CONFIRM_PLAN = "--confirm-plan";
const CONFIRM_NOHISTORY = "--confirm-current-families-only";
const RESOLVE_AMBIGUOUS = "--resolve-ambiguous-dupes";

type Args = { apply: boolean; billingCsv: string; balanceCsv: string; confirmPlan: string; confirmCurrentFamiliesOnly: boolean; resolveAmbiguous: boolean };
type ParsedRow = string[];
type ContractAssignment = { accountKey: string; childName: string; amountCents: number; item: string; kind: string; rowTotalCents: number };
type BalanceRow = { key: string; payer: string; balanceCents: number; asOfTotalCents: number; section: string };
type FamilyState = {
  id: string;
  name: string;
  externalId: string;
  customFields: Prisma.JsonValue | null;
  billingAccount: { id: string; balanceCents: number; customFields: Prisma.JsonValue | null; invoices: { id: string }[]; payments: { id: string }[] } | null;
  children: Array<{
    id: string;
    fullName: string;
    externalId: string;
    ageGroup: string;
    createdAt: Date;
    customFields: Prisma.JsonValue | null;
  }>;
};

function invariant(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function clean(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function object(value: Prisma.JsonValue | null | undefined) { return value && typeof value === "object" && !Array.isArray(value) ? value as Prisma.JsonObject : {}; }
function jsonObject(value: unknown) { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function parseMoneyCents(input: unknown) {
  if (typeof input !== "string") return 0;
  const negative = input.trim().startsWith("(") && input.trim().endsWith(")");
  const normalized = input.replace(/[,$()]/g, "").trim();
  if (!normalized) return 0;
  const value = Number(normalized);
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) * (negative ? -1 : 1);
}
function parseArgs(argv: string[]): Args {
  let billingCsv = "";
  let balanceCsv = "";
  let confirmPlan = "";
  let apply = false;
  let confirmCurrentFamiliesOnly = false;
  let resolveAmbiguous = false;
  for (const arg of argv) {
    if (arg === APPLY) apply = true;
    else if (arg.startsWith(BILLING_CSV)) billingCsv = arg.slice(BILLING_CSV.length).trim();
    else if (arg.startsWith(BALANCE_CSV)) balanceCsv = arg.slice(BALANCE_CSV.length).trim();
    else if (arg === CONFIRM_PLAN) {
      const parts = arg.split("=");
      if (parts[1]) confirmPlan = parts[1].trim();
    } else if (arg.startsWith(`${CONFIRM_PLAN}=`)) confirmPlan = arg.slice(`${CONFIRM_PLAN}=`.length).trim();
    else if (arg === CONFIRM_NOHISTORY) confirmCurrentFamiliesOnly = true;
    else if (arg === RESOLVE_AMBIGUOUS) resolveAmbiguous = true;
    else if (arg.startsWith("--")) throw new Error(`Unknown option: ${arg}`);
  }
  invariant(billingCsv, `${BILLING_CSV}<path> is required.`);
  invariant(balanceCsv, `${BALANCE_CSV}<path> is required.`);
  if (apply) {
    invariant(confirmPlan, `Apply mode requires ${CONFIRM_PLAN}=<fingerprint>.`);
    invariant(confirmCurrentFamiliesOnly, `Apply mode requires ${CONFIRM_NOHISTORY}.`);
  }
  return { apply, billingCsv, balanceCsv, confirmPlan, confirmCurrentFamiliesOnly, resolveAmbiguous };
}

function parseCsv(text: string) {
  const rows: ParsedRow[] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') { field += '"'; index += 1; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (char === "," && !quoted) { row.push(field.trim()); field = ""; continue; }
    if ((char === "\r" || char === "\n") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(field.trim());
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      field = "";
      continue;
    }
    field += char;
  }
  row.push(field.trim());
  if (row.some((value) => value.length > 0)) rows.push(row);
  return rows;
}

function normalizeAccount(value: unknown) {
  const cleaned = clean(value);
  const bracketMatch = cleaned.match(/^\[\s*([^\]]+)\s*\]/);
  const base = bracketMatch ? bracketMatch[1] : cleaned;
  return base.toUpperCase().replace(/[^A-Z0-9_-]/g, "");
}

function resolveBalanceAccountKey(value: unknown) {
  const cleaned = clean(value);
  const bracketMatch = cleaned.match(/^\[\s*([^\]]+)\s*\]/);
  return normalizeAccount(bracketMatch ? bracketMatch[1] : cleaned.split(" ")[0] ?? "");
}
function normalizeNameForMatch(value: string) {
  const lower = clean(value).toLowerCase();
  const collapsed = lower.replace(/\s+/g, " ").trim();
  const [left, ...right] = collapsed.split(",");
  const reordered = right.length ? `${right.join(",").trim()} ${left.trim()}` : left.trim();
  const tokens = reordered.replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);
  tokens.sort();
  return tokens.join(" ");
}

function parseSourceAsOf(raw: string) {
  const value = raw.trim().toLowerCase().replace(/[^0-9]/g, "/");
  const parts = value.split("/").filter(Boolean);
  if (parts.length < 3) return new Date();
  const month = Number(parts[0]);
  const day = Number(parts[1]);
  const year = Number(parts[parts.length - 1].slice(0, 4));
  return new Date(year, month - 1, day);
}

function parseBillingRows(rows: ParsedRow[]) {
  const filtered = rows.filter((row) => row[0] === "Account Contract Billing Summary");
  const asOfRaw = clean(filtered[0]?.[3]);
  const rowsByAccountChild = new Map<string, ContractAssignment[]>();
  for (const row of filtered) {
    const kind = clean(row[6]);
    if (kind !== "Weekly") continue;
    const accountKey = normalizeAccount(row[5]);
    const child = clean(row[9]);
    if (!accountKey || !child) continue;
    const childKey = `${accountKey}||${normalizeNameForMatch(child)}`;
    const amountCents = parseMoneyCents(row[12]);
    const rowTotalCents = parseMoneyCents(row[13]);
    const existing = rowsByAccountChild.get(childKey) ?? [];
    existing.push({ accountKey, childName: child, item: clean(row[10]), amountCents, kind, rowTotalCents });
    rowsByAccountChild.set(childKey, existing);
  }
  const contracts = [] as Array<{ accountKey: string; childName: string; childNormalized: string; weeklyAmountCents: number; rows: ContractAssignment[]; rowTotalCents: number[] }>;
  for (const [key, rows] of rowsByAccountChild) {
    const [accountKey, childNormalized] = key.split("||", 2);
    const childName = rows[0]?.childName ?? "";
    contracts.push({ accountKey, childName, childNormalized, rows, weeklyAmountCents: rows.reduce((sum, item) => sum + item.amountCents, 0), rowTotalCents: rows.map((row) => row.rowTotalCents) });
  }
  return { asOfRaw, asOf: parseSourceAsOf(asOfRaw), contracts };
}

function parseBalanceRows(rows: ParsedRow[]) {
  const visible = new Map<string, BalanceRow>();
  for (const row of rows) {
    const section = clean(row[5]);
    if (section !== "Visible Accounts") continue;
    const key = resolveBalanceAccountKey(row[9]);
    const rawPayer = clean(row[9]);
    if (!key) continue;
    const payer = rawPayer.replace(/^\[[^\]]+\]\s*/g, "");
    const balanceCents = parseMoneyCents(row[10]);
    const totalCents = parseMoneyCents(row[11]);
    visible.set(key, { key, payer, balanceCents, asOfTotalCents: totalCents, section });
  }
  return visible;
}

type ChildSelection = { selected: FamilyState["children"][number]; resolvedAmbiguously: boolean };
function scoreContractChild(child: FamilyState["children"][number]) {
  let score = 0;
  const fields = object(child.customFields);
  if (child.ageGroup.toLowerCase() !== "unassigned") score += 3;
  if (fields.tuitionBillingEnabled === true) score += 5;
  if (String(child.externalId).startsWith("rendered-child-")) score += 2;
  if (String(fields.tuitionBillingUpdatedBy).toLowerCase().includes("beach")) score += 1;
  return score;
}
function pickChildForContract(family: FamilyState, childNameNormalized: string, allowAmbiguousResolution: boolean): ChildSelection | null {
  const candidates = family.children
    .map((child) => ({ child, normalized: normalizeNameForMatch(child.fullName), hasClassroom: child.ageGroup.toLowerCase() !== "unassigned" }))
    .filter((item) => item.normalized === childNameNormalized)
    .sort((left, right) => Number(right.hasClassroom) - Number(left.hasClassroom));

  if (candidates.length === 0) return null;
  const bestName = candidates[0]!.child.fullName;
  const sameBest = candidates.filter((item) => normalizeNameForMatch(item.child.fullName) === normalizeNameForMatch(bestName));
  if (sameBest.length === 1) return { selected: sameBest[0]!.child, resolvedAmbiguously: false };

  if (!allowAmbiguousResolution) return null;
  const sameBestClassroom = sameBest.filter((item) => item.hasClassroom);
  if (sameBestClassroom.length === 0) return { selected: sameBest[0]!.child, resolvedAmbiguously: true };
  if (sameBestClassroom.length === 1) return { selected: sameBestClassroom[0]!.child, resolvedAmbiguously: true };

  const ranked = sameBestClassroom
    .slice()
    .map((item) => ({ ...item, score: scoreContractChild(item.child) }))
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return right.child.createdAt.getTime() - left.child.createdAt.getTime();
    });
  return { selected: ranked[0]!.child, resolvedAmbiguously: true };
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function stableCents(v: number) { return Math.round(v); }

async function loadState() {
  const center = await prisma.center.findUnique({ where: { id: "cmp4ew8yo001e6alw32jneo3w" }, select: { id: true, name: true, status: true } });
  invariant(center, "Beach center not found.");
  invariant(center.status === "active", `Expected active Beach center; found ${center.status}.`);

  const families = await prisma.family.findMany({
    where: {
      centerId: center.id,
      children: { some: currentlyEnrolledChildWhere() },
    },
    select: {
      id: true,
      name: true,
      externalId: true,
      customFields: true,
      children: {
        where: currentlyEnrolledChildWhere(),
        select: { id: true, fullName: true, externalId: true, ageGroup: true, createdAt: true, customFields: true },
        orderBy: { fullName: "asc" },
      },
      billingAccount: {
        select: {
          id: true,
          balanceCents: true,
          invoices: { select: { id: true } },
          payments: { select: { id: true } },
          customFields: true,
        },
      },
    },
  });

  const plans = await prisma.tuitionPlan.findMany({ where: { centerId: center.id } });
  return { center, families: families as unknown as FamilyState[], plans };
}

function buildPlan(
  families: FamilyState[],
  contracts: ReturnType<typeof parseBillingRows>["contracts"],
  balances: Map<string, BalanceRow>,
  asOf: Date,
  asOfSource: string,
  resolveAmbiguous: boolean,
) {
  const familyByAccount = new Map<string, FamilyState[]>();
  for (const family of families) {
    const customFields = object(family.customFields);
    const candidateIds = [family.externalId, clean(customFields.procareAccountKey)]
      .map(normalizeAccount)
      .filter(Boolean);
    for (const key of new Set(candidateIds)) {
      const prior = familyByAccount.get(key) ?? [];
      prior.push(family);
      familyByAccount.set(key, prior);
    }
  }

  const tuitionTargets: Array<{
    family: FamilyState;
    child: FamilyState["children"][number];
    accountId: string;
    expectedAmountCents: number;
    currentAmountCents: number;
    startPeriod: string;
    ageGroup: string;
    contractRows: ContractAssignment[];
  }> = [];

  const tuitionSkipped: Array<{ accountKey: string; childName: string; reason: string }> = [];
  const tuitionAutoResolved: Array<{ accountKey: string; childName: string; childId: string; resolvedChildName: string }> = [];
  const tuitionMatches = new Map<string, number>();

  const startsPeriod = nextWeeklyBillingPeriod(asOf);
  for (const contract of contracts) {
    const familiesForAccount = familyByAccount.get(contract.accountKey) ?? [];
    if (familiesForAccount.length !== 1) {
      tuitionSkipped.push({
        accountKey: contract.accountKey,
        childName: contract.childName,
        reason: familiesForAccount.length === 0
          ? "No current family matched this account key."
          : `Account matched ${familiesForAccount.length} current families; requires manual resolution.`,
      });
      continue;
    }
    const family = familiesForAccount[0]!;
    const matchingChildren = family.children.filter((child) => normalizeNameForMatch(child.fullName) === contract.childNormalized);
    const childSelection = pickChildForContract(family, contract.childNormalized, resolveAmbiguous);
    if (!childSelection || !childSelection.selected) {
      tuitionSkipped.push({
        accountKey: contract.accountKey,
        childName: contract.childName,
        reason: !resolveAmbiguous && matchingChildren.length > 1
          ? "Multiple current children matched this contract name."
          : "No matching current child for contract name.",
      });
      continue;
    }
    const child = childSelection.selected;
    if (childSelection.resolvedAmbiguously) {
      tuitionAutoResolved.push({
        accountKey: contract.accountKey,
        childName: contract.childName,
        childId: child.id,
        resolvedChildName: child.fullName,
      });
    }
    const fields = object(child.customFields);
    const currentAmount = Number(fields.tuitionPlanAmountCents ?? 0);
    const currentEnabled = fields.tuitionBillingEnabled === true;
    if (contract.weeklyAmountCents < 0) {
      tuitionSkipped.push({ accountKey: contract.accountKey, childName: contract.childName, reason: "Negative weekly contract total detected." });
      continue;
    }
    if (contract.weeklyAmountCents > 0 || currentEnabled) {
      tuitionTargets.push({
        family,
        child,
        accountId: family.billingAccount?.id ?? "",
        expectedAmountCents: stableCents(contract.weeklyAmountCents),
        currentAmountCents: stableCents(currentAmount),
        startPeriod: startsPeriod,
        ageGroup: child.ageGroup,
        contractRows: contract.rows,
      });
      tuitionMatches.set(contract.accountKey, (tuitionMatches.get(contract.accountKey) ?? 0) + 1);
    }
  }

  const tuitionChanges = tuitionTargets.filter((target) => {
    const fields = object(target.child.customFields);
    return !(fields.tuitionBillingEnabled === true && Number(fields.tuitionPlanAmountCents) === target.expectedAmountCents && String(fields.tuitionBillingStartsPeriod) === target.startPeriod);
  });

  const balanceTargets = [];
  const balanceSkipped = [];
  for (const [key, observed] of balances) {
    const matchedFamilies = familyByAccount.get(key) ?? [];
    if (matchedFamilies.length !== 1) {
      if (matchedFamilies.length === 0) {
        balanceSkipped.push({ accountKey: key, payer: observed.payer, reason: "No current family matched this balance key." });
      } else {
        balanceSkipped.push({
          accountKey: key,
          payer: observed.payer,
          reason: `Balance key matched ${matchedFamilies.length} current families; requires manual resolution.`,
        });
      }
      continue;
    }

    const family = matchedFamilies[0]!;
    if (!family.billingAccount) {
      balanceSkipped.push({ accountKey: key, payer: observed.payer, reason: "Current family has no billing account." });
      continue;
    }
    const current = family.billingAccount?.balanceCents ?? 0;
    if (current === observed.balanceCents) continue;
    balanceTargets.push({
      family,
      account: family.billingAccount,
      expectedBalanceCents: observed.balanceCents,
      currentBalanceCents: current,
      observed,
    });
  }

  const balanceChanges = balanceTargets.filter((target) => {
    const account = target.account;
    if (!account) return true;
    return account.invoices.length === 0 && account.payments.length === 0;
  });
  const balanceBlocked = balanceTargets.filter((target) => !balanceChanges.includes(target));

  const sourceFingerprint = createHash("sha256").update(stableJson({
    source: "beach-billing-daily",
    asOf: asOf.toISOString(),
    asOfSource,
    tuitionTargets: tuitionTargets.map((target) => ({
      familyId: target.family.id,
      childId: target.child.id,
      accountId: target.accountId,
      expectedAmountCents: target.expectedAmountCents,
      currentAmountCents: target.currentAmountCents,
      startPeriod: target.startPeriod,
      ageGroup: target.ageGroup,
      items: target.contractRows.map((row) => ({
        item: row.item,
        amountCents: row.amountCents,
      })),
    })),
    balanceChanges: balanceChanges.map((target) => ({
      familyId: target.family.id,
      accountId: target.account?.id,
      currentBalanceCents: target.currentBalanceCents,
      desiredBalanceCents: target.expectedBalanceCents,
    })),
  })).digest("hex");

  return {
    fingerprint: sourceFingerprint,
    totals: {
      familyCount: families.length,
      currentTuitionChildren: tuitionTargets.length,
      tuitionAlreadyCorrect: tuitionTargets.length - tuitionChanges.length,
      tuitionChanges: tuitionChanges.length,
      tuitionUnmatched: tuitionSkipped.length,
      balanceCurrent: balanceTargets.length,
      balanceUpdated: balanceChanges.length,
      balanceBlocked: balanceBlocked.length,
      balanceSkipped: balanceSkipped.length,
      visibleBalanceRows: balances.size,
    },
    tuitionTargets,
    tuitionChanges,
    tuitionSkipped,
    tuitionAutoResolved,
    balanceSkipped,
    balanceChanges,
    balanceBlocked,
    startsPeriod,
    asOf,
    sourceAsOf: asOfSource,
  };
}

async function applyPlan(plan: ReturnType<typeof buildPlan>) {
  const updatedTuition = {
    updated: 0,
    createdPlans: 0,
  };
  const updatedBalances = { updated: 0, ledger: 0 };
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    const tuitionPlanCache = new Map<string, { id: string; name: string; ageGroup: string }>();
    const existingPlans = await tx.tuitionPlan.findMany({ where: { centerId: "cmp4ew8yo001e6alw32jneo3w", cadence: WEEKLY_TUITION_AUTOBILL_CADENCE } });
    for (const planRow of existingPlans) {
      tuitionPlanCache.set(`${planRow.ageGroup}||${planRow.amountCents}`, { id: planRow.id, name: planRow.name, ageGroup: planRow.ageGroup });
    }

    for (const target of plan.tuitionChanges) {
      const key = `${target.ageGroup}||${target.expectedAmountCents}`;
      let planRecord = tuitionPlanCache.get(key);
      if (!planRecord) {
        const planName = `ProCare ${target.ageGroup} Weekly $${(target.expectedAmountCents / 100).toFixed(2)}`;
        const created = await tx.tuitionPlan.create({
          data: {
            centerId: "cmp4ew8yo001e6alw32jneo3w",
            ageGroup: target.ageGroup,
            cadence: WEEKLY_TUITION_AUTOBILL_CADENCE,
            amountCents: target.expectedAmountCents,
            name: planName,
          },
        });
        planRecord = { id: created.id, name: created.name, ageGroup: created.ageGroup };
        tuitionPlanCache.set(key, planRecord);
        updatedTuition.createdPlans += 1;
      }
      const fields = object(target.child.customFields);
      await tx.child.update({
        where: { id: target.child.id },
        data: {
          customFields: {
            ...fields,
            tuitionBillingEnabled: true,
            tuitionPlanId: planRecord.id,
            tuitionPlanName: planRecord.name,
            tuitionPlanAgeGroup: planRecord.ageGroup,
            tuitionPlanCadence: WEEKLY_TUITION_AUTOBILL_CADENCE,
            tuitionBillingCadence: WEEKLY_TUITION_AUTOBILL_CADENCE,
            tuitionPlanAmountCents: target.expectedAmountCents,
            tuitionFundingType: "family",
            tuitionAutobillEligible: true,
            tuitionBillingDay: WEEKLY_TUITION_AUTOBILL_DAY,
            tuitionBillingStartsPeriod: plan.startsPeriod,
            tuitionBillingDescription: planRecord.name,
            tuitionBillingUpdatedAt: now.toISOString(),
            tuitionBillingUpdatedBy: "Beach Blvd CSV reconciliation 2026-08-06",
            beachContractBilling: {
              source: "Account Contract Billing Summary",
              sourceAsOf: plan.sourceAsOf,
              familyExternalId: target.family.externalId,
              childName: target.child.fullName,
              expectedAmountCents: target.expectedAmountCents,
              startsPeriod: plan.startsPeriod,
              rowCount: target.contractRows.length,
            },
          } as Prisma.InputJsonObject,
        },
      });
      updatedTuition.updated += 1;
    }

    for (const target of plan.balanceChanges) {
      if (!target.account) continue;
      const sourceDate = plan.sourceAsOf.replace(/[^0-9a-z]/gi, "").slice(0, 16);
      const externalId = `beach-balance:${target.family.externalId}:${plan.startsPeriod}:${sourceDate}`;
      const existing = await tx.ledgerEntry.findUnique({ where: { sourceSystem_externalId: { sourceSystem: "procare", externalId } }, select: { id: true } });
      invariant(!existing, `Balance reconciliation entry already exists for ${target.family.externalId}.`);
      await tx.billingAccount.update({
        where: { id: target.account.id },
        data: {
          balanceCents: target.expectedBalanceCents,
          ledgerSyncedAt: now,
          customFields: {
            ...jsonObject(target.account.customFields),
            beachBalanceReconciliation: {
              source: "Account Balance Summary",
              sourceAsOf: plan.sourceAsOf,
              familyExternalId: target.family.externalId,
              sourceSection: target.observed.section,
              previousBalanceCents: target.currentBalanceCents,
              reconciledBalanceCents: target.expectedBalanceCents,
              currentFamiliesOnly: true,
              invoicesMutated: false,
              paymentsMutated: false,
            },
          } as Prisma.InputJsonObject,
        },
      });
      await tx.ledgerEntry.create({
        data: {
          billingAccountId: target.account.id,
          type: "procare_balance_reconciliation",
          description: "Beach Blvd ProCare balance reconciled from CSV",
          amountCents: target.expectedBalanceCents - target.currentBalanceCents,
          balanceAfterCents: target.expectedBalanceCents,
          effectiveAt: now,
          sourceSystem: "procare",
          externalId,
          metadata: {
            centerId: "cmp4ew8yo001e6alw32jneo3w",
            source: "beach-balance-summary-2026-08-06",
            sourceAsOf: plan.sourceAsOf,
            familyId: target.family.id,
            previousBalanceCents: target.currentBalanceCents,
            reconciledBalanceCents: target.expectedBalanceCents,
            invoicesMutated: false,
            paymentsMutated: false,
          },
        },
      });
      updatedBalances.updated += 1;
      updatedBalances.ledger += 1;
    }
  }, { maxWait: 10_000, timeout: 60_000, isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  return { updatedTuition, updatedBalances };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const billingText = readFileSync(args.billingCsv, "utf8");
  const balanceText = readFileSync(args.balanceCsv, "utf8");

  const billingParsed = parseBillingRows(parseCsv(billingText));
  const balanceParsed = parseBalanceRows(parseCsv(balanceText));

  const state = await loadState();
  const asOfSource = clean(parseCsv(billingText)[0]?.[3] || "As of 2026-08-06");
  const plan = buildPlan(state.families, billingParsed.contracts, balanceParsed, billingParsed.asOf, asOfSource, args.resolveAmbiguous);

  const summary = {
    mode: args.apply ? "apply-preflight" : "dry-run",
    center: { id: state.center.id, name: state.center.name },
    source: {
      asOf: plan.asOf.toISOString(),
      billingRows: billingParsed.contracts.length,
      billingUniqueAccounts: new Set(billingParsed.contracts.map((entry) => entry.accountKey)).size,
      visibleBalanceRows: balanceParsed.size,
      fingerprint: plan.fingerprint,
    },
    plan: {
      ...plan.totals,
      startsPeriod: plan.startsPeriod,
      tuitionAutoResolved: plan.tuitionAutoResolved,
    tuition: {
        changes: plan.tuitionChanges.map((item) => ({
          family: item.family.externalId,
          child: item.child.fullName,
          ageGroup: item.ageGroup,
          currentAmountCents: item.currentAmountCents,
          desiredAmountCents: item.expectedAmountCents,
          startPeriod: item.startPeriod,
        })),
        skipped: plan.tuitionSkipped,
      },
      balances: {
        skipped: plan.balanceSkipped.map((item) => item),
        updates: plan.balanceChanges.map((item) => ({
          family: item.family.externalId,
          current: item.currentBalanceCents,
          desired: item.expectedBalanceCents,
          visibleSourceAsOf: item.observed.key,
        })),
        blocked: plan.balanceBlocked.map((item) => ({
          family: item.family.externalId,
          current: item.currentBalanceCents,
          desired: item.expectedBalanceCents,
          invoiceCount: item.account?.invoices.length ?? 0,
          paymentCount: item.account?.payments.length ?? 0,
          reason: "invoice or payment activity exists",
        })),
      },
    },
  };

  console.log(JSON.stringify(summary, null, 2));
  if (!args.apply) return;
  invariant(plan.fingerprint === args.confirmPlan, `Plan fingerprint mismatch. Re-run with --confirm-plan=${plan.fingerprint}`);
  const result = await applyPlan(plan);
  console.log(JSON.stringify({ mode: "apply-result", result }, null, 2));
}

void main().catch(async (error) => {
  console.error(error instanceof Error ? error.message : String(error));
  await prisma.$disconnect();
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
