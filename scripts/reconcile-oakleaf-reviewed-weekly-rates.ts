import "./load-env";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { PaymentStatus, Prisma } from "@prisma/client";
import { createBillingInvoiceForFamily } from "@/lib/billing-invoices";
import { invoiceLedgerBalanceCents, invoiceVoidBlocker } from "@/lib/invoice-void";
import { prisma } from "@/lib/prisma";

const CENTER_ID = "cmp4ew9h2001m6alwxssr4wr6";
const SOURCE_SHA256 = "1d28dd395fe6c89c82dd0567e8aaa292e118cae346311c78f5fe4e4357e89425";
const PERIODS = ["2026-W33", "2026-W34"] as const;
const APPLY = "--apply";
const CONFIRM = "--confirm-oakleaf-reviewed-weekly-rates";
const FINGERPRINT = "--confirm-fingerprint=";

type Target = { family: string; accountKey: string; payer: string; sourceRates: number[]; assignments: Record<string, number> };
const targets: Target[] = [
  { family: "Alexus Brown Family", accountKey: "HALL", payer: "Brown, Alexus", sourceRates: [12075], assignments: { "Jamonoski Hall": 12075, "Cambre'Ella Hall": 0, "Jeremiah Hall": 0 } },
  { family: "Altavia James Family", accountKey: "FARMER", payer: "James, Altavia", sourceRates: [7320], assignments: { "E'mazi Farmer": 7320 } },
  { family: "Amber Petti Family", accountKey: "JEFFERS", payer: "Petti, Amber", sourceRates: [18075], assignments: { "Mekhi Jefferson": 18075, "Mia Jefferson": 0 } },
  { family: "Amire Shakir-Fulford Family", accountKey: "SHAKIR", payer: "Shakir-Fulford, Amire", sourceRates: [12760], assignments: { "Legend Shakir-Fulford": 12760 } },
  { family: "Asia Collins Family", accountKey: "STEWARD", payer: "Collins, Asia", sourceRates: [15915], assignments: { "Adam Steward": 15915, "Carter Collins": 0 } },
  { family: "Brandi Ordu Family", accountKey: "ORDU", payer: "Ordu, Brandi", sourceRates: [20000], assignments: { "Isaac Ordu": 20000 } },
  { family: "Britney Meadows Family", accountKey: "HINKLE", payer: "Meadows, Britney", sourceRates: [17000], assignments: { "Trenton Hinkle": 17000 } },
  { family: "Bryonna Ridley Family", accountKey: "RIDLEY", payer: "Ridley, Bryonna", sourceRates: [10835], assignments: { "Cannon Ridley": 10835 } },
  { family: "Carson Brown Family", accountKey: "BROWN", payer: "Brown, Carson", sourceRates: [12965], assignments: { "Nova Brown": 12965 } },
  { family: "Delsheka Brown Family", accountKey: "BYRD", payer: "Brown, Delsheka", sourceRates: [11000], assignments: { "Devonte Byrd Jr": 11000 } },
  { family: "Denise Moya Family", accountKey: "MOYA", payer: "Moya, Denise", sourceRates: [20000], assignments: { "Liam Moya": 20000 } },
  { family: "Dominique Jackson Family", accountKey: "JACKSON", payer: "Jackson, Dominique", sourceRates: [14435], assignments: { "Kyree Jackson": 14435 } },
  { family: "Gabriel sharp Family", accountKey: "SHARP", payer: "sharp, Gabriel", sourceRates: [18155], assignments: { "Genesis Sharp": 18155, "Ariah Sharp": 0 } },
  { family: "Jamese Touze Family", accountKey: "TOUZE", payer: "Touze, Jamese", sourceRates: [11985], assignments: { "Aubrie Touze": 11985 } },
  { family: "Jania Finklea Family", accountKey: "FINKLEA", payer: "Finklea, Jania", sourceRates: [11160], assignments: { "Ja'laya Finklea": 11160 } },
  { family: "Katryna Rhymer Family", accountKey: "SALINAS", payer: "Rhymer, Katryna", sourceRates: [15070], assignments: { "Aaliyah Salinas": 15070, "Marty Salinas": 0 } },
  { family: "Kiana *Cook Family", accountKey: "COOK", payer: "*Cook, Kiana", sourceRates: [12295, 11210], assignments: { "Carter Johnston": 12295, "Carianna Cook": 11210 } },
  { family: "Marianne Carrion Family", accountKey: "CARRION", payer: "Carrion, Marianne", sourceRates: [4420], assignments: { "Christoper Carrion": 4420 } },
  { family: "Rut Avraham Family", accountKey: "CHANDLE", payer: "Avraham, Rut", sourceRates: [11515, 11515], assignments: { "Emmanuel Chandler": 11515, "Elaysha Chandler": 11515 } },
  { family: "Savannah Hube Family", accountKey: "HUEBSCH", payer: "Hube, Savannah", sourceRates: [21130], assignments: { "Ellie Huebsch": 21130, "Amelia Huebsch": 0 } },
  { family: "Thanh Van Tran Family", accountKey: "NGUYEN", payer: "Van Tran, Thanh", sourceRates: [26955], assignments: { "Viet Nguyen": 26955, "Tuan Nguyen": 0 } },
  { family: "Tyler Ramirez Family", accountKey: "RAMIRE", payer: "Ramirez, Tyler", sourceRates: [18530], assignments: { "Ganina Ramirez": 18530, "Gianna Ramirez": 0 } },
  { family: "Victoria Williams Family", accountKey: "WILLIAM", payer: "Williams, Victoria", sourceRates: [14985], assignments: { "Kinzley Williams": 14985 } },
];

function clean(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function object(value: Prisma.JsonValue | null | undefined) { return value && typeof value === "object" && !Array.isArray(value) ? value as Prisma.JsonObject : {}; }
function input(value: Prisma.JsonObject) { return value as Prisma.InputJsonObject; }
function invariant(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
function money(value: string) { const normalized = value.trim().replace(/[,$()\s]/g, ""); return /^[-+]?\d+(?:\.\d{1,2})?$/.test(normalized) ? Math.round(Number(normalized) * 100) : null; }
function csv(text: string) {
  const rows: string[][] = []; let row: string[] = []; let field = ""; let quoted = false;
  for (let index = 0; index < text.length; index += 1) { const char = text[index]; const next = text[index + 1]; if (char === '"' && quoted && next === '"') { field += '"'; index += 1; } else if (char === '"') quoted = !quoted; else if (char === "," && !quoted) { row.push(field.trim()); field = ""; } else if ((char === "\r" || char === "\n") && !quoted) { if (char === "\r" && next === "\n") index += 1; row.push(field.trim()); if (row.some(Boolean)) rows.push(row); row = []; field = ""; } else field += char; }
  row.push(field.trim()); if (row.some(Boolean)) rows.push(row); return rows;
}
function stable(value: unknown): unknown { if (Array.isArray(value)) return value.map(stable); if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stable(item)])); return value; }
function hash(value: Buffer | unknown) { return createHash("sha256").update(Buffer.isBuffer(value) ? value : JSON.stringify(stable(value))).digest("hex"); }
function sourceEvidence() {
  const path = clean(process.env.OAKLEAF_PROCARE_BALANCE_CSV_PATH); invariant(path, "OAKLEAF_PROCARE_BALANCE_CSV_PATH is required.");
  const buffer = readFileSync(path); invariant(hash(buffer) === SOURCE_SHA256, "Oakleaf source fingerprint changed.");
  const rows = csv(buffer.toString("utf8")).map((row) => ({ key: row[9]?.match(/\[\*?([A-Z0-9_-]+)\*?\]/i)?.[1]?.toUpperCase() ?? "", payer: (row[9] ?? "").replace(/^\s*\[\*?[A-Z0-9_-]+\*?\]\s*/i, "").replace(/\s+-\s+Hidden\s*$/i, "").trim(), rate: money(row[8] ?? "") })).filter((row) => row.key && row.rate !== null);
  for (const target of targets) { const rates = rows.filter((row) => row.key === target.accountKey && row.payer === target.payer).map((row) => row.rate!).sort((a, b) => a - b); invariant(JSON.stringify(rates) === JSON.stringify([...target.sourceRates].sort((a, b) => a - b)), `${target.family} source rates changed.`); invariant(Object.values(target.assignments).reduce((sum, rate) => sum + rate, 0) === target.sourceRates.reduce((sum, rate) => sum + rate, 0), `${target.family} child assignment does not preserve source family total.`); }
}

async function load(client: Prisma.TransactionClient | typeof prisma = prisma) {
  const [center, actor, families] = await Promise.all([
    client.center.findUnique({ where: { id: CENTER_ID }, select: { id: true, name: true, status: true, organization: { select: { tenantId: true } } } }),
    client.user.findUnique({ where: { email: "brenden@kidcityusa.com" }, select: { id: true, email: true, tenantId: true } }),
    client.family.findMany({ where: { centerId: CENTER_ID, name: { in: targets.map((target) => target.family) } }, select: { id: true, name: true, billingAccount: { select: { id: true, balanceCents: true, customFields: true, payments: { select: { id: true, status: true, provider: true, customFields: true } }, invoices: { select: { id: true, number: true, status: true, totalCents: true, dueDate: true, sourceSystem: true, externalId: true, customFields: true, ledgerEntries: { select: { id: true, amountCents: true, paymentId: true } } }, orderBy: { createdAt: "asc" } } } }, children: { select: { id: true, fullName: true, ageGroup: true, enrollmentStatus: true, classroomId: true, customFields: true } } } }),
  ]);
  invariant(center?.name === "Kid City USA - Oakleaf" && center.status === "active" && actor?.tenantId === center.organization.tenantId, "Oakleaf center or actor changed.");
  invariant(families.length === targets.length, "One or more Oakleaf rate target families are missing.");
  const plans = targets.map((target) => {
    const family = families.find((item) => item.name === target.family)!; invariant(family.billingAccount, `${target.family} has no billing account.`);
    const children = Object.entries(target.assignments).map(([childName, amountCents]) => { const child = family.children.find((item) => item.fullName === childName); invariant(child && ["enrolled", "active", "current"].includes(child.enrollmentStatus) && child.classroomId, `${target.family}/${childName} is no longer current.`); return { ...child, amountCents }; });
    const childIds = children.map((child) => child.id);
    const invoices = family.billingAccount.invoices.filter((invoice) => { const fields = object(invoice.customFields); return invoice.status !== PaymentStatus.VOID && fields.chargeSource === "tuitionPlan" && PERIODS.includes(clean(fields.billingPeriod) as typeof PERIODS[number]) && childIds.includes(clean(fields.childId)); });
    for (const invoice of invoices) invariant(!invoiceVoidBlocker({ ...invoice, payments: family.billingAccount.payments }), `${invoice.number} cannot be safely voided.`);
    for (const period of PERIODS) invariant(invoices.some((invoice) => object(invoice.customFields).billingPeriod === period), `${target.family} has no reviewed ${period} invoice.`);
    const oldInvoiceCents = invoices.reduce((sum, invoice) => sum + invoiceLedgerBalanceCents(invoice.ledgerEntries), 0); const weeklyCents = Object.values(target.assignments).reduce((sum, rate) => sum + rate, 0); const expectedBalanceCents = family.billingAccount.balanceCents - oldInvoiceCents + weeklyCents * PERIODS.length;
    return { target, family, account: family.billingAccount, children, invoices, oldInvoiceCents, weeklyCents, expectedBalanceCents };
  });
  return { center, actor, plans, fingerprint: hash(plans.map((plan) => ({ familyId: plan.family.id, balanceCents: plan.account.balanceCents, children: plan.children.map((child) => ({ id: child.id, amountCents: child.amountCents, customFields: child.customFields })), invoices: plan.invoices.map((invoice) => ({ id: invoice.id, status: invoice.status, totalCents: invoice.totalCents, ledger: invoice.ledgerEntries })), paymentIds: plan.account.payments.map((payment) => payment.id) }))) };
}

async function apply(expectedFingerprint: string) {
  const before = await load(); invariant(before.fingerprint === expectedFingerprint, "Oakleaf rate state changed; rerun preview."); const appliedAt = new Date();
  await prisma.$transaction(async (tx) => {
    const current = await load(tx); invariant(current.fingerprint === expectedFingerprint, "Oakleaf rate state changed inside transaction.");
    for (const plan of current.plans) {
      for (const invoice of [...plan.invoices].reverse()) { const reversal = invoiceLedgerBalanceCents(invoice.ledgerEntries); const updated = await tx.invoice.updateMany({ where: { id: invoice.id, status: PaymentStatus.OPEN }, data: { status: PaymentStatus.VOID, customFields: input({ ...object(invoice.customFields), voidedAt: appliedAt.toISOString(), voidedByUserId: current.actor.id, voidedByEmail: current.actor.email, voidReason: "Superseded by Oakleaf reviewed spreadsheet weekly rate." }) } }); invariant(updated.count === 1, `${invoice.number} changed before void.`); const account = await tx.billingAccount.update({ where: { id: plan.account.id }, data: { balanceCents: { decrement: reversal } }, select: { balanceCents: true } }); await tx.ledgerEntry.create({ data: { billingAccountId: plan.account.id, invoiceId: invoice.id, type: "invoice_void", description: `Voided ${invoice.number}: corrected Oakleaf weekly rate`, amountCents: -reversal, balanceAfterCents: account.balanceCents, sourceSystem: "oakleaf_reviewed_rate_correction_2026_08_18", externalId: `oakleaf-rate-void:${invoice.id}`, metadata: { sourceSha256: SOURCE_SHA256, previousStatus: PaymentStatus.OPEN, updatedStatus: PaymentStatus.VOID } } }); }
      for (const child of plan.children) { const fields = object(child.customFields); if (child.amountCents === 0) { await tx.child.update({ where: { id: child.id }, data: { customFields: input({ ...fields, tuitionBillingEnabled: false, tuitionAutobillEligible: false, tuitionPlanAmountCents: 0, tuitionNetAmountCents: 0, tuitionBillingHoldReason: `Included in ${plan.family.name}'s reviewed combined weekly responsibility.`, tuitionBillingUpdatedAt: appliedAt.toISOString(), tuitionBillingUpdatedBy: "Brenden Bruner - Oakleaf reviewed spreadsheet rates 2026-08-18", tuitionRateEvidence: { source: "oakleaf_account_balance_summary", sourceSha256: SOURCE_SHA256, sourceAsOf: "2026-08-02", accountKey: plan.target.accountKey, combinedFamilyResponsibility: true } }) } }); continue; }
        const matching = await tx.tuitionPlan.findMany({ where: { centerId: CENTER_ID, cadence: "weekly", amountCents: child.amountCents, ageGroup: child.ageGroup }, orderBy: { id: "asc" } }); invariant(matching.length <= 1, `${child.fullName} has duplicate matching plans.`); const tuitionPlan = matching[0] ?? await tx.tuitionPlan.create({ data: { centerId: CENTER_ID, name: `Oakleaf reviewed weekly responsibility - $${(child.amountCents / 100).toFixed(2)}`, ageGroup: child.ageGroup, cadence: "weekly", amountCents: child.amountCents } }); await tx.child.update({ where: { id: child.id }, data: { customFields: input({ ...fields, tuitionBillingEnabled: true, tuitionPlanId: tuitionPlan.id, tuitionPlanName: tuitionPlan.name, tuitionPlanAgeGroup: tuitionPlan.ageGroup, tuitionPlanCadence: "weekly", tuitionBillingCadence: "weekly", tuitionPlanAmountCents: child.amountCents, tuitionNetAmountCents: child.amountCents, tuitionAutobillEligible: true, tuitionBillingDay: 4, tuitionBillingStartsPeriod: "2026-W33", tuitionBillingDescription: tuitionPlan.name, tuitionBillingUpdatedAt: appliedAt.toISOString(), tuitionBillingUpdatedBy: "Brenden Bruner - Oakleaf reviewed spreadsheet rates 2026-08-18", tuitionRateEvidence: { source: "oakleaf_account_balance_summary", sourceSha256: SOURCE_SHA256, sourceAsOf: "2026-08-02", accountKey: plan.target.accountKey, combinedFamilyResponsibility: plan.children.length > 1 } }) } }); }
      for (const period of PERIODS) { const dueDate = plan.invoices.find((invoice) => object(invoice.customFields).billingPeriod === period)?.dueDate ?? appliedAt; const items = plan.children.filter((child) => child.amountCents > 0).map((child) => ({ description: `Reviewed weekly tuition - ${child.fullName}`, amountCents: child.amountCents, ledgerType: "tuition_charge" })); const result = await createBillingInvoiceForFamily(tx, { familyId: plan.family.id, dueDate, items, description: `Oakleaf reviewed weekly tuition ${period}`, customFields: { mode: "source_correction", centerId: CENTER_ID, childIds: plan.children.map((child) => child.id), chargeSource: "tuitionPlan", billingPeriod: period, coverageStartsPeriod: period, billingCadence: "weekly", grossTuitionCents: plan.weeklyCents, netTuitionCents: plan.weeklyCents, noPaymentSubmitted: true, sourceSha256: SOURCE_SHA256, dedupeKey: `oakleaf-reviewed-rate:${plan.family.id}:${period}:${SOURCE_SHA256}` } }); invariant(result.created && result.invoice.totalCents === plan.weeklyCents, `${plan.family.name} ${period} corrected invoice was not created exactly.`); }
      await tx.billingAccount.update({ where: { id: plan.account.id }, data: { customFields: input({ ...object(plan.account.customFields), tuitionAutobillEnabled: true, tuitionAutobillCadence: "weekly", tuitionAutobillBillingDay: 4, tuitionAutobillStartsPeriod: "2026-W33", tuitionAutobillAmountCents: plan.weeklyCents, tuitionAutobillUpdatedAt: appliedAt.toISOString(), tuitionAutobillUpdatedBy: "Brenden Bruner - Oakleaf reviewed spreadsheet rates 2026-08-18" }) } }); await tx.auditLog.create({ data: { tenantId: current.actor.tenantId, centerId: CENTER_ID, userId: current.actor.id, action: "billing.oakleaf_reviewed_weekly_rate_corrected", resource: "Family", resourceId: plan.family.id, metadata: { sourceSha256: SOURCE_SHA256, accountKey: plan.target.accountKey, oldInvoiceCents: plan.oldInvoiceCents, correctedInvoiceCents: plan.weeklyCents * PERIODS.length, expectedBalanceCents: plan.expectedBalanceCents, paymentsChanged: false } } });
    }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 300_000 });
  const after = await prisma.family.findMany({ where: { id: { in: before.plans.map((plan) => plan.family.id) } }, select: { id: true, billingAccount: { select: { balanceCents: true, ledgerEntries: { where: { balanceAfterCents: { not: null } }, orderBy: [{ effectiveAt: "desc" }, { createdAt: "desc" }], take: 1, select: { balanceAfterCents: true } } } }, children: { select: { fullName: true, customFields: true } } } });
  for (const plan of before.plans) { const family = after.find((item) => item.id === plan.family.id)!; invariant(family.billingAccount?.balanceCents === plan.expectedBalanceCents && family.billingAccount.ledgerEntries[0]?.balanceAfterCents === plan.expectedBalanceCents, `${plan.family.name} final balance/ledger mismatch.`); for (const [name, cents] of Object.entries(plan.target.assignments)) invariant(Number(object(family.children.find((child) => child.fullName === name)?.customFields).tuitionPlanAmountCents ?? 0) === cents, `${name} final rate mismatch.`); }
  console.log(JSON.stringify({ ok: true, familiesCorrected: before.plans.length, invoicesVoided: before.plans.reduce((sum, plan) => sum + plan.invoices.length, 0), invoicesCreated: before.plans.length * PERIODS.length, oldInvoiceCents: before.plans.reduce((sum, plan) => sum + plan.oldInvoiceCents, 0), correctedInvoiceCents: before.plans.reduce((sum, plan) => sum + plan.weeklyCents * PERIODS.length, 0), balanceReductionCents: before.plans.reduce((sum, plan) => sum + plan.oldInvoiceCents - plan.weeklyCents * PERIODS.length, 0), paymentsChanged: 0 }, null, 2));
}

async function main() { sourceEvidence(); const before = await load(); const applyMode = process.argv.includes(APPLY); console.log(JSON.stringify({ mode: applyMode ? "apply-preflight" : "dry-run", fingerprint: before.fingerprint, families: before.plans.length, invoicesToVoid: before.plans.reduce((sum, plan) => sum + plan.invoices.length, 0), invoicesToCreate: before.plans.length * PERIODS.length, oldInvoiceCents: before.plans.reduce((sum, plan) => sum + plan.oldInvoiceCents, 0), correctedInvoiceCents: before.plans.reduce((sum, plan) => sum + plan.weeklyCents * PERIODS.length, 0), balanceReductionCents: before.plans.reduce((sum, plan) => sum + plan.oldInvoiceCents - plan.weeklyCents * PERIODS.length, 0), paymentsToChange: 0 }, null, 2)); if (!applyMode) return; invariant(process.argv.includes(CONFIRM), `Apply requires ${CONFIRM}.`); const expected = process.argv.find((arg) => arg.startsWith(FINGERPRINT))?.slice(FINGERPRINT.length); invariant(expected, `Apply requires ${FINGERPRINT}<value>.`); await apply(expected); }
main().finally(() => prisma.$disconnect());
