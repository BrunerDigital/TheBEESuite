import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import * as reportHelpers from "../src/lib/agency-contract-report";

function handler(user: { role: string; centerIds: string[] } | null, records: unknown[] = []) {
  const queries: Array<Record<string, unknown>> = [];
  const routeModule = { exports: {} as { GET: (request: { nextUrl: URL }) => Promise<Response> } };
  const source = readFileSync(new URL("../src/app/api/billing/agency-contract-report/route.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const dependencies: Record<string, unknown> = {
    "next/server": { NextResponse: Response },
    "@/lib/auth": { getCurrentUser: async () => user, canManageBilling: (value: { role: string }) => value.role === "BILLING_ADMIN", canAccessCenter: (value: { centerIds: string[] }, id: string) => value.centerIds.includes(id) },
    "@/lib/agency-contract-report": reportHelpers,
    "@/lib/prisma": { prisma: { subsidyAuthorization: { findMany: async (query: Record<string, unknown>) => { queries.push(query); return records; } } } },
    "@/lib/request-response-logging": { withApiLogging: (_method: string, callback: unknown) => callback },
  };
  new Function("require", "module", "exports", compiled)((id: string) => {
    if (!(id in dependencies)) throw new Error(`Unexpected dependency: ${id}`);
    return dependencies[id];
  }, routeModule, routeModule.exports);
  return { get: (query: string) => routeModule.exports.GET({ nextUrl: new URL(`https://example.test/report?${query}`) }), queries };
}
const dates = "start=1990-01-01&end=2026-09-23";
test("anonymous, nonbilling, and other-school requests never query contracts", async () => {
  for (const [user, status] of [[null, 401], [{ role: "PARENT", centerIds: ["school"] }, 403], [{ role: "BILLING_ADMIN", centerIds: ["other"] }, 403]] as const) {
    const route = handler(user ? { role: user.role, centerIds: [...user.centerIds] } : null);
    assert.equal((await route.get(`centerId=school&${dates}`)).status, status);
    assert.equal(route.queries.length, 0);
  }
});
test("auditor report includes only matching school relations and requested coverage", async () => {
  const route = handler({ role: "READ_ONLY_AUDITOR", centerIds: ["school"] });
  const response = await route.get(`centerId=school&${dates}`);
  assert.equal(response.status, 200); assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.deepEqual(route.queries[0].where, { centerId: "school", agencyProgram: { centerId: "school" }, family: { centerId: "school" }, child: { family: { centerId: "school" } }, coverageStart: { lt: new Date("2026-09-24T00:00:00Z") }, coverageEnd: { gte: new Date("1990-01-01T00:00:00Z") } });
});
test("invalid dates and oversized reports fail without silently returning partial totals", async () => {
  const route = handler({ role: "BILLING_ADMIN", centerIds: ["school"] });
  assert.equal((await route.get("centerId=school&start=2026-02-30&end=2026-03-01")).status, 400);
  assert.equal(route.queries.length, 0);
  const large = handler({ role: "BILLING_ADMIN", centerIds: ["school"] }, Array(10001).fill({}));
  assert.equal((await large.get(`centerId=school&${dates}`)).status, 422);
});

