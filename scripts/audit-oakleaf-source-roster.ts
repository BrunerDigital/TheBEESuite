import "./load-env";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { Prisma } from "@prisma/client";
import { currentlyEnrolledChildWhere } from "@/lib/enrollment-status";
import { prisma } from "@/lib/prisma";
import { parseRenderedProcareBalanceRows } from "@/lib/procare-rendered-report-import";

const CENTER_ID = "cmp4ew9h2001m6alwxssr4wr6";
const SOURCE_SHA256 = "1d28dd395fe6c89c82dd0567e8aaa292e118cae346311c78f5fe4e4357e89425";

function clean(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function object(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function id(value: unknown) { return clean(value).toUpperCase().replace(/[^A-Z0-9_-]/g, ""); }
function name(value: unknown) {
  return clean(value).toLowerCase().replace(/\b(family|household)\b/g, "").match(/[a-z0-9]+/g)?.sort().join("\0") ?? "";
}
function money(value: string) {
  const normalized = value.trim().replace(/[,$()\s]/g, "");
  if (!/^[-+]?\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  return Math.round(Number(normalized) * 100) * (/^\(.*\)$/.test(value.trim()) ? -1 : 1);
}
function csv(text: string) {
  const rows: string[][] = []; let row: string[] = []; let field = ""; let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]; const next = text[index + 1];
    if (char === '"' && quoted && next === '"') { field += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { row.push(field.trim()); field = ""; }
    else if ((char === "\r" || char === "\n") && !quoted) { if (char === "\r" && next === "\n") index += 1; row.push(field.trim()); if (row.some(Boolean)) rows.push(row); row = []; field = ""; }
    else field += char;
  }
  row.push(field.trim()); if (row.some(Boolean)) rows.push(row); return rows;
}

async function main() {
  const sourcePath = clean(process.env.OAKLEAF_PROCARE_BALANCE_CSV_PATH);
  if (!sourcePath) throw new Error("OAKLEAF_PROCARE_BALANCE_CSV_PATH is required.");
  const sourceBuffer = readFileSync(sourcePath);
  const sourceSha256 = createHash("sha256").update(sourceBuffer).digest("hex");
  if (sourceSha256 !== SOURCE_SHA256) {
    throw new Error(`Oakleaf source fingerprint mismatch: expected ${SOURCE_SHA256}, received ${sourceSha256}.`);
  }
  const rendered = parseRenderedProcareBalanceRows(sourceBuffer);
  const rateRows = csv(sourceBuffer.toString("utf8")).map((row) => ({
    accountKey: row[9]?.match(/\[\*?([A-Z0-9_-]+)\*?\]/i)?.[1]?.toUpperCase() ?? "",
    payerName: (row[9] ?? "").replace(/^\s*\[\*?[A-Z0-9_-]+\*?\]\s*/i, "").replace(/\s+-\s+Hidden\s*$/i, "").trim(),
    weeklyCents: money(row[8] ?? ""),
  })).filter((row) => row.accountKey && row.weeklyCents !== null);
  const canonical = [...new Map(rendered.map((row) => [`${row.accountKey}|${name(row.payerName)}|${row.hidden}|${row.balanceCents}`, row])).values()];
  const byKey = new Map<string, typeof canonical>();
  for (const row of canonical) byKey.set(row.accountKey, [...(byKey.get(row.accountKey) ?? []), row]);

  const [families, imports] = await Promise.all([
    prisma.family.findMany({
      where: { centerId: CENTER_ID, children: { some: currentlyEnrolledChildWhere() } },
      select: {
        id: true, name: true, externalId: true, customFields: true,
        guardians: { select: { fullName: true } },
        children: { where: currentlyEnrolledChildWhere(), select: { id: true, fullName: true, enrollmentStatus: true, classroomId: true, customFields: true } },
        billingAccount: { select: { id: true, balanceCents: true, customFields: true, invoices: { select: { id: true, number: true, status: true, totalCents: true, sourceSystem: true, externalId: true, customFields: true, ledgerEntries: { select: { id: true, type: true, amountCents: true, paymentId: true } } } }, payments: { select: { id: true, amountCents: true, status: true, provider: true, customFields: true } } } },
      }, orderBy: { name: "asc" },
    }),
    prisma.procareImportRow.findMany({ where: { batch: { centerId: CENTER_ID }, createdFamilyId: { not: null } }, select: { createdFamilyId: true, rawData: true } }),
  ]);
  const importIds = new Map<string, Set<string>>();
  for (const row of imports) {
    if (!row.createdFamilyId) continue;
    const target = importIds.get(row.createdFamilyId) ?? new Set<string>();
    const raw = object(row.rawData);
    for (const key of ["account key", "account id", "account number", "family id", "procare account id"]) {
      const value = id(raw[key]); if (value) target.add(value);
    }
    importIds.set(row.createdFamilyId, target);
  }

  const classified = families.map((family) => {
    const fields = object(family.customFields);
    const keys = [...new Set([family.externalId, fields.procareAccountKey, fields.sourceAccountId, fields.procareAccountId, ...(importIds.get(family.id) ?? [])].map(id).filter(Boolean))];
    const candidates = [...new Set(keys.flatMap((key) => byKey.get(key) ?? []))];
    const names = new Set([name(family.name), ...family.guardians.map((guardian) => name(guardian.fullName))].filter(Boolean));
    const exact = candidates.filter((row) => names.has(name(row.payerName)));
    const matched = exact.length ? exact : candidates.length === 1 ? candidates : [];
    const active = matched.filter((row) => !row.hidden);
    const withdrawn = matched.filter((row) => row.hidden);
    const classification = active.length ? "source_current" : withdrawn.length ? "source_withdrawn" : "unmatched_current";
    return {
      classification, familyId: family.id, familyName: family.name, keys,
      currentChildren: family.children.map((child) => ({ id: child.id, name: child.fullName, weeklyCents: Number(object(child.customFields).tuitionPlanAmountCents ?? 0), enabled: object(child.customFields).tuitionBillingEnabled === true })),
      balanceCents: family.billingAccount?.balanceCents ?? 0,
      invoices: family.billingAccount?.invoices ?? [],
      payments: family.billingAccount?.payments ?? [],
      sourceRows: matched.map((row) => ({ accountKey: row.accountKey, payerName: row.payerName, hidden: row.hidden, balanceCents: row.balanceCents })),
    };
  });
  const groups = classified.reduce<Record<string, typeof classified>>((result, row) => {
    (result[row.classification] ??= []).push(row);
    return result;
  }, {});
  const rateComparison = classified.filter((row) => row.classification === "source_current").map((row) => {
    const sourceRates = rateRows.filter((rate) => row.keys.includes(rate.accountKey) && row.sourceRows.some((source) => name(source.payerName) === name(rate.payerName))).map((rate) => rate.weeklyCents!);
    const beeRates = row.currentChildren.filter((child) => child.enabled).map((child) => child.weeklyCents);
    return { familyId: row.familyId, familyName: row.familyName, sourceWeeklyCents: sourceRates.reduce((sum, rate) => sum + rate, 0), beeWeeklyCents: beeRates.reduce((sum, rate) => sum + rate, 0), sourceRateCount: sourceRates.length, beeRateCount: beeRates.length, currentChildren: row.currentChildren.map((child) => ({ id: child.id, name: child.name, weeklyCents: child.weeklyCents, enabled: child.enabled })) };
  });
  console.log(JSON.stringify({
    sourceSha256,
    summary: Object.fromEntries(Object.entries(groups).map(([key, rows]) => [key, { families: rows?.length ?? 0, balanceCents: rows?.reduce((sum, row) => sum + row.balanceCents, 0) ?? 0 }])),
    weeklyRateComparison: { exactFamilies: rateComparison.filter((row) => row.sourceRateCount > 0 && row.sourceWeeklyCents === row.beeWeeklyCents), sourceNoRate: rateComparison.filter((row) => row.sourceRateCount === 0), mismatches: rateComparison.filter((row) => row.sourceRateCount > 0 && row.sourceWeeklyCents !== row.beeWeeklyCents) },
    sourceWithdrawnStillCurrent: groups.source_withdrawn ?? [],
    unmatchedCurrent: groups.unmatched_current ?? [],
  }, null, 2));
}

main().finally(() => prisma.$disconnect());
