import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import './tuition-atomic-loader.mjs';

const fixture = globalThis.__atomicTuition = {};
const coverage = period => ({ status: 'OPEN', customFields: { childId: 'child', chargeSource: 'tuitionPlan', mode: 'recurring', billingPeriod: period, coverageStartsPeriod: period, invoiceWeekCount: 2 } });
function reset() {
  fixture.actor = { id: 'director', tenantId: 'tenant', email: 'director@example.test', role: 'CENTER_DIRECTOR', centerIds: ['school'] };
  fixture.state = {
    children: [{ id: 'child', familyId: 'family', fullName: 'Synthetic Child', classroomId: 'class', enrollmentStatus: 'enrolled', customFields: { tuitionPlanId: 'rate', tuitionNetAmountCents: 20000, tuitionBillingEnabled: true, tuitionBillingCadence: 'biweekly', tuitionBillingStartsPeriod: '2026-W40', tuitionBillingInvoiceDelayWeeks: 1, preservedChild: true } }],
    family: { id: 'family', centerId: 'school', name: 'Synthetic family' },
    center: { id: 'school', tenantId: 'tenant', customFields: {} },
    plans: [{ id: 'rate', centerId: 'school', name: 'Original', cadence: 'biweekly', ageGroup: 'Preschool', amountCents: 20000 }],
    account: { customFields: { preservedAccount: true }, balanceCents: 1234 },
    invoices: [coverage('2026-W40'), coverage('2026-W42')], audits: [],
  };
  fixture.version = 0; fixture.attempts = 0; fixture.rateWrites = 0;
  fixture.afterRateWrite = null; fixture.beforeCommit = null; fixture.fail = null;
  fixture.locks = []; fixture.auditTxs = [];
}
reset();
function transactionClient(state, attempt) {
  const held = new Set();
  const requireLock = table => assert.ok(held.has(table), `${table} lock precedes state access`);
  const tx = {
    async $queryRaw(query) {
      if (fixture.fail?.startsWith('raw-')) throw Object.assign(new Error('raw query failure'), { code: 'P2010', meta: { code: fixture.fail.slice(4) } });
      const table = query.text.match(/FROM "(\w+)"/)?.[1];
      assert.ok(table, query.text); assert.match(query.text, /FOR UPDATE/);
      if (table === 'Invoice') {
        assert.match(query.text, /FOR UPDATE OF "Invoice" NOWAIT/);
        if (fixture.fail === 'coverage-lock') throw Object.assign(new Error('row lock busy'), { code: 'P2010', meta: { code: '55P03' } });
      }
      held.add(table); fixture.locks.push({ attempt, table }); return [];
    },
    child: {
      async findUnique({ where }) {
        requireLock('Family'); requireLock('Child');
        const child = state.children.find(row => row.id === where.id);
        return child ? structuredClone({ ...child, family: state.family }) : null;
      },
      async findFirst({ where }) {
        requireLock('Center'); requireLock('TuitionPlan');
        return state.family.centerId === where.family.centerId ? state.children.find(row => row.customFields.tuitionPlanId === where.customFields.equals) ?? null : null;
      },
      async update({ where, data }) {
        requireLock('Child'); if (fixture.fail === 'child') throw new Error('synthetic child failure');
        const child = state.children.find(row => row.id === where.id); Object.assign(child, structuredClone(data)); return structuredClone(child);
      },
    },
    center: {
      async findFirst({ where }) {
        requireLock('Center'); return where.id === state.center.id && where.organization.tenantId === state.center.tenantId ? structuredClone(state.center) : null;
      },
      async update({ data }) { requireLock('Center'); Object.assign(state.center, data); },
    },
    tuitionPlan: {
      async findUnique({ where }) { requireLock('TuitionPlan'); return structuredClone(state.plans.find(row => row.id === where.id) ?? null); },
      async create({ data }) {
        requireLock('Center'); const plan = { id: `new-rate-${state.plans.length}`, ...data }; state.plans.push(plan); fixture.rateWrites++;
        if (fixture.afterRateWrite) await fixture.afterRateWrite({ state, attempt }); return structuredClone(plan);
      },
      async update({ where, data }) {
        requireLock('Center'); requireLock('TuitionPlan'); const plan = state.plans.find(row => row.id === where.id); Object.assign(plan, data); fixture.rateWrites++;
        if (fixture.afterRateWrite) await fixture.afterRateWrite({ state, attempt }); return structuredClone(plan);
      },
    },
    invoice: { async findMany({ where, take }) {
      requireLock('Family'); requireLock('Child'); requireLock('BillingAccount'); requireLock('Center'); requireLock('Invoice');
      return structuredClone(state.invoices.filter(row => row.status !== 'VOID' && where.AND.every(c => row.customFields[c.customFields.path[0]] === c.customFields.equals)).slice(0, take));
    } },
    billingAccount: {
      async findUnique() { requireLock('BillingAccount'); return structuredClone(state.account); },
      async upsert({ update, create }) {
        requireLock('Family'); requireLock('BillingAccount');
        if (fixture.fail === 'account') throw new Error('synthetic account failure');
        if (state.account) Object.assign(state.account, structuredClone(update)); else state.account = structuredClone(create);
        return structuredClone(state.account);
      },
    },
    auditLog: { async create({ data }) {
      fixture.auditTxs.push(tx); if (fixture.fail === 'assignment-audit' && data.action.startsWith('billing.')) throw new Error('synthetic assignment audit failure');
      if (fixture.fail === 'rate-audit' && data.action.startsWith('operations.')) throw new Error('synthetic rate audit failure');
      state.audits.push(structuredClone(data));
    } },
  };
  return tx;
}
fixture.db = {
  async $transaction(run, options) {
    assert.equal(options.isolationLevel, 'Serializable');
    const attempt = ++fixture.attempts, startVersion = fixture.version;
    const state = structuredClone(fixture.state);
    const result = await run(transactionClient(state, attempt));
    if (fixture.beforeCommit) await fixture.beforeCommit({ state, attempt });
    // Model optimistic PostgreSQL serialization: conflicted attempts never commit.
    if (fixture.version !== startVersion || fixture.fail === 'serialization') throw Object.assign(new Error('serialization conflict'), { code: 'P2034' });
    fixture.state = state; fixture.version++;
    return result;
  },
};
const { POST } = await import('../../src/app/api/billing/tuition-assignments/route.ts');
const { runTuitionMutation, saveTuitionPlanInTransaction } = await import('../../src/lib/tuition-mutation.ts');
const { writeAuditLog } = await import('../../src/lib/audit.ts');
const { NextRequest } = await import('next/server');
const draft = (patch = {}) => ({ id: 'rate', centerId: 'school', name: 'Updated', ageGroup: 'Preschool', cadence: 'biweekly', amountDollars: '225.00', ...patch });
const request = (patch = {}, headers = {}) => new NextRequest('https://example.test/api/billing/tuition-assignments', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify({ familyId: 'family', childId: 'child', enabled: true, tuitionPlanDraft: draft(), billingCadence: 'biweekly', billingStartPeriod: '2026-W40', invoiceDelayWeeks: 0, timingChangeReason: 'Return to standard timing', ...patch }) });
async function assertRejectedUnchanged(patch, status, pattern, headers) {
  const before = structuredClone(fixture.state); const response = await POST(request(patch, headers)); const body = await response.json();
  assert.equal(response.status, status, JSON.stringify(body)); if (pattern) assert.match(body.error, pattern);
  assert.deepEqual(fixture.state, before); return body;
}
mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-13T12:00:00Z') });

test('valid reason plus missing canonical coverage rolls back newly created rate and every related state', async () => {
  reset(); fixture.state.invoices.pop();
  await assertRejectedUnchanged({ tuitionPlanDraft: draft({ id: undefined }) }, 409, /2026-W42/);
  assert.equal(fixture.rateWrites, 1, 'failure occurs after tentative rate creation');
});
test('missing coverage rolls back in-place unassigned rate edit and assigned-rate version', async () => {
  for (const unassigned of [false, true]) {
    reset(); fixture.state.invoices.pop();
    if (unassigned) fixture.state.children[0].customFields.tuitionPlanId = 'other-rate';
    await assertRejectedUnchanged({}, 409, /2026-W42/); assert.equal(fixture.rateWrites, 1);
  }
});
test('successful combined version save commits one new rate, child/account/history and both audits together', async () => {
  reset(); const original = structuredClone(fixture.state.plans[0]);
  const response = await POST(request()); const body = await response.json(); assert.equal(response.status, 200, JSON.stringify(body));
  assert.equal(body.rateVersionCreated, true); assert.equal(body.rateMode, 'created'); assert.equal(body.record.id, 'new-rate-1');
  assert.deepEqual(fixture.state.plans[0], original); assert.equal(fixture.state.plans.length, 2);
  const fields = fixture.state.children[0].customFields;
  assert.equal(fields.tuitionPlanId, body.record.id); assert.equal(fields.tuitionNetAmountCents, 22500); assert.equal(fields.tuitionBillingInvoiceDelayWeeks, 0);
  assert.equal(fields.preservedChild, true); assert.equal(fields.tuitionAssignmentHistory.at(-1).tuitionBillingInvoiceDelayWeeks, 1);
  assert.equal(fixture.state.account.customFields.preservedAccount, true); assert.equal(fixture.state.account.balanceCents, 1234);
  assert.equal(fixture.state.audits.length, 2); assert.equal(fixture.auditTxs[0], fixture.auditTxs[1]);
  assert.equal(fixture.state.audits[0].metadata.timingChangeReason, 'Return to standard timing');
  assert.deepEqual(fixture.state.invoices, [coverage('2026-W40'), coverage('2026-W42')]);
  assert.deepEqual(fixture.locks.slice(0, 4).map(x => x.table), ['Family', 'Child', 'BillingAccount', 'Center']);
});
test('unchanged assigned rate updates in place and assignment-only payload remains supported', async () => {
  reset(); let response = await POST(request({ tuitionPlanDraft: draft({ name: 'Original', amountDollars: '200.00' }) }));
  let body = await response.json(); assert.equal(response.status, 200); assert.equal(body.rateMode, 'updated'); assert.equal(body.rateVersionCreated, false); assert.equal(fixture.state.plans.length, 1);
  reset(); response = await POST(request({ tuitionPlanDraft: undefined, tuitionPlanId: 'rate' })); body = await response.json();
  assert.equal(response.status, 200); assert.equal(body.record, undefined); assert.equal(fixture.state.audits.length, 1);
});
test('child/account/audit failures roll back tentative rate, assignment, center timestamp and all audit rows', async () => {
  for (const failure of ['child', 'account', 'assignment-audit', 'rate-audit']) {
    reset(); fixture.fail = failure; const before = structuredClone(fixture.state);
    await assert.rejects(POST(request()), /synthetic/); assert.deepEqual(fixture.state, before, failure);
  }
});
test('all validation failures preserve rate, child, account and audit state', async () => {
  for (const [patch, status, pattern] of [
    [{ timingChangeReason: '' }, 400, /reason/], [{ invoiceDelayWeeks: 2 }, 400, /delay|timing/i],
    [{ billingStartPeriod: '2026-W41' }, 409, /saved coverage start/],
    [{ billingCadence: 'monthly' }, 400, /same monthly/],
    [{ tuitionCredits: [{ category: 'family_discount', amountCents: 30000 }] }, 400, /Credits/],
    [{ tuitionPlanDraft: draft({ amountDollars: '-2' }) }, 400, /positive/],
    [{ tuitionPlanDraft: draft({ name: '' }) }, 400, /name/],
    [{ enabled: false }, 400, /enabled tuition assignment/],
    [{ tuitionPlanDraft: {} }, 403, /different school/],
    [{ familyId: 'wrong' }, 404, /this family/],
    [{ tuitionPlanDraft: draft({ centerId: 'other-school' }) }, 403, /different school/],
  ]) { reset(); await assertRejectedUnchanged(patch, status, pattern); }
});
test('origin/authentication/role/tenant/school/archive/enrollment isolation remains fail closed', async () => {
  reset(); await assertRejectedUnchanged({}, 403, /origin/, { origin: 'https://evil.test' }); assert.equal(fixture.attempts, 0);
  for (const [setup, status] of [
    [() => { fixture.actor = null; }, 401],
    [() => { fixture.actor.role = 'PARENT_GUARDIAN'; }, 403],
    [() => { fixture.actor.centerIds = []; }, 403],
    [() => { fixture.state.center.tenantId = 'other-tenant'; }, 404],
    [() => { fixture.state.family.centerId = 'other-school'; }, 403],
    [() => { fixture.state.plans[0].centerId = 'other-school'; }, 403],
    [() => { fixture.state.center.customFields.archivedTuitionPlanIds = ['rate']; }, 409],
    [() => { fixture.state.children[0].enrollmentStatus = 'withdrawn'; }, 409],
  ]) { reset(); setup(); await assertRejectedUnchanged({}, status); }
  reset(); fixture.state.center.tenantId = 'other-tenant'; await assertRejectedUnchanged({ tuitionPlanDraft: draft({ id: undefined }) }, 404);
});
test('exhausted serialization conflicts yield explicit 409 with no committed rate or audit', async () => {
  reset(); fixture.fail = 'serialization'; const body = await assertRejectedUnchanged({}, 409, /changed while saving/);
  assert.equal(body.code, 'TUITION_SAVE_CONFLICT'); assert.equal(fixture.attempts, 3); assert.equal(fixture.rateWrites, 3);
});
test('retry re-reads changed coverage and rejects rather than committing stale successful validation', async () => {
  reset(); let concurrentState;
  fixture.beforeCommit = ({ attempt }) => { if (attempt === 1) { fixture.state.invoices.pop(); fixture.version++; concurrentState = structuredClone(fixture.state); } };
  const response = await POST(request()); assert.equal(response.status, 409); assert.match((await response.json()).error, /2026-W42/);
  assert.equal(fixture.attempts, 2); assert.deepEqual(fixture.state, concurrentState);
});
test('retry revalidates fresh family scope and child eligibility before writing a rate', async () => {
  for (const change of [state => { state.family.centerId = 'other-school'; }, state => { state.children[0].enrollmentStatus = 'withdrawn'; }]) {
    reset(); let concurrentState;
    fixture.beforeCommit = ({ attempt }) => { if (attempt === 1) { change(fixture.state); fixture.version++; concurrentState = structuredClone(fixture.state); } };
    const response = await POST(request()); assert.ok([403, 409].includes(response.status)); assert.equal(fixture.attempts, 2); assert.equal(fixture.rateWrites, 1); assert.deepEqual(fixture.state, concurrentState);
  }
});
test('retry merges fresh child/account JSON and uses fresh assignment history', async () => {
  reset(); fixture.beforeCommit = ({ attempt }) => {
    if (attempt === 1) { fixture.state.children[0].customFields.concurrentChild = 'kept'; fixture.state.account.customFields.concurrentAccount = 'kept'; fixture.state.children[0].customFields.tuitionNetAmountCents = 19900; fixture.version++; }
  };
  assert.equal((await POST(request())).status, 200); assert.equal(fixture.attempts, 2);
  assert.equal(fixture.state.children[0].customFields.concurrentChild, 'kept'); assert.equal(fixture.state.account.customFields.concurrentAccount, 'kept');
  assert.equal(fixture.state.children[0].customFields.tuitionAssignmentHistory.at(-1).tuitionNetAmountCents, 19900);
  assert.equal(fixture.state.plans.length, 2); assert.equal(fixture.state.audits.length, 2);
});
test('standalone rate edit racing an assignment retries and preserves the newly assigned rate', async () => {
  reset(); delete fixture.state.children[0].customFields.tuitionPlanId;
  let releaseRate, rateReady;
  const ready = new Promise(resolve => { rateReady = resolve; }); const release = new Promise(resolve => { releaseRate = resolve; });
  fixture.afterRateWrite = async ({ attempt }) => { if (attempt === 1) { rateReady(); await release; } };
  const rateSave = runTuitionMutation(async tx => {
    const saved = await saveTuitionPlanInTransaction(tx, fixture.actor, draft());
    await writeAuditLog(fixture.actor, { centerId: 'school', action: `operations.tuitionPlan.${saved.rateMode}`, resource: 'tuitionPlan', resourceId: saved.record.id }, tx);
    return saved;
  });
  await ready;
  assert.equal((await POST(request({ tuitionPlanDraft: undefined, tuitionPlanId: 'rate' }))).status, 200);
  releaseRate();
  await assert.rejects(rateSave, error => error.code === 'TUITION_PLAN_ASSIGNED_CREATE_NEW');
  assert.equal(fixture.state.plans[0].amountCents, 20000); assert.equal(fixture.state.children[0].customFields.tuitionPlanAmountCents, 20000);
  assert.equal(fixture.state.audits.length, 1); assert.equal(fixture.attempts, 3);
});
test('two overlapping combined saves retry without orphan rates, duplicate audits or lost history', async () => {
  reset(); let releaseFirst, firstReady;
  const ready = new Promise(resolve => { firstReady = resolve; }); const release = new Promise(resolve => { releaseFirst = resolve; });
  fixture.afterRateWrite = async ({ attempt }) => { if (attempt === 1) { firstReady(); await release; } };
  const first = POST(request({ tuitionPlanDraft: draft({ name: 'First' }) })); await ready;
  const second = await POST(request({ tuitionPlanDraft: draft({ name: 'Second' }) })); assert.equal(second.status, 200); releaseFirst();
  assert.equal((await first).status, 200); assert.equal(fixture.attempts, 3);
  assert.equal(fixture.state.plans.length, 2, 'retry updates now-unassigned original rate rather than leaving failed-attempt clone');
  assert.equal(fixture.state.audits.length, 4); assert.equal(fixture.state.children[0].customFields.tuitionAssignmentHistory.length, 2);
});

test('busy coverage row locks back off with rollback and a bounded conflict response', async () => {
  reset(); fixture.fail = 'coverage-lock'; const body = await assertRejectedUnchanged({}, 409, /changed while saving/);
  assert.equal(body.code, 'TUITION_SAVE_CONFLICT'); assert.equal(fixture.attempts, 3); assert.equal(fixture.rateWrites, 3);
});

test('raw-lock serialization and deadlock SQLSTATEs retry, while unrelated raw failures escape', async () => {
  for (const sqlstate of ['40001', '40P01']) {
    reset(); fixture.fail = `raw-${sqlstate}`;
    const body = await assertRejectedUnchanged({}, 409, /changed while saving/);
    assert.equal(body.code, 'TUITION_SAVE_CONFLICT'); assert.equal(fixture.attempts, 3); assert.equal(fixture.rateWrites, 0);
  }
  reset(); fixture.fail = 'raw-42601'; const before = structuredClone(fixture.state);
  await assert.rejects(POST(request()), error => error.code === 'P2010'); assert.equal(fixture.attempts, 1); assert.deepEqual(fixture.state, before);
});

test('assignment-only disable is atomic and retains history without changing rate or account', async () => {
  reset(); const before = structuredClone(fixture.state);
  const response = await POST(request({ tuitionPlanDraft: undefined, enabled: false })); assert.equal(response.status, 200);
  assert.equal(fixture.state.children[0].customFields.tuitionBillingEnabled, false);
  assert.equal(fixture.state.children[0].customFields.tuitionAssignmentHistory.at(-1).tuitionBillingEnabled, true);
  assert.deepEqual(fixture.state.plans, before.plans); assert.deepEqual(fixture.state.account, before.account);
  assert.equal(fixture.state.audits[0].action, 'billing.tuition_assignment.disabled');
  reset(); fixture.fail = 'assignment-audit'; const failedBefore = structuredClone(fixture.state);
  await assert.rejects(POST(request({ tuitionPlanDraft: undefined, enabled: false })), /synthetic/); assert.deepEqual(fixture.state, failedBefore);
});
test('combined voucher save preserves zero family responsibility without changing account funding or invoices', async () => {
  for (const existingAccount of [true, false]) {
    reset(); if (!existingAccount) fixture.state.account = null;
    const before = structuredClone(fixture.state);
    const response = await POST(request({ tuitionPlanDraft: draft({ amountDollars: '0.00', zeroDollarVoucher: true }) })); assert.equal(response.status, 200);
    const fields = fixture.state.children[0].customFields;
    assert.equal(fields.tuitionNetAmountCents, 0); assert.equal(fields.tuitionFundingType, 'voucher'); assert.equal(fields.tuitionAutobillEligible, false);
    if (existingAccount) assert.deepEqual(fixture.state.account, before.account);
    else { assert.equal(fixture.state.account.balanceCents, 0); assert.equal(fixture.state.account.autopayPlaceholder, false); }
    assert.deepEqual(fixture.state.invoices, before.invoices); assert.equal(fixture.state.audits.length, 2);
  }
  for (const patch of [{ tuitionCredits: [{ category: 'family_discount', amountCents: 1 }] }, { tuitionAdditionalCharges: [{ description: 'Extra', amountCents: 1 }] }]) {
    reset(); await assertRejectedUnchanged({ tuitionPlanDraft: draft({ amountDollars: '0.00', zeroDollarVoucher: true }), ...patch }, 400, /voucher-funded/); assert.equal(fixture.rateWrites, 1);
  }
});
