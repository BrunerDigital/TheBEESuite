import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import { NextRequest } from 'next/server';

const fixture = {};
function reset() {
  Object.assign(fixture, {
    actor: { id: 'director', email: 'director@example.test', tenantId: 'tenant', role: 'CENTER_DIRECTOR', centerIds: ['school'] },
    fields: { tuitionPlanId: 'rate', tuitionNetAmountCents: 20000, tuitionBillingEnabled: true, tuitionBillingCadence: 'biweekly', tuitionBillingStartsPeriod: '2026-W40', tuitionBillingInvoiceDelayWeeks: 1, kept: 'child history' },
    plan: { id: 'rate', centerId: 'school', name: 'Synthetic tuition rate', cadence: 'biweekly', amountCents: 20000 },
    invoices: [cover({ billingPeriod: '2026-W40', coverageStartsPeriod: '2026-W40' })], childWrites: 0, accountWrites: 0, invoiceReads: 0, audits: [], tenantMatches: true,
  });
}
reset();
fixture.db = {
  child: {
    async findUnique() { return { id: 'child', familyId: 'family', fullName: 'Synthetic Child', classroomId: 'class', enrollmentStatus: 'enrolled', customFields: structuredClone(fixture.fields), family: { centerId: 'school', name: 'Synthetic family' } }; },
    async update({ data }) { fixture.childWrites++; fixture.fields = data.customFields; return { id: 'child', customFields: fixture.fields }; },
  },
  tuitionPlan: { async findUnique() { return fixture.plan; } },
  center: { async findFirst() { return fixture.tenantMatches ? { customFields: {} } : null; } },
  invoice: { async findMany({ where, orderBy, take }) {
    fixture.invoiceReads++;
    assert.equal(where.billingAccount.familyId, 'family'); assert.equal(where.status.not, 'VOID');
    const filtered = fixture.invoices.filter(invoice => invoice.status !== 'VOID' && (where.AND ?? []).every(condition => {
      const field = condition.customFields;
      return invoice.customFields[field.path[0]] === field.equals;
    }));
    if (orderBy?.createdAt === 'desc') filtered.sort((left, right) => (right.createdAt ?? 0) - (left.createdAt ?? 0));
    return filtered.slice(0, take ?? filtered.length);
  } },
  billingAccount: { async findUnique() { return { customFields: { kept: 'account history' } }; }, async upsert({ update }) { fixture.accountWrites++; assert.equal(update.customFields.kept, 'account history'); return {}; } },
  async $queryRaw() { return []; },
  async $transaction(run) { return run(fixture.db); },
};
mock.module('@/lib/prisma', { namedExports: { prisma: fixture.db } });
mock.module('@/lib/auth', { namedExports: { getCurrentUser: async () => fixture.actor, canManageBilling: u => u.role === 'CENTER_DIRECTOR', canAccessCenter: (u, id) => u.centerIds.includes(id) } });
mock.module('@/lib/audit', { namedExports: { writeAuditLog: async (_u, audit) => fixture.audits.push(audit) } });
mock.module('@/lib/request-response-logging', { namedExports: { withApiLogging: (_m, h) => h } });
const route = await import('../../src/app/api/billing/tuition-assignments/route.ts');
const { POST } = route.default ?? route;
const { tuitionInvoiceBillingPeriod, shouldCreateRecurringTuitionInvoice } = await import('../../src/lib/billing-workflows.ts');
const { nextBiweeklyInvoiceDate } = await import('../../src/lib/tuition-invoice-timing.ts');
function request(patch = {}) { return new NextRequest('https://example.test/api/billing/tuition-assignments', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ familyId: 'family', childId: 'child', tuitionPlanId: 'rate', billingCadence: 'biweekly', billingStartPeriod: '2026-W40', invoiceDelayWeeks: 0, timingChangeReason: 'Return to standard timing', ...patch }) }); }
function cover(patch = {}) { return { status: 'OPEN', customFields: { chargeSource: 'tuitionPlan', mode: 'recurring', childId: 'child', billingPeriod: '2026-W42', coverageStartsPeriod: '2026-W42', invoiceWeekCount: 2, billingCadence: 'biweekly', ...patch } }; }
function noWrites() { assert.equal(fixture.childWrites, 0); assert.equal(fixture.accountWrites, 0); assert.equal(fixture.audits.length, 0); }
function at(date) { mock.timers.enable({ apis: ['Date'], now: new Date(date) }); }

test('October 13 W40 schedule proves W42 is skipped if delay removal is accepted', () => {
  const asOf = new Date('2026-10-13T12:00:00Z');
  assert.equal(tuitionInvoiceBillingPeriod(undefined, asOf, 'biweekly', 1), '2026-W42');
  assert.equal(tuitionInvoiceBillingPeriod(undefined, asOf, 'biweekly', 0), '2026-W43');
  assert.equal(shouldCreateRecurringTuitionInvoice({ enabled: true, planId: 'rate', amountCents: 20000, startsPeriod: '2026-W40', billingPeriod: '2026-W43', billingDay: 4, currentDay: 4, cadence: 'biweekly' }), false);
  assert.equal(nextBiweeklyInvoiceDate('2026-W40', 1, asOf).toISOString(), '2026-10-15T12:00:00.000Z');
  assert.equal(nextBiweeklyInvoiceDate('2026-W40', 0, asOf).toISOString(), '2026-10-22T12:00:00.000Z');
});

test('reject delay removal while W42 coverage is still unbilled', async () => {
  reset(); at('2026-10-13T12:00:00Z');
  try { const response = await POST(request()); assert.equal(response.status, 409, await response.text()); noWrites(); assert.equal(fixture.fields.tuitionBillingInvoiceDelayWeeks, 1); } finally { mock.timers.reset(); }
});

test('allow standard timing when the at-risk two-week coverage already exists', async () => {
  reset(); at('2026-10-13T12:00:00Z'); fixture.invoices.push(cover());
  try { const response = await POST(request()); assert.equal(response.status, 200, await response.text()); assert.equal(fixture.fields.tuitionBillingStartsPeriod, '2026-W40'); assert.equal(fixture.fields.tuitionBillingInvoiceDelayWeeks, 0); assert.equal(fixture.fields.kept, 'child history'); assert.equal(fixture.fields.tuitionAssignmentHistory.at(-1).tuitionBillingInvoiceDelayWeeks, 1); assert.equal(fixture.audits[0].metadata.existingInvoicesUnchanged, true); } finally { mock.timers.reset(); }
});

test('void, unrelated, partial, or non-coverage invoices do not unlock timing removal', async () => {
  at('2026-10-13T12:00:00Z');
  try {
    for (const invoice of [ { ...cover(), status: 'VOID' }, cover({ childId: 'other-child' }), cover({ chargeSource: 'custom' }), cover({ billingPeriod: '2026-W40', coverageStartsPeriod: '2026-W40' }), cover({ invoiceWeekCount: 1 }), cover({ mode: 'single' }), cover({ coverageStartsPeriod: '2026-W43' }), cover({ billingPeriod: ' 2026-W42 ', coverageStartsPeriod: ' 2026-W42 ' }) ]) {
      reset(); fixture.invoices.push(invoice); const response = await POST(request()); assert.equal(response.status, 409, JSON.stringify(invoice)); noWrites();
    }
  } finally { mock.timers.reset(); }
});

test('allow reviewed delayed biweekly to monthly transition with no tuition coverage', async () => {
  reset(); at('2026-10-13T12:00:00Z'); fixture.plan.cadence = 'monthly'; fixture.invoices = [];
  try { const response = await POST(request({ billingCadence: 'monthly', billingStartPeriod: '2026-10' })); assert.equal(response.status, 200, await response.text()); assert.equal(fixture.fields.tuitionBillingCadence, 'monthly'); assert.equal(fixture.fields.tuitionBillingStartsPeriod, '2026-10'); assert.equal(fixture.fields.tuitionBillingInvoiceDelayWeeks, 0); } finally { mock.timers.reset(); }
});

test('monthly cadence changes with existing child tuition coverage remain blocked', async () => {
  reset(); fixture.plan.cadence = 'monthly'; fixture.invoices.push(cover());
  const response = await POST(request({ billingCadence: 'monthly', billingStartPeriod: '2026-10' })); assert.equal(response.status, 409); noWrites();
});

test('newer sibling invoices cannot hide older child tuition coverage from a cadence change', async () => {
  reset(); fixture.plan.cadence = 'monthly';
  fixture.invoices = [{ ...cover(), createdAt: 0 }, ...Array.from({ length: 201 }, (_, index) => ({ ...cover({ childId: 'sibling' }), createdAt: index + 1 }))];
  const response = await POST(request({ billingCadence: 'monthly', billingStartPeriod: '2026-10' }));
  assert.equal(response.status, 409); noWrites();
});

test('same-cadence timing edits must retain the saved anchor', async () => {
  reset(); fixture.fields.tuitionBillingInvoiceDelayWeeks = 0;
  assert.equal((await POST(request({ invoiceDelayWeeks: 1, billingStartPeriod: '2026-W41' }))).status, 409); noWrites();
});

test('a new future biweekly anchor can remove delay without historical coverage', async () => {
  reset(); at('2026-10-13T12:00:00Z'); fixture.fields.tuitionBillingStartsPeriod = '2027-W02';
  try { assert.equal((await POST(request({ billingStartPeriod: '2027-W02' }))).status, 200); } finally { mock.timers.reset(); }
});

test('removing delay before the standard invoice day remains allowed', async () => {
  reset(); at('2026-10-07T12:00:00Z');
  try { assert.equal((await POST(request())).status, 200); } finally { mock.timers.reset(); }
});

test('delay removal after the last Sunday cron cannot depend on a missed catch-up', async () => {
  reset(); at('2026-10-11T23:00:00Z');
  try { assert.equal((await POST(request())).status, 409); noWrites(); } finally { mock.timers.reset(); }
});

test('expired unbilled W42 coverage remains guarded across later invoice cycles', async () => {
  for (const date of ['2026-10-19', '2026-10-22', '2026-10-29', '2026-11-02', '2026-11-05']) {
    reset(); at(`${date}T12:00:00Z`);
    try {
      const response = await POST(request()); const body = await response.json();
      assert.equal(response.status, 409, JSON.stringify(body)); assert.match(body.error, /2026-W42/); noWrites();
    } finally { mock.timers.reset(); }
  }
});

test('later covered cycles cannot hide the earliest unbilled anchored cycle', async () => {
  for (const missingPeriod of ['2026-W40', '2026-W42']) {
    reset(); at('2026-10-26T12:00:00Z');
    fixture.invoices = ['2026-W40', '2026-W42', '2026-W44'].filter(period => period !== missingPeriod)
      .map(period => cover({ billingPeriod: period, coverageStartsPeriod: period }));
    try {
      const response = await POST(request()); const body = await response.json();
      assert.equal(response.status, 409, JSON.stringify(body)); assert.ok(body.error.includes(missingPeriod)); noWrites();
    } finally { mock.timers.reset(); }
  }
});

test('covered expired cycles allow removal until the next standard invoice day', async () => {
  for (const [date, expected] of [['2026-10-19', 200], ['2026-10-22', 409]]) {
    reset(); at(`${date}T12:00:00Z`); fixture.invoices.push(cover());
    try {
      const response = await POST(request()); const body = await response.json();
      assert.equal(response.status, expected, JSON.stringify(body));
      if (expected === 409) { assert.match(body.error, /2026-W44/); noWrites(); }
    } finally { mock.timers.reset(); }
  }
});

test('missing initial-cycle coverage blocks even before the next standard invoice day', async () => {
  reset(); at('2026-10-07T12:00:00Z'); fixture.invoices = [];
  try {
    const response = await POST(request()); assert.equal(response.status, 409);
    assert.match((await response.json()).error, /2026-W40/); noWrites();
  } finally { mock.timers.reset(); }
});

test('invalid saved anchors require review before reading coverage or writing', async () => {
  for (const anchor of ['', '2026-W00', '2026-W54', '2026-W', '2025-W53']) {
    reset(); at('2026-10-19T12:00:00Z'); fixture.fields.tuitionBillingStartsPeriod = anchor;
    try {
      const response = await POST(request()); assert.equal(response.status, 409);
      assert.match((await response.json()).error, /saved biweekly coverage start week/);
      assert.equal(fixture.invoiceReads, 0); noWrites();
    } finally { mock.timers.reset(); }
  }
});

test('truncated or duplicate invoices never imply older cycles are covered', async () => {
  reset(); at('2026-10-19T12:00:00Z');
  fixture.invoices = [
    { ...cover({ billingPeriod: '2026-W40', coverageStartsPeriod: '2026-W40' }), createdAt: 0 },
    ...Array.from({ length: 201 }, (_, index) => ({ ...cover(), createdAt: index + 1 })),
  ];
  try {
    const response = await POST(request()); assert.equal(response.status, 409);
    assert.match((await response.json()).error, /2026-W40/); noWrites();
  } finally { mock.timers.reset(); }
});

test('reason, authentication, role, school, tenant and family guards remain fail-closed', async () => {
  for (const mode of ['reason', 'none', 'parent', 'school', 'tenant', 'family']) {
    reset(); if (mode === 'none') fixture.actor = null; if (mode === 'parent') fixture.actor.role = 'PARENT_GUARDIAN'; if (mode === 'school') fixture.actor.centerIds = []; if (mode === 'tenant') fixture.tenantMatches = false;
    const response = await POST(request({ ...(mode === 'reason' ? { timingChangeReason: '' } : {}), ...(mode === 'family' ? { familyId: 'other-family' } : {}) })); assert.notEqual(response.status, 200); noWrites();
  }
});
