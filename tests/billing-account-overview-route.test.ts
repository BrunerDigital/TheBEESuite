import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

function harness({ signedIn = true, billingAccess = true, moduleAccess = true, authorized = true } = {}) {
  const calls: string[] = [];
  const target = { tenantId: "tenant-a", centerId: "school-a", familyId: "family-a", billingAccountId: "account-a" };
  const snapshot = { billingAccount: { balanceCents: 24500 }, collectableCents: 14500, responsibilityReviewRequired: false, draftStripePayments: [] };
  const requireStub = (name: string) => {
    if (name === "next/server") return { NextResponse: { json: (body: unknown, options?: { status?: number; headers?: unknown }) => ({ body, status: options?.status ?? 200, headers: options?.headers }) } };
    if (name === "@prisma/client") return { Prisma: { TransactionIsolationLevel: { RepeatableRead: "RepeatableRead" } } };
    if (name.endsWith("/auth")) return { getCurrentUser: async () => signedIn ? { id: "director" } : null, canManageBilling: () => billingAccess, canAccessModule: () => moduleAccess };
    if (name.endsWith("/rbac")) return { canAccessModule: () => moduleAccess };
    if (name.endsWith("family-payment-preflight")) return { readAuthorizedFamilyPaymentTarget: async () => { calls.push("authorize"); return authorized ? target : null; } };
    if (name.endsWith("family-payment-snapshot")) return { readFamilyPaymentSnapshot: async () => { calls.push("financial-read"); return snapshot; } };
    if (name.endsWith("director-payment-progress")) return { directorPaymentProgress: () => ({ count: 1, provisionalAchCreditCents: 10000 }) };
    if (name.endsWith("/prisma")) return { prisma: { $transaction: async (fn: (tx: object) => Promise<unknown>, options: { isolationLevel: string }) => { assert.equal(options.isolationLevel, "RepeatableRead"); return fn({}); } } };
    if (name.endsWith("request-response-logging")) return { withApiLogging: (_path: string, fn: unknown) => fn };
    throw new Error(`Unexpected import ${name}`);
  };
  const source = readFileSync("src/app/api/billing/account-overview/route.ts", "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const routeModule = { exports: {} as { GET: (req: { nextUrl: URL }) => Promise<{ status: number; body: unknown; headers?: Record<string, string> }> } };
  new Function("require", "module", "exports", compiled)(requireStub, routeModule, routeModule.exports);
  const request = (centerId = target.centerId, query = `familyId=${target.familyId}&billingAccountId=${target.billingAccountId}`) => routeModule.exports.GET({ nextUrl: new URL(`https://example.test/api/billing/account-overview?centerId=${centerId}&${query}`) });
  return { calls, target, request };
}

test("account overview denies anonymous, non-billing and module-restricted actors before reads", async () => {
  for (const [options, status] of [[{ signedIn: false }, 401], [{ billingAccess: false }, 403], [{ moduleAccess: false }, 403]] as const) {
    const h = harness(options);
    assert.equal((await h.request()).status, status);
    assert.deepEqual(h.calls, []);
  }
});

test("an unauthorized account or mismatched school never materializes a financial snapshot", async () => {
  const h = harness({ authorized: false });
  assert.equal((await h.request()).status, 404);
  assert.deepEqual(h.calls, ["authorize"]);
  const mismatch = harness();
  assert.equal((await mismatch.request("other-school")).status, 404);
  assert.deepEqual(mismatch.calls, ["authorize"]);
  const missing = harness();
  assert.equal((await missing.request("school-a", "")).status, 400);
  assert.deepEqual(missing.calls, []);
});

test("authorized account overview returns checkout's authoritative projection without writes", async () => {
  const h = harness();
  const response = await h.request();
  assert.equal(response.status, 200);
  assert.equal(response.headers?.["Cache-Control"], "private, no-store");
  assert.deepEqual(response.body, { familyId: "family-a", centerId: "school-a", billingAccountId: "account-a", postedBalanceCents: 24500, collectibleCents: 14500, pendingCount: 1, provisionalAchCreditCents: 10000, responsibilityReviewRequired: false });
  assert.deepEqual(h.calls, ["authorize", "financial-read"]);
});
