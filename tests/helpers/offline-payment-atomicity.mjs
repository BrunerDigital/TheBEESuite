import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { createHash, randomUUID } from 'node:crypto';
import { AGENCY_LEDGER_ENTRY_TYPES, AGENCY_LEDGER_SOURCE_SYSTEM, parentVisibleBillingBalanceCents } from '../../src/lib/parent-billing-visibility.ts';

// Executes the checked-out production handlers against an in-memory transactional adapter.
// This is not database, provider, or browser integration verification.
const root = process.cwd() + '/';
const route = readFileSync(root + 'src/app/api/billing/invoices/route.ts', 'utf8');
const application = readFileSync(root + 'src/lib/stripe-payment-application.ts', 'utf8');
const audit = readFileSync(root + 'src/lib/audit.ts', 'utf8');
function section(source, start, end) {
  assert.ok(source.includes(start) && source.includes(end));
  return source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
}
const request = readFileSync(root + 'src/lib/offline-payment-request.ts', 'utf8').replace(/^import[^\r\n]*\r?\n/, '').replaceAll('export ', '');
const source = [request,
  section(audit, 'export async function writeAuditLog(', 'export async function writeSystemAuditLog').replace('export ', ''),
  section(application, 'export async function applyFamilyBalancePaymentToOpenInvoices', 'export type StripePaymentApplicationResult').replace('export ', ''),
  section(route, 'async function manualFamilyPaymentExceedsVisibleBalance', 'async function settleOpenInvoicesForOfflinePayment'),
  section(route, 'async function settleOpenInvoicesForOfflinePayment', 'class PayrollReferenceConflictError'),
].join('\n');
const js = stripTypeScriptTypes(source);
function fixture({ balance=10000, invoiceAmounts=[10000], allowed=true, agencyLedgerEntries=[], auditFails=false, centerFails=false }={}) {
  let state={balance,agencyLedgerEntries:structuredClone(agencyLedgerEntries),payments:[],entries:[],invoices:invoiceAmounts.map((totalCents,i)=>({id:'invoice-'+i,totalCents,status:'OPEN',customFields:{}})),audits:0,centerUpdates:0};
  let transactionQueue = Promise.resolve();
  const tx={
    $queryRaw:async()=>[],
    auditLog:{create:async()=>{if(auditFails)throw new Error('simulated audit failure');state.audits++;}},
    center:{update:async()=>{if(centerFails)throw new Error('simulated center version failure');state.centerUpdates++;}},
    billingAccount:{
      upsert:async()=>({id:'account-fixture',balanceCents:state.balance}),
      findUnique:async()=>({id:'account-fixture',balanceCents:state.balance,ledgerEntries:state.agencyLedgerEntries}),
      update:async({data})=>({id:'account-fixture',balanceCents:state.balance-=data.balanceCents.decrement}),
    },
    payment:{
      create:async({data})=>{const p={id:'payment-'+state.payments.length,...data};state.payments.push(p);return p;},
      findUniqueOrThrow:async({where})=>state.payments.find(p=>p.id===where.id),
      update:async({where,data})=>Object.assign(state.payments.find(p=>p.id===where.id),data),
    },
    ledgerEntry:{
      create:async({data})=>{const e={id:'ledger-'+state.entries.length,...data};state.entries.push(e);return e;},
      findFirst:async({where})=>{const e=state.entries.find(e=>where.sourceSystem.in.includes(e.sourceSystem)&&e.billingAccountId===where.billingAccountId&&e.externalId===where.externalId);return e?{...e,payment:state.payments.find(p=>p.id===e.paymentId)}:null;},
    },
    invoice:{
      findMany:async()=>state.invoices.filter(i=>i.status==='OPEN'&&i.totalCents>0),
      updateMany:async({where,data})=>{const i=state.invoices.find(i=>i.id===where.id&&i.status===where.status);if(!i)return {count:0};Object.assign(i,data);return {count:1};},
    },
  };
  const deps={
    PaymentStatus:{PAID:'PAID',OPEN:'OPEN'},
    Prisma:{sql:(strings,...values)=>({strings,values})},
    createHash,
    AGENCY_LEDGER_ENTRY_TYPES, AGENCY_LEDGER_SOURCE_SYSTEM, parentVisibleBillingBalanceCents,
    clean:v=>typeof v==='string'?v.trim():'',
    jsonRecord:v=>v&&typeof v==='object'?v:{},
    jsonObject:v=>v&&typeof v==='object'?v:{},
    inputJson:v=>v,
    assertFamilyAccess:async()=>allowed?{ok:true,family:{id:'family-fixture'},centerId:'school-fixture'}:{ok:false,error:'No access',status:403},
    amountCentsFromBody:b=>b.amountCents??Math.round(Number(b.amountDollars)*100),
    parseDate:v=>new Date(v),randomUUID,
    prisma:{
      ...tx,
      // Global audit/version writes are not part of this transaction. Keeping
      // them distinct makes a missing explicit tx argument fail this fixture.
      auditLog:{create:async()=>{throw new Error('Audit must use the transaction client');}},
      center:{update:async()=>{throw new Error('Billing version must use the transaction client');}},
      $transaction:(fn)=>{const run=transactionQueue.then(async()=>{const before=structuredClone(state);try{return await fn(tx);}catch(e){state=before;throw e;}});transactionQueue=run.catch(()=>undefined);return run;},
    },
    NextResponse:{json:(body,options={})=>({status:options.status??200,body})},
  };
  const handlers=Function(...Object.keys(deps),js+'\nreturn {cash:createManualCashPayment,check:createManualCheckPayment,recover:recoverOfflinePaymentReceipt};')(...Object.values(deps));
  return {handlers,state:()=>state,clearFailure:()=>{auditFails=false;centerFails=false;}};
}
const user={id:'user-fixture',tenantId:'tenant-fixture',email:'billing@example.invalid'};
const body={requestId:'00000000-0000-4000-8000-000000000001',familyId:'family-fixture',amountCents:10000,paidAt:'2026-10-13T12:00:00.000Z'};
const results=[];
async function check(name,fn){try{await fn();results.push({name,status:'passed'});}catch(e){results.push({name,status:'failed',error:e.message});}}
await check('cash posts one completed payment, one ledger credit, zero balance, invoice paid',async()=>{const f=fixture();const r=await f.handlers.cash(user,body);assert.equal(r.status,200);assert.equal(f.state().balance,0);assert.equal(f.state().payments.length,1);assert.equal(f.state().entries.length,1);assert.equal(f.state().entries[0].amountCents,-10000);assert.equal(f.state().invoices[0].status,'PAID');assert.equal(f.state().audits,1);});
await check('check posts and settles only fully covered oldest invoice',async()=>{const f=fixture({balance:25000,invoiceAmounts:[10000,15000]});const r=await f.handlers.check(user,{...body,checkNumber:'fixture-1042'});assert.equal(r.status,200);assert.equal(f.state().balance,15000);assert.deepEqual(f.state().invoices.map(i=>i.status),['PAID','OPEN']);});
await check('check rejects missing reference before any writes',async()=>{const f=fixture();assert.equal((await f.handlers.check(user,body)).status,400);assert.equal(f.state().payments.length,0);});
await check('cash rejects zero amount before any writes',async()=>{const f=fixture();assert.equal((await f.handlers.cash(user,{...body,amountCents:0})).status,400);assert.equal(f.state().payments.length,0);});
await check('cash rejects unauthorized family before any writes',async()=>{const f=fixture({allowed:false});assert.equal((await f.handlers.cash(user,body)).status,403);assert.equal(f.state().payments.length,0);});
await check('check preserves agency responsibility collection guard',async()=>{const f=fixture({balance:0,agencyLedgerEntries:[{type:'agency_receivable',amountCents:0}]});assert.equal((await f.handlers.check(user,{...body,checkNumber:'fixture-1042'})).status,409);assert.equal(f.state().payments.length,0);});
for (const scenario of [
  {name:'cash overpayment with agency history leaves family credit',balance:64000,invoiceAmounts:[44000],amountCents:50000,agencyLedgerEntries:[{type:'agency_receivable',amountCents:20000}],expectedCredit:6000},
  {name:'cash at zero family balance with agency history leaves family credit',balance:20000,invoiceAmounts:[],amountCents:10000,agencyLedgerEntries:[{type:'agency_receivable',amountCents:20000}],expectedCredit:10000},
  {name:'cash adds to an existing family credit with agency history',balance:15000,invoiceAmounts:[],amountCents:10000,agencyLedgerEntries:[{type:'agency_receivable',amountCents:20000}],expectedCredit:15000},
  {name:'cash overpayment without agency history leaves family credit',balance:44000,invoiceAmounts:[44000],amountCents:50000,agencyLedgerEntries:[],expectedCredit:6000},
  {name:'cash at zero account balance leaves family credit',balance:0,invoiceAmounts:[],amountCents:10000,agencyLedgerEntries:[],expectedCredit:10000},
  {name:'cash preserves historical agency credits while leaving family credit',balance:44000,invoiceAmounts:[44000],amountCents:50000,agencyLedgerEntries:[{type:'agency_payment',amountCents:-20000}],expectedCredit:6000},
]) {
  await check(scenario.name,async()=>{
    const f=fixture(scenario);
    const request={...body,amountCents:scenario.amountCents};
    const responses=await Promise.all([f.handlers.cash(user,request),f.handlers.cash(user,request)]);
    assert.deepEqual(responses.map(r=>r.status),[200,200]);
    assert.equal(responses.filter(r=>r.body.alreadyRecorded).length,1);
    assert.equal(f.state().balance,scenario.balance-scenario.amountCents);
    assert.equal(parentVisibleBillingBalanceCents({accountBalanceCents:f.state().balance,agencyLedgerEntries:f.state().agencyLedgerEntries}),-scenario.expectedCredit);
    assert.equal(f.state().payments.length,1);
    assert.equal(f.state().payments[0].amountCents,scenario.amountCents);
    assert.equal(f.state().entries.length,1);
    assert.equal(f.state().entries[0].amountCents,-scenario.amountCents);
    assert.equal(f.state().entries[0].balanceAfterCents,f.state().balance);
    assert.equal(f.state().audits,1);
    assert.deepEqual(f.state().invoices.map(i=>i.status),scenario.invoiceAmounts.map(()=>'PAID'));
    assert.deepEqual(f.state().agencyLedgerEntries,scenario.agencyLedgerEntries);
    assert.deepEqual(responses[0].body.appliedInvoiceIds,scenario.invoiceAmounts.map((_,i)=>'invoice-'+i));
  });
}
await check('separate partial payments close invoice only after fully covered',async()=>{const f=fixture();await f.handlers.cash(user,{...body,amountCents:5000});assert.equal(f.state().invoices[0].status,'OPEN');await f.handlers.cash(user,{...body,requestId:randomUUID(),amountCents:5000,reference:'second-receipt'});assert.equal(f.state().balance,0);assert.equal(f.state().invoices[0].status,'PAID');});
for (const method of ['cash','check']) {
  for (const failure of ['auditFails','centerFails']) {
    await check(`${method}: ${failure} rolls back payment, ledger, invoice, balance, and audit`,async()=>{
      const f=fixture({[failure]:true});
      await assert.rejects(f.handlers[method](user,{...body,checkNumber:'fixture-1042'}));
      assert.equal(f.state().balance,10000);
      assert.equal(f.state().payments.length,0);
      assert.equal(f.state().entries.length,0);
      assert.equal(f.state().invoices[0].status,'OPEN');
      assert.equal(f.state().audits,0);
      assert.equal(f.state().centerUpdates,0);
    });
  }
}
for (const method of ['cash','check']) {
  const request={...body,checkNumber:'fixture-1042'};
  await check(`${method}: concurrent request replay posts exactly once`,async()=>{
    const f=fixture();
    const responses=await Promise.all([f.handlers[method](user,request),f.handlers[method](user,request)]);
    assert.deepEqual(responses.map(r=>r.status),[200,200]);
    assert.equal(responses.filter(r=>r.body.alreadyRecorded).length,1);
    assert.equal(f.state().balance,0);assert.equal(f.state().payments.length,1);assert.equal(f.state().entries.length,1);assert.equal(f.state().audits,1);
  });
  await check(`${method}: same request identity with changed details is rejected`,async()=>{
    const f=fixture();await f.handlers[method](user,request);
    assert.equal((await f.handlers[method](user,{...request,amountCents:5000})).status,409);
    assert.equal(f.state().balance,0);assert.equal(f.state().payments.length,1);
  });
  await check(`${method}: distinct request identities preserve legitimate same-amount receipts`,async()=>{
    const f=fixture({balance:20000,invoiceAmounts:[10000,10000]});
    await f.handlers[method](user,request);await f.handlers[method](user,{...request,requestId:randomUUID()});
    assert.equal(f.state().payments.length,2);assert.equal(f.state().balance,0);
  });
  await check(`${method}: replay succeeds before a now-zero agency balance guard`,async()=>{
    const f=fixture({agencyLedgerEntries:[{type:'agency_receivable',amountCents:0}]});
    await f.handlers[method](user,request);
    assert.equal((await f.handlers[method](user,request)).status,200);assert.equal(f.state().payments.length,1);
  });
  await check(`${method}: retry after audit rollback posts once with original request identity`,async()=>{
    const f=fixture({auditFails:true});await assert.rejects(f.handlers[method](user,request));f.clearFailure();
    assert.equal((await f.handlers[method](user,request)).status,200);assert.equal(f.state().payments.length,1);assert.equal(f.state().balance,0);
  });
}
await check('missing or malformed request identity rejects before mutation',async()=>{
  for(const requestId of [undefined,'','not-a-request']) {
    const f=fixture();assert.equal((await f.handlers.cash(user,{...body,requestId})).status,400);assert.equal(f.state().payments.length,0);
  }
});
await check('offline requests require explicit stable received dates before mutation',async()=>{
  for(const method of ['cash','check']) for(const paidAt of [undefined,'','invalid']) {
    const f=fixture();assert.equal((await f.handlers[method](user,{...body,checkNumber:'123',paidAt})).status,400);assert.equal(f.state().payments.length,0);
  }
});
await check('method switch with one operation returns original receipt without another post',async()=>{
  const f=fixture({balance:30000});await f.handlers.cash(user,body);
  const r=await f.handlers.check(user,{...body,checkNumber:'method-change'});
  assert.equal(r.status,409);assert.equal(r.body.receipt.payment.provider,'manual_cash');assert.equal(f.state().payments.length,1);assert.equal(f.state().balance,20000);
});
await check('concurrent mixed methods share one account request identity',async()=>{
  const f=fixture({balance:30000});const r=await Promise.all([f.handlers.cash(user,body),f.handlers.check(user,{...body,checkNumber:'method-change'})]);
  assert.deepEqual(r.map(x=>x.status),[200,409]);assert.equal(f.state().payments.length,1);
});
await check('receipt recovery after reload or family navigation is read only',async()=>{
  const f=fixture();await f.handlers.cash(user,body);const before=structuredClone(f.state());
  const r=await f.handlers.recover(user,{familyId:body.familyId,requestId:body.requestId});
  assert.equal(r.status,200);assert.equal(r.body.found,true);assert.equal(r.body.receipt.payment.amountCents,10000);assert.deepEqual(f.state(),before);
});
await check('not-found recovery never creates a payment or account adjustment',async()=>{
  const f=fixture();const before=structuredClone(f.state());const r=await f.handlers.recover(user,body);
  assert.equal(r.body.found,false);assert.deepEqual(f.state(),before);
});
await check('recovery enforces family access before returning any receipt',async()=>{
  const f=fixture({allowed:false});assert.equal((await f.handlers.recover(user,body)).status,403);assert.equal(f.state().payments.length,0);
});
await check('changed timestamp returns reviewable original receipt without duplicate',async()=>{
  const f=fixture();await f.handlers.cash(user,body);const r=await f.handlers.cash(user,{...body,paidAt:'2026-10-14T12:00:00Z'});
  assert.equal(r.status,409);assert.equal(r.body.receipt.payment.id,f.state().payments[0].id);assert.equal(f.state().payments.length,1);
});
console.log(JSON.stringify({results},null,2));
if(results.some(r=>r.status!=='passed'))process.exitCode=1;
