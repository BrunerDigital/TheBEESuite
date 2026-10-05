import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { retrieveStripeSucceededRefundTotal } from '../src/lib/integrations';
import { isStripeWebhookPaymentEvent } from '../src/lib/stripe-webhook-event-types';
test('real refund workflow excludes unsuccessful outcomes and reconciles stale plans', () => {
  const result = spawnSync(process.execPath, ['--experimental-test-module-mocks','--import','tsx','--test', fileURLToPath(new URL('./helpers/family-refund-lifecycle-mocks.mjs',import.meta.url))],{cwd:process.cwd(),encoding:'utf8'});
  assert.equal(result.status,0,result.stdout+result.stderr);
});
test('refund webhook processor reads use the verified payment tenant and account', () => {
  const route=readFileSync('src/app/api/billing/stripe-webhook/route.ts','utf8');
  const refund=route.slice(route.indexOf('async function handleChargeRefunded'),route.indexOf('async function handleDisputeLifecycle'));
  assert.match(refund,/paymentCenterId = payment\.billingAccount\.family\.centerId/);
  assert.match(refund,/paymentTenantId = paymentCenter\?\.organization\.tenantId/);
  assert.match(refund,/matchedTenantId && paymentTenantId !== matchedTenantId/);
  assert.match(refund,/connectedAccountId: event\.account, tenantId: paymentTenantId/);
});
test('processor refund snapshots paginate and count only succeeded refunds with exact payment scope', async () => {
  const original=globalThis.fetch; const requests:string[]=[];
  globalThis.fetch=(async (url,init) => {
    requests.push(String(url));assert.equal(new Headers(init?.headers).get('Stripe-Account'),'acct_fake');
    assert.ok(!init?.method || init.method === 'GET');
    return new Response(JSON.stringify(requests.length===1 ? {data:[{id:'re_one',amount:6000,status:'succeeded',payment_intent:'pi_fake'},{id:'re_pending',amount:5000,status:'pending',payment_intent:'pi_fake'}],has_more:true}
      : {data:[{id:'re_two',amount:6000,status:'succeeded',payment_intent:'pi_fake'},{id:'re_failed',amount:5000,status:'failed',payment_intent:'pi_fake'}],has_more:false}));
  }) as typeof fetch;
  try {
    assert.equal(await retrieveStripeSucceededRefundTotal({paymentIntentId:'pi_fake',connectedAccountId:'acct_fake',credentials:{STRIPE_SECRET_KEY:'sk_test_fake'}}),12000);
    assert.match(requests[1],/starting_after=re_pending/);
  } finally {globalThis.fetch=original;}
  for(const event of ['refund.created','refund.updated','refund.failed'])assert.equal(isStripeWebhookPaymentEvent(event),true);
});
