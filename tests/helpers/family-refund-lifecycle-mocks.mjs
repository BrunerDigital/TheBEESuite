import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
let status, processorTotal, counter, state, totalReads, failTotalOnce, processorClaims, failCreateResponseOnce;
const account = { id: 'account', family: { centerId: 'school', name: 'Fake household' }, payments: [{ id: 'payment', amountCents: 24000, status: 'PAID', externalIdPlaceholder: 'pi_fake', customFields: { stripeConnectedAccountId: 'acct_fake', stripePaymentIntentId: 'pi_fake' }, ledgerEntries: [] }] };
function reset() { status='succeeded'; processorTotal=0; counter=0; totalReads=0; failTotalOnce=false;failCreateResponseOnce=false;processorClaims=new Map(); state={ payment:{ id:'payment',billingAccountId:'account',amountCents:24000,status:'PAID',customFields:{} },balance:0,ledger:[] }; }
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
  createStripeRefund: async input => {
    const existing=processorClaims.get(input.idempotencyKey);
    if(existing) {assert.deepEqual(input,existing.input);return existing.response;}
    counter++; if(status==='succeeded') processorTotal+=6000;
    const response={ok:true,configured:true,refund:{id:`re_${counter}`,amountCents:6000,status}};
    processorClaims.set(input.idempotencyKey,{input:structuredClone(input),response});
    if(failCreateResponseOnce){failCreateResponseOnce=false;return {ok:false,configured:true,error:'Fake lost response'};}
    return response;
  },
  retrieveStripeSucceededRefundTotal: async () => {totalReads++;if(failTotalOnce){failTotalOnce=false;throw new Error('Fake totals failure');}return processorTotal;},
} });
const refundModule = await import('@/lib/family-refunds');
const { issueFamilyRefund } = refundModule.default ?? refundModule;
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
test('a succeeded refund with failed reconciliation reuses its frozen processor key and metadata on retry',async()=>{
  reset();failTotalOnce=true;
  await assert.rejects(issueFamilyRefund(user,input),/Fake totals failure/);
  assert.equal(counter,1);assert.equal(state.balance,0);
  assert.equal(state.payment.customFields.pendingFamilyRefund.refundId,'re_1');
  await issueFamilyRefund({...user,id:'different-director'},{...input,operationId:'new-http-operation'});
  assert.equal(counter,1);assert.equal(state.balance,6000);assert.equal(state.ledger.length,1);
  assert.equal(state.payment.customFields.pendingFamilyRefund,null);
});
test('an unresolved refund claim blocks a different amount before any new processor request',async()=>{
  reset();status='pending';await issueFamilyRefund(user,input);
  const response=await issueFamilyRefund(user,{...input,amountCents:3000,operationId:'new'});
  assert.equal(response.ok,false);assert.equal(response.status,409);assert.equal(counter,1);
});
test('a lost processor response reuses the original key and metadata across HTTP operations and actors',async()=>{
  reset();failCreateResponseOnce=true;assert.equal((await issueFamilyRefund(user,input)).ok,false);
  assert.equal(counter,1);assert.equal(state.balance,0);
  await issueFamilyRefund({...user,id:'different-director'},{...input,operationId:'retry-operation'});
  assert.equal(counter,1);assert.equal(state.balance,6000);
});
test('an unresolved refund beyond the safe retry window is held without another processor call',async()=>{
  reset();failCreateResponseOnce=true;await issueFamilyRefund(user,input);
  state.payment.customFields.pendingFamilyRefund.createdAt=new Date(Date.now()-24*60*60*1000).toISOString();
  assert.equal((await issueFamilyRefund(user,{...input,operationId:'late'})).ok,false);assert.equal(counter,1);
});
