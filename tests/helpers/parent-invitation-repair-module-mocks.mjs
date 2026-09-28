import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

// All state is synthetic and in memory. No database or provider can be reached.
const state = {};
function reset() {
  Object.assign(state, { authExists: false, authFailure: false, mailFailure: false, setupFailure: false, parentSession: false, tokenUsed: false, chosenPassword: null, account: null, authCalls: [], sends: [], deliveries: [], audits: [], tokens: [], userWrites: 0, logs: [], attendance: null });
  state.center = { id: 'school-test', name: 'Synthetic School', organizationId: 'org-test', timezone: 'America/Indiana/Indianapolis', organization: { tenantId: 'tenant-test', name: 'Synthetic Organization', tenant: { name: 'Synthetic', slug: 'synthetic' } } };
  state.guardian = { id: 'guardian-test', familyId: 'family-test', fullName: 'Synthetic Parent', email: 'synthetic@example.com', phone: '5551234567', userId: null, checkInPinHash: null, customFields: { retained: 'history' }, family: { id: 'family-test', centerId: 'school-test', name: 'Synthetic Family', children: [{ id: 'child-test', fullName: 'Synthetic Child', enrollmentStatus: 'enrolled', classroom: { id: 'class-test', centerId: 'school-test' } }] } };
}
reset();
const db = {
  guardian: {
    findUnique: async () => state.guardian,
    findFirst: async ({ where }) => where.id === state.guardian.id && where.userId === state.guardian.userId && where.familyId === state.guardian.familyId ? state.guardian : null,
    findMany: async (args) => args.where.checkInPinHash ? state.guardian.checkInPinHash ? [state.guardian] : [] : [state.guardian],
    update: async ({ data }) => { Object.assign(state.guardian, data); return state.guardian; },
  },
  center: { findUnique: async () => state.center, findFirst: async () => state.center, findMany: async () => [{ id: state.center.id }] },
  user: {
    findUnique: async () => state.account, findFirst: async () => state.account,
    findMany: async () => state.account ? [state.account] : [],
    updateMany: async ({ data }) => { state.userWrites++; Object.assign(state.account, data); return { count: 1 }; },
    create: async ({ data }) => { assert.equal(state.account, null); state.userWrites++; state.account = { id: 'parent-test', ...data }; return state.account; },
    update: async ({ data }) => { state.userWrites++; Object.assign(state.account, data); return state.account; },
  },
  parentPortalSetupToken: { findUnique: async () => ({ id: 'token-0', tenantId: 'tenant-test', userId: 'parent-test', centerId: 'school-test', guardianId: 'guardian-test', familyId: 'family-test' }) },
  auditLog: { create: async ({ data }) => { state.audits.push(data); return data; } },
  procareImportBatch: { findFirst: async () => null },
  checkInOutLog: { findMany: async () => [...state.logs].reverse(), create: async ({ data }) => { const log = { id: `log-${state.logs.length}`, ...data }; state.logs.push(log); return log; } },
  attendanceRecord: { findFirst: async () => state.attendance, create: async ({ data }) => { state.attendance = { id: 'attendance-test', ...data }; return state.attendance; }, update: async ({ data }) => { Object.assign(state.attendance, data); return state.attendance; } },
  $transaction: async (callback) => typeof callback === 'function' ? callback(db) : Promise.all(callback),
};
mock.module('@/lib/prisma', { namedExports: { prisma: db } });
mock.module('@/lib/auth', { namedExports: { getCurrentUser: async () => state.parentSession ? { id: 'parent-test', tenantId: 'tenant-test', email: state.guardian.email, role: 'PARENT_GUARDIAN' } : ({ id: 'director-test', tenantId: 'tenant-test', email: 'director@example.com', centerIds: ['school-test'] }), isParentGuardian: (user) => user.role === 'PARENT_GUARDIAN', canAccessAllCenters: () => false, canAccessCenter: (_user, id) => id === 'school-test', canManageOperations: () => true } });
mock.module('@/lib/parent-portal-family-scope', { namedExports: { getParentPortalFamilyScope: async (userId, tenantId, familyId) => ({ ok: userId === state.guardian.userId && tenantId === 'tenant-test' && familyId === 'family-test', familyId: 'family-test' }) } });
mock.module('@/lib/supabase-auth', { namedExports: {
  getAppBaseUrl: () => 'https://app.test', isSupabaseAuthCompatibleEmail: () => true,
  verifySupabaseRecoveryTokenHash: async (hash) => ({ ok: hash === 'synthetic-private-token', accessToken: 'synthetic-access', email: state.guardian.email }),
  getSupabaseAuthEmailForAccessToken: async (access) => ({ ok: access === 'synthetic-access', email: state.guardian.email }),
  updateSupabasePassword: async (access, password) => { assert.equal(access, 'synthetic-access'); state.chosenPassword = password; return Response.json({ ok: true }); },
  updateSupabaseAuthUserEmailByCurrentEmail: async () => { throw new Error('Unexpected Auth email change'); },
  upsertSupabaseAuthUserWithPassword: async (input) => {
    state.authCalls.push(input);
    assert.equal(input.updateExistingPassword, false);
    assert.ok(input.password.length >= 60, 'new credential must have high entropy');
    if (state.authFailure) throw Object.assign(new Error('Synthetic provider failure'), { status: 422 });
    if (state.authExists) return { ok: true, alreadyExisted: true };
    state.authExists = true;
    return { ok: true, created: true };
  },
} });
mock.module('@/lib/audit', { namedExports: { writeAuditLog: async (_actor, data) => state.audits.push(data), writeSystemAuditLog: async (data) => state.audits.push(data) } });
mock.module('@/lib/integrations', { namedExports: { sendEmail: async (data) => { state.sends.push(data); return state.mailFailure ? { ok: false, error: 'Synthetic delivery failure' } : { ok: true, status: 202 }; } } });
mock.module('@/lib/integration-deliveries', { namedExports: { recordEmailDeliveryAttempt: async (data) => state.deliveries.push(data) } });
mock.module('@/lib/request-response-logging', { namedExports: { withApiLogging: (_method, handler) => handler, logOperationalError: () => {} } });
mock.module('@/lib/brand-assets', { namedExports: { resolveWorkspaceBranding: () => ({ name: 'Synthetic School', logoSrc: '/logo.png', logoAlt: 'Synthetic', tagline: 'Synthetic childcare', kind: 'synthetic' }) } });
mock.module('@/lib/stripe-billing-approval', { namedExports: { stripeSchoolBillingApproval: () => ({ approved: false }) } });
mock.module('@/lib/rate-limit', { namedExports: { checkPersistentRateLimit: async () => ({ ok: true }), requestIp: () => 'test', retryAfterSeconds: () => 1 } });
mock.module('@/lib/daily-report-email', { namedExports: { sendCheckoutDailyReportEmail: async () => ({ ok: true, skipped: true }) } });
mock.module('@/lib/parent-portal-setup-links', { namedExports: {
  issueParentPortalSetupLink: async () => {
    if (state.setupFailure) return { ok: false, error: 'Synthetic setup failure' };
    const link = { ok: true, tokenId: `token-${state.tokens.length}`, setupUrl: 'https://app.test/reset-password?token_hash=synthetic-private-token&next=/parent-portal/setup', expiresAt: new Date(Date.now() + 3600000) };
    state.tokens.push(link); return link;
  },
  recordParentPortalSetupLinkDelivery: async (data) => { state.tokenDelivery = data; },
  claimParentPortalSetupToken: async () => state.tokenUsed ? { ok: false } : { ok: true, tracked: true, token: { id: 'token-0' } },
  completeParentPortalSetupToken: async () => { state.tokenUsed = true; return { count: 1 }; },
  releaseParentPortalSetupToken: async () => {},
} });
mock.module('@/lib/password-recovery-retry', { namedExports: { readPasswordRecoveryRetry: () => null, sealPasswordRecoveryRetry: () => { throw new Error('Unexpected recovery retry'); }, passwordUpdateFailure: () => { throw new Error('Unexpected password rejection'); } } });
const { POST: invite } = await import('../../src/app/api/parent/invitations/route.ts');
const { POST: kiosk } = await import('../../src/app/api/kiosk/check/route.ts');
const { POST: resetPassword } = await import('../../src/app/api/auth/reset-password/route.ts');
const { POST: parentSetup } = await import('../../src/app/api/parent/setup/route.ts');
const { ensureParentPortalLoginForGuardian: provision } = await import('../../src/lib/parent-portal-logins.ts');
const request = (path, body) => new Request(`https://app.test${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const inviteRequest = () => invite(request('/api/parent/invitations', { guardianId: 'guardian-test' }));

test('new parent invitation reaches safe mail sink with private setup, then private PIN authorizes check-in/out', async () => {
  reset();
  let response = await inviteRequest();
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.auth.passwordSetupRequired, true);
  assert.equal(state.account.mustResetPassword, true);
  assert.equal(state.guardian.userId, 'parent-test');
  assert.equal(state.guardian.customFields.retained, 'history');
  assert.equal(state.guardian.checkInPinHash, null, 'invitation cannot invent a PIN');
  assert.match(state.sends[0].text, /private one-time link/);
  assert.match(state.sends[0].text, /choose.*password/i);
  assert.match(state.sends[0].text, /private 4 digit kiosk PIN/);
  assert.equal(state.tokenDelivery.delivered, true);
  assert.doesNotMatch(JSON.stringify(state.deliveries), /synthetic-private-token/);
  assert.doesNotMatch(JSON.stringify(state.audits), /synthetic-private-token/);

  assert.equal(state.deliveries[0].maxAttempts, 1, 'private links cannot be replayed by generic delivery retries');
  response = await resetPassword(request('/api/auth/reset-password', { tokenHash: 'synthetic-private-token', password: 'SyntheticPrivateChoice!4268' }));
  assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
  assert.equal(state.account.mustResetPassword, false);
  assert.equal(state.tokenUsed, true);
  assert.equal((await resetPassword(request('/api/auth/reset-password', { tokenHash: 'synthetic-private-token', password: 'AnotherSyntheticChoice!4268' }))).status, 400);
  state.parentSession = true; // Provider/session boundary is a safe synthetic sign-in.
  response = await parentSetup(request('/api/parent/setup', { guardianId: 'guardian-test', familyId: 'family-test', fullName: 'Synthetic Parent', preferredCommunication: 'email', pin: '4268' }));
  assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
  assert.equal((await response.json()).guardian.pinReady, true);
  assert.ok(state.guardian.checkInPinHash);
  assert.notEqual(state.guardian.checkInPinHash, '4268');
  state.parentSession = false;
  for (const type of ['check_in', 'check_out']) {
    response = await kiosk(request('/api/kiosk/check', { centerId: 'school-test', pin: '4268', type, childIds: ['child-test'] }));
    assert.equal(response.status, 201, JSON.stringify(await response.clone().json()));
  }
  assert.equal(state.logs.length, 2);
  assert.equal(state.attendance.status, 'checked_out');
  assert.equal(state.logs[0].type, 'check_in');
  assert.equal(state.logs[1].type, 'check_out');
  const pinHash = state.guardian.checkInPinHash;
  const userWrites = state.userWrites;
  const linkTimestamp = state.guardian.customFields.parentPortal.linkedAt;
  const parent = await provision({ guardianId: 'guardian-test' });
  assert.equal(parent.ok, true);
  assert.equal(state.userWrites, userWrites, 'repeat provisioning is an account no-op');
  assert.equal(state.guardian.customFields.parentPortal.linkedAt, linkTimestamp);
  response = await inviteRequest();
  assert.equal(response.status, 200);
  assert.equal((await response.json()).auth.passwordSetupRequired, false);
  assert.equal(state.tokens.length, 1, 'ordinary resend cannot issue recovery or reset password');
  assert.match(state.sends[1].text, /Use your current password/);
  assert.equal(state.guardian.checkInPinHash, pinHash);
  assert.equal(state.userWrites, userWrites);
});

test('orphaned existing Auth identity is linked without rotating its password', async () => {
  reset(); state.authExists = true;
  const result = await provision({ guardianId: 'guardian-test' });
  assert.equal(result.ok, true);
  assert.equal(result.credentialCreated, false);
  assert.equal(result.requiresSetupLink, true);
  assert.equal(state.authCalls[0].updateExistingPassword, false);
});

test('provider and setup failures never reach the mail sink; retry keeps the linked identity', async () => {
  reset(); state.authFailure = true;
  let response = await inviteRequest();
  assert.equal(response.status, 502);
  assert.match((await response.json()).error, /No invitation email was sent/);
  assert.equal(state.account, null);
  assert.equal(state.sends.length, 0);
  state.authFailure = false; state.setupFailure = true;
  response = await inviteRequest();
  assert.equal(response.status, 502);
  assert.equal(state.sends.length, 0);
  const id = state.account.id, writes = state.userWrites;
  state.setupFailure = false;
  response = await inviteRequest();
  assert.equal(response.status, 200);
  assert.equal(state.account.id, id);
  assert.equal(state.userWrites, writes);
});

test('mail rejection is tracked and retry preserves parent and guardian identity', async () => {
  reset(); state.mailFailure = true;
  let response = await inviteRequest();
  assert.equal(response.status, 502);
  assert.equal(state.tokenDelivery.delivered, false);
  assert.equal(state.guardian.customFields.parentPortal.invitationSentAt, undefined);
  const id = state.account.id, writes = state.userWrites;
  state.mailFailure = false;
  response = await inviteRequest();
  assert.equal(response.status, 200);
  assert.equal(state.account.id, id);
  assert.equal(state.userWrites, writes);
});

test('cross-tenant identities, cross-school actors, and mismatched existing links fail before Auth or send', async () => {
  reset(); state.account = { id: 'other-parent', tenantId: 'other-tenant', role: 'PARENT_GUARDIAN' };
  let response = await inviteRequest();
  assert.equal(response.status, 409);
  assert.equal(state.authCalls.length, 0);
  reset(); state.center.id = 'other-school'; state.guardian.family.centerId = 'other-school';
  response = await inviteRequest();
  assert.equal(response.status, 403);
  assert.equal(state.authCalls.length, 0);
  reset(); state.guardian.userId = 'unrelated-parent';
  response = await inviteRequest();
  assert.equal(response.status, 409);
  assert.equal(state.authCalls.length, 0);
  assert.equal(state.sends.length, 0);
});
