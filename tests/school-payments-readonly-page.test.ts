import assert from "node:assert/strict";
import { test } from "node:test";
import { readSchoolPaymentsPage } from "../src/lib/school-payments-readonly-page";
import { schoolPaymentsReadonlyEnabled, schoolPaymentsReadonlyHref } from "../src/lib/school-payments-readonly-entry";
import { readSchoolPaymentsSnapshot, schoolPaymentsWindow } from "../src/lib/school-payments-readonly-adapter";
import { paymentsAuthority, paymentsDirector, paymentsProviderFixture } from "./helpers/school-payments-integration-fixtures";
import type { CurrentUser } from "../src/lib/auth";

function fixture() {
  let user: CurrentUser | null = structuredClone(paymentsDirector); const calls: string[] = [];
  const deps = { currentUser: async () => { calls.push("user"); return user; }, schools: async () => { calls.push("schools"); return [{ id: "school_a", name: "Fixture School Alpha" }, { id: "school_b", name: "Fixture School Beta" }]; },
    loadAuthority: async (_u: CurrentUser, id: string) => { calls.push(`authority:${id}`); return paymentsAuthority(id); },
    read: async (a: ReturnType<typeof paymentsAuthority>) => { calls.push(`read:${a.scope.centerId}`); return readSchoolPaymentsSnapshot(a, schoolPaymentsWindow("2026-11-17", "2026-11-23"), paymentsProviderFixture(a.scope.centerId).providers); } };
  return { deps, calls, setUser: (u: CurrentUser | null) => { user = u; } };
}
test("feature defaults off and rejects public/boolean/query-like opt-ins without performing any read", async () => {
  for (const env of [{}, { NEXT_PUBLIC_BEE_SCHOOL_PAYMENTS_READONLY: "enabled" }, { BEE_SCHOOL_PAYMENTS_READONLY: "true" }, { BEE_SCHOOL_PAYMENTS_READONLY: "1" }]) assert.equal(schoolPaymentsReadonlyEnabled(env), false);
  assert.equal(schoolPaymentsReadonlyEnabled({ BEE_SCHOOL_PAYMENTS_READONLY: "enabled" }), true);
  const f = fixture(); assert.equal((await readSchoolPaymentsPage({ enabled: false }, f.deps)).status, "disabled"); assert.deepEqual(f.calls, []);
});
test("selected-school navigation performs an independently authorized read and never exposes the previous school snapshot", async () => {
  const f = fixture(); const a = await readSchoolPaymentsPage({ enabled: true, centerId: "school_a" }, f.deps);
  const b = await readSchoolPaymentsPage({ enabled: true, centerId: "school_b" }, f.deps);
  assert.equal(a.status, "ready"); assert.equal(b.status, "ready");
  if (a.status !== "ready" || b.status !== "ready") throw Error("Fixture page unavailable");
  assert.equal(a.view.centerId, "school_a"); assert.equal(b.view.centerId, "school_b");
  assert.ok(f.calls.includes("read:school_b")); assert.equal(JSON.stringify(b.view).includes("Fixture School Alpha"), false);
  assert.equal(schoolPaymentsReadonlyHref("school?&foreign=1"), "/school-payments?center=school%3F%26foreign%3D1");
});
test("foreign school, signed-out, FTE, parent, password-reset and missing session are denied before private/provider reads", async () => {
  for (const user of [null, { ...paymentsDirector, role: "PARENT_GUARDIAN" }, { ...paymentsDirector, applicationAccess: "fte_only" },
    { ...paymentsDirector, mustResetPassword: true }, { ...paymentsDirector, deviceSessionId: null }] as Array<CurrentUser | null>) {
    const f = fixture(); f.setUser(user); const r = await readSchoolPaymentsPage({ enabled: true, centerId: "school_a" }, f.deps);
    assert.equal(r.status, "denied"); assert.equal(f.calls.some(x => x.startsWith("read:")), false);
  }
  const f = fixture(); assert.equal((await readSchoolPaymentsPage({ enabled: true, centerId: "foreign" }, f.deps)).status, "denied");
  assert.equal(f.calls.some(x => x.startsWith("authority:") || x.startsWith("read:")), false);
});
