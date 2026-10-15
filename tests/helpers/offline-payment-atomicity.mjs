import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { randomUUID } from 'node:crypto';

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
const source = [
  section(audit, 'export async function writeAuditLog(', 'export async function writeSystemAuditLog').replace('export ', ''),
  section(application, 'export async function applyFamilyBalancePaymentToOpenInvoices', 'export type StripePaymentApplicationResult').replace('export ', ''),
  section(route, 'async function settleOpenInvoicesForOfflinePayment', 'class PayrollReferenceConflictError'),
].join('\n');
const js = stripTypeScriptTypes(source);
function fixture({ balance=10000, invoiceAmounts=[10000], allowed=true, agencyBlocked=false, auditFails=false, centerFails=false }={}) {
  let state={balance,payments:[],entries:[],invoices:invoiceAmounts.map((totalCents,i)=>({id:'invoice-'+i,totalCents,status:'OPEN',customFields:{}})),audits:0,centerUpdates:0};
  const tx={
    auditLog:{create:async()=>{if(auditFails)throw new Error('simulated audit failure');state.audits++;}},
    center:{update:async()=>{if(centerFails)throw new Error('simulated center version failure');state.centerUpdates++;}},
    billingAccount:{
      upsert:async()=>({id:'account-fixture',balanceCents:state.balance}),
      update:async({data})=>({id:'account-fixture',balanceCents:state.balance-=data.balanceCents.decrement}),
    },
    payment:{
      create:async({data})=>{const p={id:'payment-'+state.payments.length,...data};state.payments.push(p);return p;},
      findUniqueOrThrow:async({where})=>state.payments.find(p=>p.id===where.id),
      update:async({where,data})=>Object.assign(state.payments.find(p=>p.id===where.id),data),
    },
    ledgerEntry:{create:async({data})=>{const e={id:'ledger-'+state.entries.length,...data};state.entries.push(e);return e;}},
    invoice:{
      findMany:async()=>state.invoices.filter(i=>i.status==='OPEN'&&i.totalCents>0),
      updateMany:async({where,data})=>{const i=state.invoices.find(i=>i.id===where.id&&i.status===where.status);if(!i)return {count:0};Object.assign(i,data);return {count:1};},
    },
  };
  const deps={
    PaymentStatus:{PAID:'PAID',OPEN:'OPEN'},
    clean:v=>typeof v==='string'?v.trim():'',
    jsonRecord:v=>v&&typeof v==='object'?v:{},
    jsonObject:v=>v&&typeof v==='object'?v:{},
    inputJson:v=>v,
    assertFamilyAccess:async()=>allowed?{ok:true,family:{id:'family-fixture'},centerId:'school-fixture'}:{ok:false,error:'No access',status:403},
    amountCentsFromBody:b=>b.amountCents??Math.round(Number(b.amountDollars)*100),
    manualFamilyPaymentExceedsVisibleBalance:async()=>agencyBlocked,
    parseDate:v=>new Date(v),randomUUID,
    prisma:{
      ...tx,
      // Global audit/version writes are not part of this transaction. Keeping
      // them distinct makes a missing explicit tx argument fail this fixture.
      auditLog:{create:async()=>{throw new Error('Audit must use the transaction client');}},
      center:{update:async()=>{throw new Error('Billing version must use the transaction client');}},
      $transaction:async(fn)=>{const before=structuredClone(state);try{return await fn(tx);}catch(e){state=before;throw e;}},
    },
    NextResponse:{json:(body,options={})=>({status:options.status??200,body})},
  };
  const handlers=Function(...Object.keys(deps),js+'\nreturn {cash:createManualCashPayment,check:createManualCheckPayment};')(...Object.values(deps));
  return {handlers,state:()=>state};
}
const user={id:'user-fixture',tenantId:'tenant-fixture',email:'billing@example.invalid'};
const body={familyId:'family-fixture',amountCents:10000,paidAt:'2026-10-13T12:00:00.000Z'};
const results=[];
async function check(name,fn){try{await fn();results.push({name,status:'passed'});}catch(e){results.push({name,status:'failed',error:e.message});}}
await check('cash posts one completed payment, one ledger credit, zero balance, invoice paid',async()=>{const f=fixture();const r=await f.handlers.cash(user,body);assert.equal(r.status,200);assert.equal(f.state().balance,0);assert.equal(f.state().payments.length,1);assert.equal(f.state().entries.length,1);assert.equal(f.state().entries[0].amountCents,-10000);assert.equal(f.state().invoices[0].status,'PAID');assert.equal(f.state().audits,1);});
await check('check posts and settles only fully covered oldest invoice',async()=>{const f=fixture({balance:25000,invoiceAmounts:[10000,15000]});const r=await f.handlers.check(user,{...body,checkNumber:'fixture-1042'});assert.equal(r.status,200);assert.equal(f.state().balance,15000);assert.deepEqual(f.state().invoices.map(i=>i.status),['PAID','OPEN']);});
await check('check rejects missing reference before any writes',async()=>{const f=fixture();assert.equal((await f.handlers.check(user,body)).status,400);assert.equal(f.state().payments.length,0);});
await check('cash rejects zero amount before any writes',async()=>{const f=fixture();assert.equal((await f.handlers.cash(user,{...body,amountCents:0})).status,400);assert.equal(f.state().payments.length,0);});
await check('cash rejects unauthorized family before any writes',async()=>{const f=fixture({allowed:false});assert.equal((await f.handlers.cash(user,body)).status,403);assert.equal(f.state().payments.length,0);});
await check('cash preserves agency responsibility collection guard',async()=>{const f=fixture({agencyBlocked:true});assert.equal((await f.handlers.cash(user,body)).status,409);assert.equal(f.state().payments.length,0);});
await check('separate partial payments close invoice only after fully covered',async()=>{const f=fixture();await f.handlers.cash(user,{...body,amountCents:5000});assert.equal(f.state().invoices[0].status,'OPEN');await f.handlers.cash(user,{...body,amountCents:5000,reference:'second-receipt'});assert.equal(f.state().balance,0);assert.equal(f.state().invoices[0].status,'PAID');});
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
console.log(JSON.stringify({results},null,2));
if(results.some(r=>r.status!=='passed'))process.exitCode=1;
