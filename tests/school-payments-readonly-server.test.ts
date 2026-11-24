import assert from "node:assert/strict";
import { test } from "node:test";
import type { CurrentUser } from "../src/lib/auth";
import { loadSchoolPaymentsReadonly, type SchoolPaymentsReadAuthority } from "../src/lib/school-payments-readonly-server";
import { schoolPaymentsFixture } from "./helpers/school-payments-fixtures";

function fixture() {
  let user: CurrentUser | null = { id: "director_a", tenantId: "tenant_a", identityTenantId: "identity_tenant", role: "CENTER_DIRECTOR", accessScope: "center", centerIds: ["school_a"],
    deviceSessionId: "session_a", sessionVersion: 2, mustResetPassword: false } as CurrentUser;
  const input = schoolPaymentsFixture();
  let authority: SchoolPaymentsReadAuthority | null = { scope: input.scope, historyBindings: [], revision: "synthetic_current_binding_1" };
  let reads = 0, afterRead = () => {};
  const deps = { currentUser: async () => user, loadAuthority: async () => structuredClone(authority), read: async (a: SchoolPaymentsReadAuthority) => {
    reads++; assert.equal(a.scope.accountId, "acct_school_a"); afterRead(); return structuredClone(input);
  } };
  return { deps, input, setUser: (u: CurrentUser | null) => { user = u; }, get user() { return user!; }, get authority() { return authority!; },
    setAuthority: (a: SchoolPaymentsReadAuthority | null) => { authority = a; }, after: (run: () => void) => { afterRead = run; }, get reads() { return reads; } };
}
test("server Payments loader uses existing role/school grant and exact server account; projected output masks identifiers", async () => {
  const f = fixture(), r = await loadSchoolPaymentsReadonly("school_a", f.deps);
  assert.equal(r.ok, true); assert.equal(f.reads, 1);
  assert.equal(JSON.stringify(r).includes("acct_school_a"), false); assert.equal(JSON.stringify(r).includes("payout_1"), false);
});
test("foreign school, wrong role, owner flag alone and signed-out access cannot trigger a provider read", async () => {
  const f = fixture(); assert.equal((await loadSchoolPaymentsReadonly("foreign_school", f.deps)).ok, false);
  f.setUser({ ...f.user, role: "PARENT_GUARDIAN", isSchoolOwner: true });
  assert.equal((await loadSchoolPaymentsReadonly("school_a", f.deps)).ok, false);
  f.setUser(null); assert.equal((await loadSchoolPaymentsReadonly("school_a", f.deps)).ok, false); assert.equal(f.reads, 0);
});
test("grant/session/binding revocation during read removes the response instead of returning stale financial data", async () => {
  for (const change of ["grant", "session", "binding"] as const) {
    const f = fixture(); f.after(() => {
      if (change === "grant") f.setUser({ ...f.user, centerIds: [] });
      if (change === "session") f.setUser({ ...f.user, sessionVersion: 3 });
      if (change === "binding") f.authority.revision = "changed";
    });
    const r = await loadSchoolPaymentsReadonly("school_a", f.deps); assert.equal(r.ok, false); assert.equal("view" in r, false);
  }
});
test("provider rows cannot introduce prior-account access or change the server scope", async () => {
  const f = fixture(); f.input.payouts[0].accountId = "acct_prior"; f.input.payouts[0].ledger!.accountId = "acct_prior";
  f.input.historyBindings.push({ ...f.input.scope, accountId: "acct_prior", bindingId: "caller_not_authority", verified: true, source: "authoritative_center_account_history" });
  assert.equal((await loadSchoolPaymentsReadonly("school_a", f.deps)).ok, false);
  f.authority.historyBindings = structuredClone(f.input.historyBindings);
  assert.equal((await loadSchoolPaymentsReadonly("school_a", f.deps)).ok, true);
  f.authority.scope.tenantId = "foreign";
  assert.equal((await loadSchoolPaymentsReadonly("school_a", f.deps)).ok, false);
});
