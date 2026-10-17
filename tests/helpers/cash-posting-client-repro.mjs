import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

const ui=readFileSync('src/components/billing-workbench.tsx','utf8');
function section(start,end){return ui.slice(ui.indexOf(start),ui.indexOf(end,ui.indexOf(start)));}
const pure=['offline-payment-operation','offline-payment-receipt'].map(name=>readFileSync(`src/lib/${name}.ts`,'utf8').replaceAll('export ',''));
pure.push(readFileSync('src/lib/zoned-date-time.ts','utf8').replaceAll('export ',''));
const js=stripTypeScriptTypes(section('  function handleCenterChange(', '  function handleTuitionPlanChange(')+'\n'+pure.join('\n')+'\n'+section('function manualPaymentTimestamp(', 'function currentBillingPeriod(')+'\n'+section('  function submit(payload:','  function submitSingle()')+'\n'+section('  function offlineOperationScope(','  function submitPayrollDeductionPayment()')+'\n'+section('function dollarsToCents(', 'function tuitionCreditInputs('));
function memoryStorage(){const values=new Map();return {getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k),values};}
const family={id:'family-fixture',centerId:'school-fixture'};
const operationRequest={mode:'manualCashPayment',familyId:family.id,amountCents:10000};
function fixture(storage=memoryStorage()){
  const state={errors:[],messages:[],requests:[],resets:0,refreshes:0,review:null};let pending=Promise.resolve();let response={status:200,body:null};let confirmed=false;
  const deps={
    checkAmountDollars:'100.00',checkNumber:'fixture-reference',checkPaidAt:'2026-10-13T12:00',checkNotes:'',cashAmountDollars:'100.00',cashReference:'receipt-fixture',cashNotes:'',cashPaidAt:'2026-10-16T17:32',confirmBillingAction:()=>!state.cancelled,
    offlinePaymentOperationInFlight:{current:false},state, families:[family,{id:'other-family',centerId:'school-fixture'}], currentUserId:'user-fixture',selectedFamily:family,timeZone:'UTC',
    window:{sessionStorage:storage,confirm:()=>confirmed},
    fetch:async(url,init)=>{state.requests.push(JSON.parse(init.body));if(response.throws)throw new Error('interrupted');return {ok:response.status<400,json:async()=>{if(response.malformed)throw new Error('truncated JSON');return typeof response.body==='function'?response.body(state.requests.at(-1)):response.body;}};},
    setErrorMessage:v=>state.errors.push(v),setStatusMessage:v=>state.messages.push(v),
    setCashAmountDollars:()=>state.resets++,setCashReference:()=>state.resets++,setCashNotes:()=>state.resets++,setCashPaidAt:()=>state.resets++,
    setCheckAmountDollars:()=>state.resets++,setCheckNumber:()=>state.resets++,setCheckNotes:()=>state.resets++,setCheckPaidAt:()=>state.resets++,
    currentLocalDateTime:()=>'',money:v=>String(v),router:{refresh:()=>state.refreshes++},
    runBillingTransition:fn=>{pending=Promise.resolve().then(fn).catch(e=>state.errors.push(e.message));},
  };
  const handlers=Function(...Object.keys(deps),'let offlineReceiptReview=null;const setOfflineReceiptReview=value=>{offlineReceiptReview=value;state.review=value;};\n'+js+'\nreturn {getId:offlinePaymentRequestIdFor,getReview:currentOfflineReceiptReview,submit,recover:recoverOfflineReceipt,acknowledge:acknowledgeOfflineReceipt,setFamily:v=>{selectedFamily=v;},setUser:v=>{currentUserId=v;},changeCenter:handleCenterChange,changeFamily:handleFamilyChange,cash:submitManualCashPayment,setCashInput:v=>{cashAmountDollars=v;},setCashDate:v=>{cashPaidAt=v;},setZone:v=>{timeZone=v;},check:submitManualCheckPayment,setCheckInput:v=>{checkAmountDollars=v;}};')(...Object.values(deps));
  return {handlers,state,storage,respond:r=>{response=r;},confirm:v=>{confirmed=v;},settle:()=>pending};
}
function receipt(requestId,overrides={}){return {ok:true,totalCents:10000,payment:{id:'payment-fixture',billingAccountId:'account-fixture',provider:'manual_cash',status:'PAID',amountCents:10000,customFields:{requestId,familyId:family.id}},entry:{id:'entry-fixture',billingAccountId:'account-fixture',paymentId:'payment-fixture',amountCents:-10000},...overrides};}
const results=[];async function check(name,fn){try{await fn();results.push({name,status:'passed'});}catch(error){results.push({name,status:'failed',error:error.message});}}
await check('interrupted POST retains exact identity across a fresh component after reload',async()=>{
  const f=fixture();const requestId=f.handlers.getId(family.id);f.respond({throws:true});f.handlers.submit({...operationRequest,requestId});await f.settle();
  const reloaded=fixture(f.storage);assert.equal(reloaded.handlers.getId(family.id),requestId);assert.equal(reloaded.state.requests.length,0);assert.equal(f.state.resets,0);
});
await check('malformed HTTP200 never clears request or payment draft',async()=>{
  const f=fixture();const requestId=f.handlers.getId(family.id);f.respond({status:200,malformed:true});f.handlers.submit({...operationRequest,requestId});await f.settle();
  assert.equal(f.handlers.getId(family.id),requestId);assert.equal(f.state.resets,0);assert.ok(f.state.errors.some(x=>x.includes('could not be confirmed')));
});
await check('validated successful receipt clears only matching operation and resets draft',async()=>{
  const f=fixture();const requestId=f.handlers.getId(family.id);f.respond({status:200,body:receipt(requestId)});f.handlers.submit({...operationRequest,requestId});await f.settle();
  assert.notEqual(f.handlers.getId(family.id),requestId);assert.equal(f.state.resets,4);assert.equal(f.state.requests.length,1);
});
await check('changed method conflict retains marker until explicit receipt review, without resubmitting',async()=>{
  const f=fixture();const requestId=f.handlers.getId(family.id);f.respond({status:409,body:{ok:false,error:'Review original receipt',receipt:receipt(requestId)}});
  f.handlers.submit({...operationRequest,requestId,mode:'manualCheckPayment'});await f.settle();assert.ok(f.state.review);assert.equal(f.handlers.getId(family.id),requestId);
  f.handlers.acknowledge();assert.equal(f.handlers.getId(family.id),requestId);f.confirm(true);f.handlers.acknowledge();assert.notEqual(f.handlers.getId(family.id),requestId);assert.equal(f.state.requests.length,1);
});
await check('family navigation cannot clear another family receipt and preserves original identity',async()=>{
  const f=fixture();const requestId=f.handlers.getId(family.id);f.respond({status:200,body:{ok:true,found:true,receipt:receipt(requestId)}});f.handlers.recover();await f.settle();
  f.handlers.setFamily({id:'other-family',centerId:'school-fixture'});assert.equal(f.handlers.getReview(),null);f.confirm(true);f.handlers.acknowledge();assert.equal(f.handlers.getId(family.id),requestId);
  f.handlers.setFamily(family);assert.equal(f.handlers.getId(family.id),requestId);assert.equal(f.state.requests.length,1);assert.equal(f.state.requests[0].mode,'offlinePaymentReceipt');
});
await check('user switch cannot acknowledge a previous user receipt',async()=>{
  const f=fixture();const requestId=f.handlers.getId(family.id);f.respond({status:200,body:{ok:true,found:true,receipt:receipt(requestId)}});f.handlers.recover();await f.settle();f.handlers.setUser('other-user');assert.equal(f.handlers.getReview(),null);f.confirm(true);f.handlers.acknowledge();
  f.handlers.setUser('user-fixture');assert.equal(f.handlers.getId(family.id),requestId);
});
await check('not-found recovery preserves uncertainty and never posts or clears',async()=>{
  const f=fixture();const requestId=f.handlers.getId(family.id);f.respond({status:200,body:{ok:true,found:false}});f.handlers.recover();await f.settle();
  assert.equal(f.handlers.getId(family.id),requestId);assert.equal(f.state.requests.length,1);assert.equal(f.state.requests[0].mode,'offlinePaymentReceipt');assert.equal(f.state.resets,0);assert.equal(f.state.review,null);
});
await check('storage read failure rejects preparation visibly before any POST',async()=>{
  const f=fixture({getItem(){throw new Error('blocked');}});assert.equal(f.handlers.getId(family.id),null);assert.equal(f.state.requests.length,0);assert.ok(f.state.errors.length);
});
await check('recovered malformed or wrong-family receipts cannot be acknowledged',async()=>{
  const f=fixture();const requestId=f.handlers.getId(family.id);const bad=receipt(requestId);bad.payment.customFields.familyId='other-family';f.respond({status:200,body:{ok:true,found:true,receipt:bad}});f.handlers.recover();await f.settle();
  assert.equal(f.state.review,null);f.confirm(true);f.handlers.acknowledge();assert.equal(f.handlers.getId(family.id),requestId);assert.equal(f.state.resets,0);
});
await check('formatted check amounts submit normalized cents and validate the matching receipt',async()=>{
  for(const [value,amount] of [['$100.00',10000],['1,000.00',100000]]) {
    const f=fixture();f.handlers.setCheckInput(value);f.respond({status:200,body:payload=>{const r=receipt(payload.requestId);r.totalCents=amount;r.payment.provider='manual_check';r.payment.amountCents=amount;r.entry.amountCents=-amount;return r;}});
    f.handlers.check();await f.settle();assert.equal(f.state.requests[0].amountCents,amount);assert.equal(f.state.requests[0].amountDollars,undefined);assert.equal(f.state.resets,4);assert.equal(f.storage.values.size,0);
  }
});
await check('stale receipt review cannot clear a newly persisted operation',async()=>{
  const f=fixture();const original=f.handlers.getId(family.id);f.respond({status:200,body:{ok:true,found:true,receipt:receipt(original)}});f.handlers.recover();await f.settle();
  const [key,raw]=[...f.storage.values.entries()][0];const changed=JSON.parse(raw);changed.requestId='00000000-0000-4000-8000-000000000007';f.storage.setItem(key,JSON.stringify(changed));assert.equal(f.handlers.getReview(),null);
  f.confirm(true);f.handlers.acknowledge();assert.equal(f.handlers.getId(family.id),changed.requestId);assert.equal(f.state.resets,0);assert.equal(f.state.requests.length,1);
});
await check('school changes hide and block acknowledgment of a late receipt',async()=>{
  const f=fixture();const requestId=f.handlers.getId(family.id);f.respond({status:200,body:{ok:true,found:true,receipt:receipt(requestId)}});f.handlers.recover();await f.settle();
  f.handlers.setFamily({...family,centerId:'other-school'});assert.equal(f.handlers.getReview(),null);f.confirm(true);f.handlers.acknowledge();assert.equal(f.handlers.getId(family.id),requestId);assert.equal(f.state.resets,0);
});

await check('cash handler normalizes formatted amounts and submits a validated school-local received time',async()=>{
  for(const [value,amount] of [['100',10000],['$100.00',10000],['1,000.00',100000]]) {
    const f=fixture();f.handlers.setCashInput(value);f.handlers.setZone('America/Chicago');
    f.respond({status:200,body:payload=>{const r=receipt(payload.requestId);r.totalCents=amount;r.payment.amountCents=amount;r.entry.amountCents=-amount;return r;}});
    f.handlers.cash();await f.settle();assert.equal(f.state.requests[0].amountCents,amount);assert.equal(f.state.requests[0].paidAt,'2026-10-16T22:32:00.000Z');assert.equal(f.state.resets,4);
  }
});
await check('cash invalid amount and date fail before request',async()=>{
  for(const value of ['','0','-1','abc']) {const f=fixture();f.handlers.setCashInput(value);f.handlers.cash();await f.settle();assert.equal(f.state.requests.length,0);assert.match(f.state.errors.at(-1),/amount/);}
  for(const value of ['', 'bad','2026-02-30T10:00','2026-03-08T02:30','2026-11-01T01:30']) {const f=fixture();f.handlers.setZone('America/Chicago');f.handlers.setCashDate(value);f.handlers.cash();await f.settle();assert.equal(f.state.requests.length,0);assert.match(f.state.errors.at(-1),/date/);}
});
await check('cash missing family or identity fails closed before request',async()=>{
  const f=fixture();f.handlers.setFamily(null);f.handlers.cash();await f.settle();assert.equal(f.state.requests.length,0);assert.match(f.state.errors.at(-1),/family/);
  const g=fixture();g.handlers.setUser('');g.handlers.cash();await g.settle();assert.equal(g.state.requests.length,0);assert.match(g.state.errors.at(-1),/Refresh/);
});
await check('cash cancelled confirmation does not create operation or POST',async()=>{
  const f=fixture();f.state.cancelled=true;f.handlers.cash();await f.settle();assert.equal(f.state.requests.length,0);assert.equal(f.storage.values.size,0);
});
await check('cash blocked storage fails before request with recovery error',async()=>{
  for(const method of ['getItem','setItem']) {const storage=memoryStorage();storage[method]=()=>{throw Error('blocked')};const f=fixture(storage);f.handlers.cash();await f.settle();assert.equal(f.state.requests.length,0);assert.match(f.state.errors.at(-1),/recovery/);}
});
await check('cash interrupted handler retries same request and unchanged payment exactly',async()=>{
  const f=fixture();f.respond({throws:true});f.handlers.cash();await f.settle();const original=f.state.requests[0];f.respond({status:200,body:p=>receipt(p.requestId)});f.handlers.cash();await f.settle();assert.deepEqual(f.state.requests[1],original);assert.equal(f.state.resets,4);
});
await check('cash validation rejection preserves operation and allows corrected input without duplicate identity',async()=>{
  const f=fixture();f.respond({status:409,body:{error:'Cash payment cannot exceed the family-responsibility balance.'}});f.handlers.cash();await f.settle();const original=f.state.requests[0].requestId;assert.equal(f.state.resets,0);assert.match(f.state.errors.at(-1),/family-responsibility/);f.handlers.setCashInput('50');f.handlers.cash();await f.settle();assert.equal(f.state.requests[1].requestId,original);
});
await check('cash duplicated handler invocation starts only one POST',async()=>{
  const f=fixture();f.respond({throws:true});f.handlers.cash();f.handlers.cash();await f.settle();assert.equal(f.state.requests.length,1);
});

await check('two successful responses for one rapid cash submission do not falsely report changed recovery marker',async()=>{
  const f=fixture();f.respond({status:200,body:p=>receipt(p.requestId)});f.handlers.cash();f.handlers.cash();await f.settle();assert.equal(f.state.requests.length,1);assert.equal(f.state.errors.filter(Boolean).length,0,JSON.stringify(f.state.errors));assert.equal(f.state.resets,4);
});

await check('rapid mixed cash and check clicks issue only one offline POST',async()=>{
  const f=fixture();f.respond({status:200,body:p=>receipt(p.requestId)});f.handlers.cash();f.handlers.check();await f.settle();assert.equal(f.state.requests.length,1);assert.equal(f.state.requests[0].mode,'manualCashPayment');assert.equal(f.state.errors.filter(Boolean).length,0);
});
await check('offline guard releases after all failure outcomes while preserving request for safe retry',async()=>{
  for(const outcome of [{throws:true},{status:403,body:{error:'Forbidden'}},{status:409,body:{error:'Conflict'}},{status:500,body:null},{status:200,malformed:true},{status:200,body:{ok:true}}]) {
    const f=fixture();f.respond(outcome);f.handlers.cash();await f.settle();const id=f.state.requests[0].requestId;f.respond({status:200,body:p=>receipt(p.requestId)});f.handlers.cash();await f.settle();assert.equal(f.state.requests.length,2);assert.equal(f.state.requests[1].requestId,id);assert.equal(f.state.resets,4);
  }
});
await check('confirmed cash payment permits a later separate payment with new identity',async()=>{
  const f=fixture();f.respond({status:200,body:p=>receipt(p.requestId)});f.handlers.cash();await f.settle();const id=f.state.requests[0].requestId;f.handlers.cash();await f.settle();assert.equal(f.state.requests.length,2);assert.notEqual(f.state.requests[1].requestId,id);assert.equal(f.state.resets,8);
});
await check('family and school cannot change in synchronous gap before React pending render',async()=>{
  const f=fixture();f.respond({status:200,body:p=>receipt(p.requestId)});f.handlers.cash();f.handlers.changeCenter('other-school');f.handlers.changeFamily('other-family');await f.settle();assert.equal(f.state.requests.length,1);assert.equal(f.state.requests[0].familyId,family.id);assert.equal(f.state.resets,4);
  assert.match(ui,/if \(offlinePaymentOperationInFlight.current \|\| isPending \|\| mode === effectiveFamilyListMode/);
});


await check('review acknowledgment cannot clear the marker while a retry is in flight',async()=>{
  const f=fixture();const id=f.handlers.getId(family.id);f.respond({status:200,body:{ok:true,found:true,receipt:receipt(id)}});f.handlers.recover();await f.settle();assert.ok(f.state.review);f.confirm(true);f.respond({status:200,body:p=>receipt(p.requestId)});f.handlers.cash();f.handlers.acknowledge();assert.equal(f.handlers.getId(family.id),id);await f.settle();assert.equal(f.state.resets,4);assert.equal(f.state.errors.filter(Boolean).length,0);
});
await check('receipt lookup cannot run concurrently with an offline POST',async()=>{
  const f=fixture();f.respond({status:200,body:p=>receipt(p.requestId)});f.handlers.cash();f.handlers.recover();await f.settle();assert.equal(f.state.requests.length,1);assert.equal(f.state.requests[0].mode,'manualCashPayment');assert.equal(f.state.errors.filter(Boolean).length,0);
});
await check('an in-flight receipt lookup blocks cash until its result completes',async()=>{
  const f=fixture();const id=f.handlers.getId(family.id);f.respond({status:200,body:{ok:true,found:true,receipt:receipt(id)}});f.handlers.recover();f.handlers.cash();await f.settle();assert.equal(f.state.requests.length,1);assert.equal(f.state.requests[0].mode,'offlinePaymentReceipt');f.respond({status:200,body:p=>receipt(p.requestId)});f.handlers.cash();await f.settle();assert.equal(f.state.requests.length,2);assert.equal(f.state.requests[1].requestId,id);assert.equal(f.state.resets,4);
});
await check('failed receipt lookup releases operation guard and retains identity for retry',async()=>{
  for(const outcome of [{throws:true},{status:500,body:null},{status:200,malformed:true},{status:200,body:{ok:true,found:false}}]) {
    const f=fixture();const id=f.handlers.getId(family.id);f.respond(outcome);f.handlers.recover();await f.settle();f.respond({status:200,body:p=>receipt(p.requestId)});f.handlers.cash();await f.settle();assert.equal(f.state.requests.length,2);assert.equal(f.state.requests[1].requestId,id);assert.equal(f.state.resets,4);
  }
});

console.log(JSON.stringify({results},null,2));if(results.some(x=>x.status!=='passed'))process.exitCode=1;
