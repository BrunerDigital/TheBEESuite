import assert from "node:assert/strict";
import { test } from "node:test";
import type { StripeConnectedAccountSnapshot } from "../src/lib/integrations";
import { schoolPaymentsBoundAuthority } from "../src/lib/school-payments-readonly-authority";
import { paymentsDirector } from "./helpers/school-payments-integration-fixtures";

function fixture() {
  const calls: unknown[][] = [], center = { id: "school_a", name: "Fixture School Alpha", organization: { tenantId: "tenant_a" }, updatedAt: new Date("2026-11-23T00:00:00Z"), customFields: { stripeConnectAccountId: "acct_school_a" } };
  const account = { id: "acct_school_a", dashboard: "full", configurations: ["merchant"], merchantCapabilityStatus: "active", chargesEnabled: true } as StripeConnectedAccountSnapshot;
  return { center, account, calls, deps: { center: async (tenantId: string, id: string) => { calls.push(["center", tenantId, id]); return center; },
    account: async (tenantId: string, id: string) => { calls.push(["account", tenantId, id]); return { ok: true, account }; } } };
}
test("authority uses the existing school grant, tenant-scoped Center and exact independently retrieved account", async () => {
  const f = fixture(), a = await schoolPaymentsBoundAuthority(paymentsDirector, "school_a", f.deps);
  assert.equal(a?.scope.accountId, "acct_school_a"); assert.deepEqual(a?.historyBindings, []);
  assert.deepEqual(f.calls, [["center", "tenant_a", "school_a"], ["account", "tenant_a", "acct_school_a"]]);
});
test("foreign grant and wrong role do not trigger a Center or provider read", async () => {
  const f = fixture(); assert.equal(await schoolPaymentsBoundAuthority(paymentsDirector, "foreign", f.deps), null);
  assert.equal(await schoolPaymentsBoundAuthority({ ...paymentsDirector, role: "PARENT_GUARDIAN" }, "school_a", f.deps), null); assert.deepEqual(f.calls, []);
});
test("wrong tenant, missing binding and conflicting aliases fail before processor access", async () => {
  for (const issue of ["tenant", "missing", "aliases"] as const) {
    const f = fixture();
    if (issue === "tenant") f.center.organization.tenantId = "foreign";
    if (issue === "missing") f.center.customFields.stripeConnectAccountId = "";
    if (issue === "aliases") Object.assign(f.center.customFields, { stripeConnectedAccountId: "acct_other" });
    assert.equal(await schoolPaymentsBoundAuthority(paymentsDirector, "school_a", f.deps), null);
    assert.equal(f.calls.some(c => c[0] === "account"), false);
  }
});
test("wrong account identity, unknown dashboard and recipient-only topology cannot expose current account data", async () => {
  for (const issue of ["account", "dashboard", "topology"] as const) {
    const f = fixture(); if (issue === "account") f.account.id = "acct_other";
    if (issue === "dashboard") f.account.dashboard = "unknown";
    if (issue === "topology") { f.account.configurations = ["recipient"]; f.account.merchantCapabilityStatus = null; f.account.chargesEnabled = false; }
    assert.equal(await schoolPaymentsBoundAuthority(paymentsDirector, "school_a", f.deps), null);
  }
});
