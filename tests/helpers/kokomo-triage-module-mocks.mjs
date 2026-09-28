import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

// Synthetic records only. Every production boundary is mocked; unexpected writes fail.
const state = { authAttempts: 0, writes: 0, sends: 0 };
const center = { id: 'school-test', name: 'Test school', organizationId: 'org-test', organization: { tenantId: 'tenant-test', name: 'Test org', tenant: { name: 'Test', slug: 'test' } } };
const guardian = { id: 'guardian-test', familyId: 'family-test', fullName: 'Synthetic Parent', email: 'synthetic@example.com', phone: '5551234567', userId: null, checkInPinHash: null, customFields: {}, family: { id: 'family-test', centerId: center.id, children: [{ id: 'child-test', fullName: 'Synthetic Child', enrollmentStatus: 'enrolled' }] } };
const write = async () => { state.writes++; throw new Error('Unexpected write in diagnostic replay'); };
const db = {
  guardian: { findUnique: async () => guardian, findMany: async (args) => args.where.checkInPinHash ? [] : [guardian], update: write },
  center: { findUnique: async () => center, findFirst: async () => center, findMany: async () => [{ id: center.id }] },
  user: { findUnique: async () => null, findFirst: async () => null, create: write, update: write },
  procareImportBatch: { findFirst: async () => null },
  $transaction: write,
};
mock.module('@/lib/prisma', { namedExports: { prisma: db } });
mock.module('@/lib/auth', { namedExports: { getCurrentUser: async () => ({ id: 'director-test', tenantId: 'tenant-test', email: 'director@example.com', centerIds: [center.id] }), canAccessAllCenters: () => false, canAccessCenter: () => true, canManageOperations: () => true } });
mock.module('@/lib/supabase-auth', { namedExports: { getAppBaseUrl: () => 'https://app.test', isSupabaseAuthCompatibleEmail: () => true, updateSupabaseAuthUserEmailByCurrentEmail: write, upsertSupabaseAuthUserWithPassword: async () => { state.authAttempts++; throw Object.assign(new Error('Password is known to be weak and easy to guess, please choose a different one.'), { status: 422, code: 'weak_password' }); } } });
mock.module('@/lib/audit', { namedExports: { writeAuditLog: write, writeSystemAuditLog: write } });
mock.module('@/lib/daily-report-email', { namedExports: { sendCheckoutDailyReportEmail: write } });
mock.module('@/lib/integrations', { namedExports: { sendEmail: async () => { state.sends++; throw new Error('Unexpected send'); } } });
mock.module('@/lib/integration-deliveries', { namedExports: { recordEmailDeliveryAttempt: write } });
mock.module('@/lib/request-response-logging', { namedExports: { withApiLogging: (_method, handler) => handler, logOperationalError: () => {} } });
mock.module('@/lib/parent-portal-setup-links', { namedExports: { issueParentPortalSetupLink: write, recordParentPortalSetupLinkDelivery: write } });
mock.module('@/lib/brand-assets', { namedExports: { resolveWorkspaceBranding: () => ({ name: 'Test school' }) } });
mock.module('@/lib/stripe-billing-approval', { namedExports: { stripeSchoolBillingApproval: () => ({ approved: false }) } });
mock.module('@/lib/rate-limit', { namedExports: { checkPersistentRateLimit: async () => ({ ok: true }), requestIp: () => 'test', retryAfterSeconds: () => 1 } });

const { POST: invite } = await import('../../src/app/api/parent/invitations/route.ts');
const { POST: lookup } = await import('../../src/app/api/kiosk/lookup/route.ts');
const { POST: check } = await import('../../src/app/api/kiosk/check/route.ts');
const request = (path, body) => new Request(`https://app.test${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('provider weak-password rejection becomes the exact invitation 502 before any send or application write', async () => {
  const response = await invite(request('/api/parent/invitations', { guardianId: guardian.id }));
  assert.equal(response.status, 502);
  assert.match((await response.json()).error, /Parent access could not be prepared\. No invitation email was sent\. Contact support with reference/);
  assert.equal(state.authAttempts, 1);
  assert.equal(state.writes, 0);
  assert.equal(state.sends, 0);
});

test('a guardian with no stored PIN cannot authorize lookup, check-in, or check-out', async () => {
  for (const [handler, path, body] of [
    [lookup, '/api/kiosk/lookup', { centerId: center.id, pin: '1234' }],
    [check, '/api/kiosk/check', { centerId: center.id, pin: '1234', type: 'check_in', childIds: ['child-test'] }],
    [check, '/api/kiosk/check', { centerId: center.id, pin: '1234', type: 'check_out', childIds: ['child-test'] }],
  ]) {
    const response = await handler(request(path, body));
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error, 'PIN was not recognized for this school.');
  }
  assert.equal(state.writes, 0);
  assert.equal(state.sends, 0);
});
