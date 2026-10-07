import assert from 'node:assert/strict';
import { mock } from 'node:test';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';

// Explicit disposable localhost database only. Never load the application's env files.
const url = new URL(process.env.TUITION_REHEARSAL_DATABASE_URL || '');
assert.equal(url.hostname, '127.0.0.1');
assert.ok(url.port && url.port !== '5432', 'Use a separately started disposable cluster');
assert.match(url.pathname, /^\/bee_tuition_rehearsal_[a-z0-9_]+$/);
assert.equal(process.env.TUITION_REHEARSAL_CONFIRM, 'synthetic-disposable-local');
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
assert.equal(execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' }).trim(), '', 'Rehearsal requires a clean tracked checkout');
assert.equal(process.env.TUITION_REHEARSAL_SOURCE_COMMIT, sourceCommit, 'Supplied source revision must match HEAD');
url.searchParams.set('connection_limit', '12');
const prisma = new PrismaClient({ datasources: { db: { url: url.toString() } } });
const control = new PrismaClient({ datasources: { db: { url: url.toString() } } });
mock.module('@/lib/prisma', { namedExports: { prisma } });
// Only the Next request-context logger is replaced; all route queries, locks,
// transactions, invoice helpers, balances and ledger writes use real PostgreSQL.
mock.module('@/lib/request-response-logging', { namedExports: { withApiLogging(_method, handler) { return handler; } } });
process.env.CRON_SECRET = 'disposable-local-rehearsal';
const { GET } = await import('../src/app/api/cron/tuition-billing/route.ts');
const results = [];
const run = async (flags = '') => {
  const response = await GET(new NextRequest(`https://fixture.invalid/api/cron/tuition-billing?asOf=2026-10-08&suppressAutopay=1${flags}`, { headers: { authorization: 'Bearer disposable-local-rehearsal' } }));
  return { status: response.status, body: await response.json() };
};
async function seed(label, count = 1, cadence = 'weekly', anchor = true) {
  const prefix = `rehearsal-${label}`;
  await prisma.tenant.create({ data: { id: prefix, name: 'Synthetic local rehearsal', slug: prefix } });
  await prisma.organization.create({ data: { id: prefix, tenantId: prefix, name: 'Synthetic local rehearsal' } });
  await prisma.center.create({ data: { id: prefix, organizationId: prefix, name: 'Synthetic local school', licensedCapacity: 10, customFields: { tuitionBillingEnabled: true } } });
  await prisma.classroom.create({ data: { id: prefix, centerId: prefix, name: 'Synthetic classroom', ageGroup: 'preschool', capacity: 10 } });
  await prisma.tuitionPlan.create({ data: { id: prefix, centerId: prefix, name: 'Synthetic tuition', ageGroup: 'preschool', cadence, amountCents: 10000 } });
  for (let i = 0; i < count; i++) {
    const id = `${prefix}-${i}`;
    await prisma.family.create({ data: { id, centerId: prefix, name: 'Synthetic family' } });
    await prisma.child.create({ data: { id, familyId: id, classroomId: prefix, fullName: 'Synthetic child', dateOfBirth: new Date('2022-01-01'), ageGroup: 'preschool', enrollmentStatus: 'enrolled', customFields: { tuitionBillingEnabled: true, tuitionPlanId: prefix, tuitionPlanAmountCents: 10000, tuitionBillingCadence: cadence, ...(anchor ? { tuitionBillingStartsPeriod: '2026-W41' } : {}) } } });
  }
  return prefix;
}
async function deactivate(prefix) {
  await prisma.center.update({ where: { id: prefix }, data: { customFields: { tuitionBillingEnabled: false } } });
}
async function blockedRace(label, table, mutate) {
  const prefix = await seed(label);
  let ready, release;
  const isReady = new Promise(r => { ready = r; });
  const canCommit = new Promise(r => { release = r; });
  const mutation = control.$transaction(async tx => { await mutate(tx, prefix); ready(); await canCommit; }, { timeout: 30000 });
  await isReady;
  const invoiceRun = run();
  let blocked = false;
  try {
    const deadline = Date.now() + 12000;
    while (Date.now() < deadline) {
      const rows = await control.$queryRaw`SELECT query FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND pid<>pg_backend_pid()`;
      if (rows.some(r => r.query.includes(`"${table}"`) && r.query.includes('FOR UPDATE'))) { blocked = true; break; }
      await delay(50);
    }
    assert.ok(blocked, `${label}: the actual cron query must demonstrably wait for a PostgreSQL row lock`);
  } finally { release(); }
  await mutation;
  const { status, body } = await invoiceRun;
  assert.equal(status, label === 'pause-race' ? 500 : 200);
  if (label === 'pause-race') assert.match(body.failures[0]?.error ?? '', /paused/i);
  assert.equal(body.failed, label === 'pause-race' ? 1 : 0, `${label}: only the school pause intentionally fails invoicing`);
  assert.equal(body.created, 0);
  assert.equal(await prisma.invoice.count({ where: { billingAccount: { familyId: `${prefix}-0` } } }), 0);
  await deactivate(prefix);
  results.push({ scenario: label, observedPostgresLockWait: blocked, httpStatus: status, created: body.created, failed: body.failed });
}
try {
  assert.equal(await prisma.tenant.count(), 0, 'Rehearsal database must be empty; retain evidence and use a fresh database on rerun');
  const prefix = await seed('concurrent', 2);
  const dry = await run('&dryRun=1');
  assert.equal(dry.status, 200); assert.equal(dry.body.failed, 0); assert.equal(dry.body.dryRun, true); assert.equal(dry.body.created, 0); assert.equal(dry.body.totalCents, 0); assert.deepEqual(dry.body.invoices, []);
  assert.equal(await prisma.invoice.count(), 0);
  results.push({ scenario: 'dry-run', created: 0, totalCents: 0, invoices: 0 });
  assert.equal(dry.body.dueChildren, 2, 'Synthetic fixtures must actually be due');
  const runs = await Promise.all([run(), run()]);
  console.log('Concurrent route results', JSON.stringify(runs));
  assert.equal(runs.reduce((n,r) => n+r.body.created, 0), 2);
  assert.ok(runs.every(r => r.status === 200 && r.body.failed === 0));
  assert.equal(await prisma.invoice.count(), 2);
  assert.equal(await prisma.ledgerEntry.count({ where: { type: 'tuition_charge' } }), 2);
  assert.deepEqual((await prisma.billingAccount.findMany({ orderBy: { familyId: 'asc' }, select: { balanceCents: true } })).map(r => r.balanceCents), [10000,10000]);
  results.push({ scenario: 'two-concurrent-crons-two-families-one-school', invoices: 2, ledgerEntries: 2, failed: 0 });
  await deactivate(prefix);
  for (const cadence of ['biweekly', 'four_week']) {
    const id = await seed(`anchor-${cadence}`, 1, cadence, false);
    const { status, body } = await run(); assert.equal(status, 200); assert.equal(body.failed, 0); assert.equal(body.created, 0); assert.equal(body.configurationFailed, 1);
    results.push({ scenario: `missing-${cadence}-anchor`, created: 0, configurationFailed: 1 }); await deactivate(id);
  }
  await blockedRace('pause-race', 'Center', (tx,id) => tx.center.update({ where: { id }, data: { customFields: { tuitionBillingEnabled: true, tuitionBillingPaused: true } } }));
  await blockedRace('transfer-race', 'Family', (tx,id) => tx.family.update({ where: { id: `${id}-0` }, data: { centerId: null } }));
  await blockedRace('withdrawal-race', 'Child', (tx,id) => tx.child.update({ where: { id: `${id}-0` }, data: { enrollmentStatus: 'withdrawn' } }));
  mkdirSync('output/audit', { recursive: true });
  const report = { status: 'passed', sourceCommit, trackedCheckoutClean: true, capturedAt: new Date().toISOString(), database: url.pathname.slice(1), postgres: (await prisma.$queryRaw`SHOW server_version`)[0], realDatabase: true, productionContacted: false, results };
  writeFileSync('output/audit/tuition-postgres-rehearsal.json', JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
} finally { await Promise.all([prisma.$disconnect(), control.$disconnect()]); }
