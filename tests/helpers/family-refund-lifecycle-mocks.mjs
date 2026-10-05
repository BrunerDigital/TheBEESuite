import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
let status, processorTotal, counter, state, totalReads, failTotalOnce, processorClaims, failCreateResponseOnce, txDepth, stalePlan, failTotalOnRead, processorTotals;
const account = { id: 'account', family: { centerId: 'school', name: 'Fake household' }, payments: [{ id: 'payment', amountCents: 24000, status: 'PAID', externalIdPlaceholder: 'pi_fake', customFields: { stripeConnectedAccountId: 'acct_fake', stripePaymentIntentId: 'pi_fake' }, ledgerEntries: [] }] };
const originalPayments=structuredClone(account.payments);
function reset() { status='succeeded'; processorTotal=0; counter=0; totalReads=0; failTotalOnce=false;failCreateResponseOnce=false;txDepth=0;stalePlan=false;failTotalOnRead=0;processorTotals=new Map();processorClaims=new Map();account.payments=structuredClone(originalPayments); state={ payment:{ id:'payment',billingAccountId:'account',amountCents:24000,status:'PAID',customFields:{} },balance:0,ledger:[] };state.payments={payment:state.payment}; }
const prisma = {
  $queryRaw: async () => [], $transaction: async fn => {txDepth++;try{return await fn(prisma);}finally{txDepth--;}},
  billingAccount: { findUnique: async () => structuredClone({...account,payments:account.payments.map(payment=>stalePlan?payment:{...payment,...state.payments[payment.id],customFields:{...payment.customFields,...state.payments[payment.id].customFields}})}), update: async ({data}) => { state.balance += data.balanceCents.increment; return {balanceCents:state.balance}; } },
  payment: { findUniqueOrThrow: async ({where}) => structuredClone(state.payments[where.id]), update: async ({where,data}) => Object.assign(state.payments[where.id],data) },
  invoice: { aggregate: async () => ({_sum:{totalCents:0}}),findMany:async()=>[] },
  ledgerEntry: {create:async({data})=>state.ledger.push(data)}, auditLog:{create:async()=>({})},center:{update:async()=>({})},
};
mock.module('@/lib/auth', { namedExports: { canAccessCenter: (_user,id)=>id==='school' } });
mock.module('@/lib/prisma', { namedExports: {prisma} });
mock.module('@/lib/integrations', { namedExports: {
  createStripeRefund: async input => {
    assert.equal(txDepth,0);
    const existing=processorClaims.get(input.idempotencyKey);
    if(existing) {assert.deepEqual(input,existing.input);return existing.response;}
    counter++; if(status==='succeeded') {processorTotal+=input.amountCents;processorTotals.set(input.paymentIntentId,(processorTotals.get(input.paymentIntentId)||0)+input.amountCents);}
    const response={ok:true,configured:true,refund:{id:`re_${counter}`,amountCents:input.amountCents,status}};
    processorClaims.set(input.idempotencyKey,{input:structuredClone(input),response});
    if(failCreateResponseOnce){failCreateResponseOnce=false;return {ok:false,configured:true,error:'Fake lost response'};}
    return response;
  },
  retrieveStripeRefund: async input => {assert.equal(txDepth,0);return {ok:true,configured:true,refund:{id:input.refundId,amountCents:6000,status}};},
  retrieveStripeSucceededRefundTotal: async input => {assert.equal(txDepth,0);totalReads++;if(failTotalOnce || totalReads===failTotalOnRead){failTotalOnce=false;throw new Error('Fake totals failure');}return input.paymentIntentId==='pi_fake'?processorTotal:(processorTotals.get(input.paymentIntentId)||0);},
} });
const refundModule = await import('@/lib/family-refunds');
const { issueFamilyRefund, validateFamilyRefundAvailability } = refundModule.default ?? refundModule;
const user={id:'director',tenantId:'tenant'};
const input={familyId:'family',amountCents:6000,reason:'Fake test',operationId:'operation'};
test('pending, failed, canceled and action-required refunds are never reported or posted as completed',async()=>{
  for(const value of ['pending','failed','canceled','requires_action']) {
    reset();status=value;const result=await issueFamilyRefund(user,input);
    assert.equal(result.ok,false);assert.equal(result.status,409);assert.match(result.error,/not been recorded as completed/);
    assert.equal(state.balance,0);assert.equal(state.ledger.length,0);assert.equal(totalReads,0);
  }
});
test('overlapping stale refund plans apply the authoritative succeeded total under the payment lock',async()=>{
  reset();stalePlan=true; await issueFamilyRefund(user,input);await issueFamilyRefund(user,{...input,operationId:'second'});
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
test('a cached pending refund refreshes to succeeded without another refund POST',async()=>{
  reset();status='pending';await issueFamilyRefund(user,input);
  status='succeeded';processorTotal=6000;
  const response=await issueFamilyRefund(user,{...input,operationId:'retry'});
  assert.equal(response.ok,true);assert.equal(counter,1);assert.equal(state.balance,6000);
  assert.equal(state.payment.customFields.pendingFamilyRefund,null);
});
test('a cached pending refund refreshes to failed and releases its claim without changing the balance',async()=>{
  reset();status='pending';await issueFamilyRefund(user,input);status='failed';
  assert.equal((await issueFamilyRefund(user,{...input,operationId:'retry'})).ok,false);
  assert.equal(counter,1);assert.equal(state.balance,0);assert.equal(state.payment.customFields.pendingFamilyRefund,null);
});
test('a multi-payment request resumes its original total after a later succeeded refund needs reconciliation',async()=>{
  reset();account.payments=[
    {...originalPayments[0],id:'one',amountCents:6000,externalIdPlaceholder:'pi_one',customFields:{stripeConnectedAccountId:'acct_fake',stripePaymentIntentId:'pi_one'}},
    {...originalPayments[0],id:'two',amountCents:6000,externalIdPlaceholder:'pi_two',customFields:{stripeConnectedAccountId:'acct_fake',stripePaymentIntentId:'pi_two'}},
  ];state.payments=Object.fromEntries(account.payments.map(payment=>[payment.id,{...payment,billingAccountId:'account'}]));
  failTotalOnRead=2;
  const request={...input,amountCents:12000,preferredPaymentIds:['one','two']};
  await assert.rejects(issueFamilyRefund(user,request),/Fake totals failure/);
  assert.equal(counter,2);assert.equal(state.balance,6000);assert.equal(state.ledger.length,1);
  assert.equal((await validateFamilyRefundAvailability(user,{...request,operationId:'new-http-operation'})).ok,true);
  const response=await issueFamilyRefund(user,{...request,operationId:'new-http-operation'});
  assert.equal(response.ok,true);assert.equal(response.totalCents,12000);
  assert.equal(counter,2);assert.equal(state.balance,12000);assert.equal(state.ledger.length,2);
});
test('replaying a completed request identity returns its result without another refund',async()=>{
  reset();await issueFamilyRefund(user,input);await issueFamilyRefund(user,input);
  assert.equal(counter,1);assert.equal(state.balance,6000);assert.equal(state.ledger.length,1);
});
test('an exact completed request replay is not replaced by a later pending request with the same amount and reason',async()=>{
  reset();await issueFamilyRefund(user,input);status='pending';await issueFamilyRefund(user,{...input,operationId:'later-request'});
  const response=await issueFamilyRefund(user,input);
  assert.equal(response.ok,true);assert.equal(response.totalCents,6000);assert.equal(counter,2);
  assert.equal(state.balance,6000);assert.equal(state.payment.customFields.pendingFamilyRefund.operationId,'later-request');
});
test('confirmed failed and canceled outcomes retain request identity while using a new processor attempt',async()=>{
  for(const terminal of ['failed','canceled']) {
    reset();status=terminal;assert.equal((await issueFamilyRefund(user,input)).ok,false);
    assert.equal(counter,1);assert.equal(state.balance,0);
    status='succeeded';const response=await issueFamilyRefund(user,input);
    assert.equal(response.ok,true);assert.equal(counter,2);assert.equal(state.balance,6000);assert.equal(state.ledger.length,1);
    const keys=[...processorClaims.keys()];assert.notEqual(keys[0],keys[1]);assert.match(keys[1],/attempt-2$/);
    assert.equal(Object.keys(state.payment.customFields.familyRefundAttempts).length,2);
  }
});
