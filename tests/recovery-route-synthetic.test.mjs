import assert from 'node:assert/strict';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import './recovery-runtime-harness.mjs';
import { readPasswordRecoveryRetry } from '../src/lib/password-recovery-retry.ts';
process.env.AUTH_SECRET = 'synthetic-recovery-test-only-not-a-real-secret';
const path = process.env.RECOVERY_ROUTE || `${process.cwd()}/src/app/api/auth/reset-password/route.ts`;
const { POST } = await import(pathToFileURL(path).href);

function fixture({ tracked = false } = {}) {
  const s = { logs: [], verificationCount: 0, identityCount: 0, updates: [], userWrites: 0, completions: 0, releases: 0, auditWrites: 0, consumed: false, tracked, tokenStatus: 'issued', identityMode: 'ok', auditFailure: false, updateStatus: 200, updatePayload: {}, providerEmail: 'synthetic@example.invalid' };
  const user = { id: 'synthetic-user', tenantId: 'synthetic-tenant' };
  s.db = {
    user: { findMany: async () => [user], updateMany: async ({ data }) => { assert.deepEqual(data, { mustResetPassword: false, sessionVersion: { increment: 1 } }); s.userWrites++; return { count: 1 }; } },
    parentPortalSetupToken: { findUnique: async () => ({ ...user, id: 'synthetic-token', userId: user.id, centerId: 'synthetic-school', guardianId: 'synthetic-guardian', familyId: 'synthetic-family' }) },
    auditLog: { create: async () => { s.auditWrites++; if (s.auditFailure) throw new Error('Synthetic audit unavailable'); return {}; } },
  };
  s.verify = async () => { s.verificationCount++; if (s.consumed) return { ok: false, providerStatus: 403 }; s.consumed = true; return { ok: true, accessToken: 'synthetic-access', email: s.providerEmail }; };
  s.identity = async () => { s.identityCount++; if (s.identityMode === 'throw') throw new Error('Synthetic provider read timeout'); if (s.identityMode === 'mismatch') return { ok: true, email: 'other@example.invalid' }; if (typeof s.identityMode === 'number') return { ok: false, status: s.identityMode }; return { ok: true, email: s.providerEmail }; };
  s.update = async (access, password) => { assert.equal(access, 'synthetic-access'); s.updates.push(password); return Response.json(s.updatePayload, { status: s.updateStatus }); };
  s.claim = async () => { if (!tracked) return { ok: true, tracked: false }; if (s.tokenStatus !== 'issued') return { ok: false }; s.tokenStatus = 'claimed'; return { ok: true, tracked: true, token: { id: 'synthetic-token' } }; };
  s.release = async () => { s.releases++; s.tokenStatus = 'issued'; };
  s.complete = async () => { s.completions++; s.tokenStatus = 'used'; return { count: 1 }; };
  globalThis.recoveryFixture = s;
  return s;
}
async function call(input = {}) {
  const result = await POST(new Request('https://synthetic.invalid/api/auth/reset-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tokenHash: 'synthetic-token-hash', password: 'Synthetic-New-Password', ...input }) }));
  return { status: result.status, headers: result.headers, body: await result.json() };
}

test('valid token updates password, revokes app sessions, and audits without changing access', async () => {
  const s = fixture(); const r = await call(); assert.equal(r.status, 200); assert.equal(r.body.ok, true); assert.equal(s.userWrites, 1); assert.equal(s.auditWrites, 1); assert.equal(s.updates.length, 1);
});
test('password validation happens before consuming recovery link', async () => {
  const s = fixture(); assert.equal((await call({ password: 'short' })).status, 400); assert.equal(s.verificationCount, 0); assert.equal(s.updates.length, 0);
});
test('invalid link is rejected before password mutation', async () => {
  const s = fixture(); s.consumed = true; assert.equal((await call()).status, 400); assert.equal(s.updates.length, 0);
});
test('identity mismatch is rejected before password mutation', async () => {
  const s = fixture({ tracked: true }); s.identityMode = 'mismatch'; assert.equal((await call()).status, 400); assert.equal(s.updates.length, 0); assert.equal(s.releases, 1);
});
test('weak password can retry without consuming a second recovery link', async () => {
  const s = fixture({ tracked: true }); s.updateStatus = 422; s.updatePayload = { code: 'weak_password', message: 'provider-private-details' }; const first = await call(); assert.equal(first.status, 422); assert.ok(first.body.recoveryRetryToken); assert.doesNotMatch(JSON.stringify(first.body), /provider-private-details|synthetic-access/); s.updateStatus = 200;
  const second = await call({ recoveryRetryToken: first.body.recoveryRetryToken }); assert.equal(second.status, 200); assert.equal(s.verificationCount, 1); assert.equal(s.completions, 1);
});
test('tampered retry ticket is rejected before provider verification', async () => {
  const s = fixture(); const r = await call({ recoveryRetryToken: 'tampered' }); assert.equal(r.status, 400); assert.equal(s.verificationCount, 0);
});
test('completed tracked link rejects replay', async () => {
  const s = fixture({ tracked: true }); assert.equal((await call()).status, 200); assert.equal((await call()).status, 400); assert.equal(s.updates.length, 1);
});
for (const failure of [503, 429, 'throw']) test(`temporary identity read ${failure} preserves verified recovery for a safe retry`, async () => {
  const s = fixture({ tracked: true }); s.identityMode = failure; const first = await call();
  assert.equal(first.status, failure === 429 ? 429 : 503);
  assert.ok(first.body.recoveryRetryToken, 'one-time provider token has been consumed, so retry needs the bounded encrypted credential');
  assert.equal(first.headers.get('cache-control'), 'no-store');
  assert.equal(s.updates.length, 0); assert.equal(s.userWrites, 0); assert.equal(s.releases, 1);
  assert.equal(readPasswordRecoveryRetry(first.body.recoveryRetryToken).email, 'synthetic@example.invalid');
  s.identityMode = 'ok'; const second = await call({ recoveryRetryToken: first.body.recoveryRetryToken });
  assert.equal(second.status, 200); assert.equal(s.verificationCount, 1); assert.equal(s.identityCount, 2); assert.equal(s.updates.length, 1); assert.equal(s.completions, 1);
});
for (const status of [401, 403]) test(`permanent identity rejection ${status} does not mint a recovery retry credential`, async () => {
  const s = fixture(); s.identityMode = status; const r = await call(); assert.equal(r.status, 400); assert.equal(r.body.recoveryRetryToken, undefined); assert.equal(s.updates.length, 0);
});
test('ordinary untracked recovery also retries after an identity outage', async () => {
  const s = fixture(); s.identityMode = 503; const first = await call(); assert.equal(first.status, 503); assert.ok(first.body.recoveryRetryToken); assert.equal(s.releases, 0);
  s.identityMode = 'ok'; assert.equal((await call({ recoveryRetryToken: first.body.recoveryRetryToken })).status, 200); assert.equal(s.verificationCount, 1); assert.equal(s.userWrites, 1);
});
test('revoked parent setup token stays denied after temporary identity failure', async () => {
  const s = fixture({ tracked: true }); s.identityMode = 503; const first = await call(); s.tokenStatus = 'revoked'; s.identityMode = 'ok'; const second = await call({ recoveryRetryToken: first.body.recoveryRetryToken }); assert.equal(second.status, 400); assert.equal(s.updates.length, 0); assert.equal(s.identityCount, 1);
});
test('provider identity is checked again and mismatches fail closed after retry', async () => {
  const s = fixture({ tracked: true }); s.identityMode = 503; const first = await call(); s.identityMode = 'mismatch'; const second = await call({ recoveryRetryToken: first.body.recoveryRetryToken }); assert.equal(second.status, 400); assert.equal(s.updates.length, 0); assert.equal(s.identityCount, 2);
});
test('repeated temporary failures retain the same expiry instead of renewing the ticket', async () => {
  const s = fixture(); s.identityMode = 503; const first = await call(); const second = await call({ recoveryRetryToken: first.body.recoveryRetryToken }); assert.equal(second.status, 503); assert.equal(first.body.recoveryRetryToken, second.body.recoveryRetryToken); assert.equal(s.verificationCount, 1); assert.equal(s.updates.length, 0);
});
test('legacy access-token recovery remains retryable without minting an unverified identity ticket', async () => {
  const s = fixture(); s.identityMode = 503; const first = await call({ tokenHash: undefined, accessToken: 'synthetic-access' }); assert.equal(first.status, 503); assert.equal(first.body.recoveryRetryToken, undefined); s.identityMode = 'ok'; assert.equal((await call({ tokenHash: undefined, accessToken: 'synthetic-access' })).status, 200); assert.equal(s.verificationCount, 0);
});
test('missing credentials do not reach any provider or database boundary', async () => {
  const s = fixture(); const r = await call({ tokenHash: undefined }); assert.equal(r.status, 400); assert.equal(s.verificationCount, 0); assert.equal(s.userWrites, 0); assert.equal(s.identityCount, 0);
});
test('a retry ticket cannot be redirected by substituting raw token or access-token fields', async () => {
  const s = fixture(); s.identityMode = 503; const first = await call(); s.identityMode = 'ok';
  const second = await call({ recoveryRetryToken: first.body.recoveryRetryToken, tokenHash: 'different-untrusted-hash', accessToken: 'different-untrusted-access' });
  assert.equal(second.status, 200); assert.equal(s.updates.length, 1); assert.equal(s.verificationCount, 1);
});
test('expired encrypted retry cannot reach provider verification or mutation', async () => {
  const s = fixture(); const { sealPasswordRecoveryRetry } = await import('../src/lib/password-recovery-retry.ts');
  const ticket = sealPasswordRecoveryRetry({ accessToken: 'synthetic-access', tokenHash: 'synthetic-token-hash', email: 'synthetic@example.invalid' }, Date.now() - 600_001);
  assert.equal((await call({ recoveryRetryToken: ticket })).status, 400); assert.equal(s.identityCount, 0); assert.equal(s.updates.length, 0);
});
test('temporary failure response contains no provider error details or plaintext credentials', async () => {
  const s = fixture(); s.identityMode = 'throw'; const r = await call(); assert.doesNotMatch(JSON.stringify(r.body), /Synthetic provider read timeout|synthetic-access|synthetic-token-hash|synthetic@example/);
});
test('reserved review identities remain blocked after a temporary provider outage', async () => {
  const s = fixture({ tracked: true }); s.providerEmail = 'reserved@example.invalid'; s.identityMode = 503; const first = await call(); assert.equal(first.status, 503); assert.ok(first.body.recoveryRetryToken);
  s.identityMode = 'ok'; const second = await call({ recoveryRetryToken: first.body.recoveryRetryToken }); assert.equal(second.status, 403); assert.equal(s.updates.length, 0); assert.equal(s.userWrites, 0);
});
test('raw access token plus an unverified hash cannot mint an outage retry ticket', async () => {
  const s = fixture(); s.identityMode = 503; const r = await call({ accessToken: 'synthetic-access', tokenHash: 'unverified-hash' });
  assert.equal(r.status, 503); assert.equal(r.body.recoveryRetryToken, undefined); assert.equal(s.verificationCount, 0); assert.equal(s.updates.length, 0);
});
test('real logging redacts recovery material and omits request and response bodies', async () => {
  const { withApiLogging, logOperationalError, redactForOperationalLog } = await import('../src/lib/request-response-logging.ts');
  const secrets = { password: 'fake-private-password', accessToken: 'fake-private-access', tokenHash: 'fake-private-hash', recoveryRetryToken: 'fake-private-ticket' };
  assert.deepEqual(redactForOperationalLog(secrets), Object.fromEntries(Object.keys(secrets).map(key => [key, '[REDACTED]'])));
  const lines = []; const info = console.info; const error = console.error;
  const requestSetting = process.env.REQUEST_RESPONSE_LOGGING; const errorSetting = process.env.OPERATIONAL_ERROR_LOGGING;
  process.env.REQUEST_RESPONSE_LOGGING = 'on'; process.env.OPERATIONAL_ERROR_LOGGING = 'on';
  console.info = line => lines.push(line); console.error = line => lines.push(line);
  try {
    logOperationalError('auth.reset_password.identity_lookup_unavailable', new Error(Object.values(secrets).join(' ')), secrets);
    const request = new Request('https://synthetic.invalid/api/auth/reset-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(secrets) });
    const handler = withApiLogging('POST', async () => Response.json({ ok: false, recoveryRetryToken: secrets.recoveryRetryToken }, { status: 503 }));
    assert.equal((await handler(request)).status, 503);
    await new Promise(resolve => setImmediate(resolve));
  } finally {
    console.info = info; console.error = error;
    if (requestSetting === undefined) delete process.env.REQUEST_RESPONSE_LOGGING; else process.env.REQUEST_RESPONSE_LOGGING = requestSetting;
    if (errorSetting === undefined) delete process.env.OPERATIONAL_ERROR_LOGGING; else process.env.OPERATIONAL_ERROR_LOGGING = errorSetting;
  }
  for (const secret of Object.values(secrets)) assert.equal(lines.some(line => line.includes(secret)), false);
  const requestLog = lines.map(line => JSON.parse(line)).find(line => line.event === 'api.request');
  assert.equal(requestLog.request.body.omitted, 'sensitive_route'); assert.equal(requestLog.response.body.omitted, 'not_sampled');
});
