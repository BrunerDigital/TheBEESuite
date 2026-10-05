import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
let status, processorTotal, counter, state, totalReads;
const account = { id: 'account', family: { centerId: 'school', name: 'Fake household' }, payments: [{ id: 'payment', amountCents: 24000, status: 'PAID', externalIdPlaceholder: 'pi_fake', customFields: { stripeConnectedAccountId: 'acct_fake', stripePaymentIntentId: 'pi_fake' }, ledgerEntries: [] }] };
function reset() { status='succeeded'; processorTotal=0; counter=0; totalReads=0; state={ payment:{ id:'payment',billingAccountId:'account',amountCents:24000,status:'PAID',customFields:{} },balance:0,ledger:[] }; }
const prisma = {
  $queryRaw: async () => [], $transaction: async fn => fn(prisma),
  billingAccount: { findUnique: async () => structuredClone(account), update: async ({data}) => { state.balance += data.balanceCents.increment; return {balanceCents:state.balance}; } },
  payment: { findUniqueOrThrow: async () => structuredClone(state.payment), update: async ({data}) => Object.assign(state.payment,data) },
  invoice: { aggregate: async () => ({_sum:{totalCents:0}}),findMany:async()=>[] },
  ledgerEntry: {create:async({data})=>state.ledger.push(data)}, auditLog:{create:async()=>({})},center:{update:async()=>({})},
};
mock.module('@/lib/auth', { namedExports: { canAccessCenter: (_user,id)=>id==='school' } });
mock.module('@/lib/prisma', { namedExports: {prisma} });
mock.module('@/lib/integrations', { namedExports: {
  createStripeRefund: async () => { counter++; if(status==='succeeded') processorTotal+=6000; return {ok:true,configured:true,refund:{id:`re_${counter}`,amountCents:6000,status}}; },
  retrieveStripeSucceededRefundTotal: async () => {totalReads++;return processorTotal;},
} });
const module = await import('@/lib/family-refunds');
const { issueFamilyRefund } = module.default ?? module;
const user={id:'director',tenantId:'tenant'};
const input={familyId:'family',amountCents:6000,reason:'Fake test',operationId:'operation'};
test('pending, failed, canceled and action-required refunds are never reported or posted as completed',async()=>{
  for(const value of ['pending','failed','canceled','requires_action']) {
    reset();status=value;const result=await issueFamilyRefund(user,input);
    assert.equal(result.ok,false);assert.equal(result.status,409);assert.match(result.error,/not been recorded as completed/);
    assert.equal(state.balance,0);assert.equal(state.ledger.length,0);assert.equal(totalReads,0);
  }
});
test('overlapping stale refund plans use the authoritative succeeded total under the payment lock',async()=>{
  reset(); await issueFamilyRefund(user,input);await issueFamilyRefund(user,{...input,operationId:'second'});
  assert.equal(state.balance,12000);assert.equal(state.ledger.length,2);assert.equal(totalReads,2);
  assert.equal(state.payment.customFields.stripeAmountRefundedCents,12000);
});
test('a webhook-reconciled refund is not added again by its director response',async()=>{
  reset();state.balance=6000;state.payment.customFields={stripeAmountRefundedCents:6000};
  await issueFamilyRefund(user,input);
  assert.equal(state.balance,6000);assert.equal(state.ledger.length,0);
});
