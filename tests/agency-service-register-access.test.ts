import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import * as helpers from "../src/lib/agency-service-register";
import { contractReportRange } from "../src/lib/agency-contract-report";

// Node 24 is the repository runtime. Strip only types; execute the actual GET body.
const { stripTypeScriptTypes } = createRequire(import.meta.url)("node:module");
function handler(user: { role: string; centerIds: string[]; applicationAccess?: string } | null, claims: unknown[] = [], authorizations: unknown[] = []) {
  const queries: Array<{ table: string; query: Record<string, unknown> }> = [];
  let transactions = 0;
  const source = readFileSync(new URL("../src/app/api/billing/agency-service-register/route.ts", import.meta.url), "utf8");
  const executable = stripTypeScriptTypes(source).replace(/^import .*;\s*$/gm, "").replace(/^export const /gm, "const ");
  const dependencies = {
    Prisma: { TransactionIsolationLevel: { RepeatableRead: "RepeatableRead" } }, NextResponse: Response,
    getCurrentUser: async () => user,
    canManageBilling: (value: NonNullable<typeof user>) => value.applicationAccess !== "fte_only" && ["CENTER_DIRECTOR", "BILLING_ADMIN"].includes(value.role),
    canAccessCenter: (value: NonNullable<typeof user>, id: string) => value.centerIds.includes(id),
    contractReportRange, ...helpers,
    prisma: { $transaction: async (callback: (tx: unknown) => unknown, options: unknown) => {
      transactions++; assert.deepEqual(options, { isolationLevel: "RepeatableRead" });
      return callback({ subsidyClaim: { findMany: async (query: Record<string, unknown>) => { queries.push({ table: "claims", query }); return claims; } },
        subsidyAuthorization: { findMany: async (query: Record<string, unknown>) => { queries.push({ table: "authorizations", query }); return authorizations; } } });
    } }, withApiLogging: (_method: string, callback: unknown) => callback,
  };
  const get = new Function(...Object.keys(dependencies), `${executable}\nreturn GET;`)(...Object.values(dependencies));
  return { get: (query: string) => get({ nextUrl: new URL(`https://example.test/register?${query}`) }) as Promise<Response>, queries, transactions: () => transactions };
}
const dates = "centerId=school&start=2026-10-05&end=2026-10-11";
test("anonymous, teacher, FTE-only and other-school requests never query financial records", async () => {
  for (const [user, status] of [[null, 401], [{ role: "TEACHER", centerIds: ["school"] }, 403], [{ role: "CENTER_DIRECTOR", centerIds: ["school"], applicationAccess: "fte_only" }, 403], [{ role: "BILLING_ADMIN", centerIds: ["other"] }, 403]] as const) {
    const route = handler(user ? { ...user, centerIds: [...user.centerIds] } : null);
    assert.equal((await route.get(dates)).status, status); assert.equal(route.transactions(), 0);
  }
});
test("director and auditor get scoped, noncached read-only snapshots", async () => {
  for (const role of ["CENTER_DIRECTOR", "READ_ONLY_AUDITOR"]) {
    const route = handler({ role, centerIds: ["school"] }); const response = await route.get(dates);
    assert.equal(response.status, 200); assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    assert.equal(route.transactions(), 1); assert.equal(route.queries.length, 2);
    const claimWhere = route.queries[0].query.where as Record<string, unknown>;
    assert.equal(claimWhere.centerId, "school"); assert.deepEqual(claimWhere.agencyProgram, { centerId: "school" });
    assert.deepEqual(claimWhere.OR, [{ authorizationId: null }, { authorization: { centerId: "school", agencyProgram: { centerId: "school" }, family: { centerId: "school" }, child: { family: { centerId: "school" } } } }]);
    assert.equal(route.queries[0].query.take, 5001);
    assert.equal((await response.json()).rows.length, 0);
  }
});
test("bad dates and oversized results fail without partial totals", async () => {
  const route = handler({ role: "CENTER_DIRECTOR", centerIds: ["school"] });
  assert.equal((await route.get("centerId=school&start=2026-02-30&end=2026-03-01")).status, 400);
  assert.equal((await route.get("centerId=school&start=2020-01-01&end=2026-03-01")).status, 400);
  assert.equal(route.transactions(), 0);
  for (const [claims, authorizations] of [[Array(5001).fill({}), []], [[], Array(5001).fill({})]]) {
    assert.equal((await handler({ role: "CENTER_DIRECTOR", centerIds: ["school"] }, claims, authorizations).get(dates)).status, 422);
  }
});
test("report route exports no write methods and UI discards obsolete results", () => {
  const route = readFileSync(new URL("../src/app/api/billing/agency-service-register/route.ts", import.meta.url), "utf8");
  assert.doesNotMatch(route, /export const (POST|PATCH|PUT|DELETE)|\.(create|update|delete|upsert)\(/);
  const ui = readFileSync(new URL("../src/components/agency-service-register.tsx", import.meta.url), "utf8");
  assert.match(ui, /activeRequest.current\?\.abort\(\)/); assert.match(ui, /activeRequest.current === controller/);
  assert.match(ui, /invalidate\(\); setStart/); assert.match(ui, /invalidate\(\); setEnd/);
  const workspace = readFileSync(new URL("../src/components/agency-subsidy-workspace.tsx", import.meta.url), "utf8");
  assert.match(workspace, /AgencyServiceRegister key=\{`\$\{centerId\}:\$\{registerRevision\}`\}/);
  assert.match(workspace, /if \(!requestCenterId\) return;\s*setRegisterRevision/);
  assert.match(workspace, /uncertain mutation outcome[\s\S]*?setRegisterRevision/);
  assert.match(workspace, /else \{ setData\(body\); setRegisterRevision/);
  assert.match(workspace, /finally \{\s*if \(centerIdRef.current === requestCenterId\) \{ setPending\(false\); setRegisterRevision/);
});
