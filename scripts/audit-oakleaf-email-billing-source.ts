import "./load-env";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { parseRenderedProcareBalanceRows } from "@/lib/procare-rendered-report-import";
import { prisma } from "@/lib/prisma";

const CENTER_ID = "cmp4ew9h2001m6alwxssr4wr6";
const CONTRACT_SHA = "964238cd50e727fecc3de6a2f144c8d50765d7bd5ee83221f8fec1b90a8601ad";
const BALANCE_SHA = "8ffdd96e24e078133959253ceac0cd45072f53a6229baecacfa85b26d3c6a5cc";
function invariant(v: unknown, m: string): asserts v { if (!v) throw new Error(m); }
function sha(b: Buffer) { return createHash("sha256").update(b).digest("hex"); }
function money(v = "") { const n = v.trim().replace(/[$,]/g, ""); return /^-?\d+(?:\.\d{1,2})?$/.test(n) ? Math.round(Number(n) * 100) : null; }
function csv(text: string) {
  const rows: string[][] = []; let row: string[] = []; let field = ""; let quoted = false;
  for (let i = 0; i < text.length; i++) { const c = text[i], n = text[i + 1]; if (c === '"' && quoted && n === '"') { field += '"'; i++; } else if (c === '"') quoted = !quoted; else if (c === "," && !quoted) { row.push(field.trim()); field = ""; } else if ((c === "\r" || c === "\n") && !quoted) { if (c === "\r" && n === "\n") i++; row.push(field.trim()); if (row.some(Boolean)) rows.push(row); row = []; field = ""; } else field += c; }
  row.push(field.trim()); if (row.some(Boolean)) rows.push(row); return rows;
}
function key(v: string) { return v.toLowerCase().replace(/[^a-z0-9]/g, ""); }
function displayName(v: string) { const [last, ...rest] = v.split(",").map((x) => x.trim()); return rest.length ? `${rest.join(" ")} ${last}`.trim() : v.trim(); }

async function main() {
  const cp = process.env.OAKLEAF_CONTRACT_CSV_PATH ?? ""; const bp = process.env.OAKLEAF_BALANCE_CSV_PATH ?? "";
  invariant(cp && bp, "Both source paths are required."); const cb = readFileSync(cp); const bb = readFileSync(bp);
  invariant(sha(cb) === CONTRACT_SHA && sha(bb) === BALANCE_SHA, "Email attachment fingerprint changed.");
  const contracts = new Map<string, { child: string; classroom: string; payer: string; accountKey: string; weeklyCents: number }>();
  for (const r of csv(cb.toString("utf8"))) {
    if (r[14] !== "Weekly" || !r[13]?.includes(" Primary,")) continue;
    const weeklyCents = money(r[18]); if (weeklyCents == null) continue;
    const accountKey = r[13].split(/\s+/)[0].replace(/\*/g, "").toUpperCase();
    contracts.set(key(displayName(r[8])), { child: displayName(r[8]), classroom: r[10], payer: r[13], accountKey, weeklyCents });
  }
  const balances = parseRenderedProcareBalanceRows(bb);
  const sourceAccounts = [...new Set([...contracts.values()].map((x) => x.accountKey))];
  const sourceBalanceRows = sourceAccounts.map((accountKey) => ({ accountKey, rows: balances.filter((r) => r.accountKey.replace(/\*/g, "") === accountKey).map((r) => ({ payer: r.payerName, balanceCents: r.balanceCents, hidden: r.hidden })) }));
  const families = await prisma.family.findMany({ where: { centerId: CENTER_ID }, select: { id: true, name: true, externalId: true, children: { select: { id: true, fullName: true, enrollmentStatus: true, classroomId: true, customFields: true } }, billingAccount: { select: { balanceCents: true } } } });
  const matches = [...contracts.values()].map((contract) => { const candidates = families.flatMap((family) => family.children.map((child) => ({ family, child }))).filter((x) => key(x.child.fullName) === key(contract.child)); return { ...contract, candidates: candidates.map((x) => ({ familyId: x.family.id, family: x.family.name, externalId: x.family.externalId, balanceCents: x.family.billingAccount?.balanceCents, childId: x.child.id, status: x.child.enrollmentStatus, classroomId: x.child.classroomId, savedWeeklyCents: Number((x.child.customFields as Record<string, unknown> | null)?.tuitionPlanAmountCents ?? 0) })) }; });
  const unmatched = matches.filter((x) => x.candidates.length !== 1);
  console.log(JSON.stringify({ source: { contractSha256: sha(cb), balanceSha256: sha(bb), contractChildren: contracts.size, contractAccounts: sourceAccounts.length }, contractWeeklyTotalCents: [...contracts.values()].reduce((s, x) => s + x.weeklyCents, 0), sourceBalanceRows, matchedChildren: matches.length - unmatched.length, unmatched, matches }, null, 2));
}
main().finally(() => prisma.$disconnect());
