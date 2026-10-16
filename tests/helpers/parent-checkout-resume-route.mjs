import { registerHooks } from 'node:module';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
const state = globalThis.__resumeRouteTest = {};
const modules = {
 'next/server': 'export const NextResponse = {json: (b, o) => Response.json(b,o)};',
 '@prisma/client': 'export const PaymentStatus=Object.fromEntries(["DRAFT","PAID","FAILED","VOID","REFUNDED"].map(x=>[x,x])); export const Prisma={TransactionIsolationLevel:{RepeatableRead:"RepeatableRead"}};',
 '@/lib/auth': 'export const getCurrentUser=async()=>s.user; export const isParentGuardian=u=>u.role==="PARENT_GUARDIAN";',
 '@/lib/app-review-targeting': 'export const appReviewReservedIdentityKind=()=>s.demo;',
 '@/lib/parent-portal-family-scope': 'export const getParentPortalPaymentFamilyScope=async()=>({ok:s.allowed,familyId:"family_test"});',
 '@/lib/family-payment-preflight': 'export const readAuthorizedFamilyPaymentTarget=async()=>s.allowed?s.target:null;',
 '@/lib/family-payment-snapshot': 'export const readFamilyPaymentSnapshot=async()=>{s.reads++;return s.snapshot;};',
 '@/lib/prisma': 'export const prisma={$transaction: async fn=>fn({})};',
 '@/lib/request-origin': 'export const hasTrustedMutationOrigin=()=>s.origin;',
 '@/lib/stripe-customer-scope': 'export const stripeCustomerIdForAccount=()=>"cus_synthetic123";',
 '@/lib/payment-method-management': 'export const paymentMethodManagementSummary=()=>({paymentMethodReauthorizationRequired:s.reauth});',
 '@/lib/stripe-billing-approval': 'export const stripeSchoolBillingApproval=()=>({approved:s.approved});',
 '@/lib/stripe-school-readiness-flow': 'export const stripeSchoolReadinessFlowFromFields=()=>({canAcceptParentPayments:s.ready});',
 '@/lib/stripe-connect-readiness': 'export const stripeConnectReadinessFromSnapshot=()=>({canAcceptParentPayments:s.providerReady});',
 '@/lib/payment-disclosures': 'export const PAYMENT_PROCESSING_RECOVERY_VERSION="v1";',
 '@/lib/request-response-logging': 'export const withApiLogging=(_m,h,opts)=>{if(!opts.omitRequestBody||!opts.omitResponseBody)throw Error("receipt logging");return h;};',
 '@/lib/integrations': `export const readStripeConnectedAccountId=()=>"acct_test";
 export const getStripeWebhookSecret=async()=>s.webhook;
 export const retrieveStripeConnectedAccount=async()=>{s.accountReads++;return {ok:true,account:{}}};
 export const stripeConnectedAccountPaysFeesDirectly=()=>false;
 export const shouldWaiveStripePaymentOperationsFee=()=>true;
 export const getStripeCheckoutAmounts=()=>({checkoutTotalCents:1000,parentSurchargeAmountCents:0,applicationFeeAmountCents:0});
 export const retrieveStripeCheckoutSession=async()=>{s.providerReads++;if(s.providerError)throw Error("unavailable");return {ok:true,session:s.session}};`,
};
const root=new URL('../../',import.meta.url);
registerHooks({resolve(specifier,context,next){
 if(modules[specifier])return {shortCircuit:true,url:'data:text/javascript,'+encodeURIComponent('const s=globalThis.__resumeRouteTest;'+modules[specifier])};
 if(specifier.startsWith('@/'))specifier=new URL('src/'+specifier.slice(2),root).href;
 if(specifier.startsWith('.')||specifier.startsWith('file:')){const url=new URL(specifier,context.parentURL);if(existsSync(fileURLToPath(url)+'.ts'))return next(pathToFileURL(fileURLToPath(url)+'.ts').href,context);}
 return next(specifier,context);
}});
globalThis.fetch=async()=>{throw Error('network forbidden');};
const {POST}=await import('../../src/app/api/parent/resume-checkout/route.ts');
function reset(){
 Object.assign(state,{user:{id:'parent_test',role:'PARENT_GUARDIAN',email:'parent@example.test',tenantId:'tenant_test'},origin:true,demo:false,allowed:true,reauth:false,approved:true,ready:true,providerReady:true,webhook:'fake',reads:0,providerReads:0,accountReads:0,providerError:false});
 state.target={tenantId:'tenant_test',centerId:'center_test',familyId:'family_test',billingAccountId:'account_test'};
 const metadata={...state.target,paymentScope:'family_balance',paymentId:'payment_test',stripeConnectedAccountId:'acct_test',stripeCustomerId:'cus_synthetic123',invoiceAmountCents:'1000',checkoutTotalCents:'1000',parentSurchargeAmountCents:'0',applicationFeeAmountCents:'0',feeDisclosureVersion:'v1',requestedPaymentMethodCategory:'card',paymentMethodCategory:'card',source:'parent_portal',collectionMode:'parent_card_checkout'};
 state.snapshot={billingAccount:{family:{name:'Synthetic',_count:{children:1}},customFields:{}},center:{name:'School',customFields:{},organization:{tenant:{name:'Test',slug:'test'}}},collectableCents:1000,responsibilityReviewRequired:false,draftStripePayments:[{id:'payment_test',billingAccountId:'account_test',status:'DRAFT',provider:'stripe',amountCents:1000,externalIdPlaceholder:'cs_test',customFields:{...metadata,stripeCustomerConnectedAccountId:'acct_test',status:'checkout_created',stripeCheckoutSessionId:'cs_test'}}]};
 state.session={id:'cs_test',url:'https://checkout.stripe.com/c/pay/cs_test',status:'open',paymentStatus:'unpaid',amountTotalCents:1000,raw:{id:'cs_test',object:'checkout.session',mode:'payment',client_reference_id:'Synthetic family payment',currency:'usd',livemode:false,customer:'cus_synthetic123',amount_total:1000,metadata,status:'open',payment_status:'unpaid',url:'https://checkout.stripe.com/c/pay/cs_test',expires_at:Math.floor(Date.now()/1000)+3600}};
}
const request=(body={familyId:'family_test',requestNonce:'nonce_test'})=>new Request('https://app.test/api/parent/resume-checkout',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
test('actual route returns correlated existing URL, read-only and no-store',async()=>{reset();const r=await POST(request());assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'private, no-store');assert.deepEqual(await r.json(),{ok:true,paymentId:'payment_test',stripeSessionId:'cs_test',url:state.session.url,familyId:'family_test',requestNonce:'nonce_test'});assert.equal(state.reads,2);assert.equal(state.providerReads,1);});
for(const [name,mutate,status] of [
 ['signed out',()=>state.user=null,401],['wrong role',()=>state.user.role='CENTER_DIRECTOR',403],['bad origin',()=>state.origin=false,403],['foreign family',()=>state.allowed=false,409],['demo',()=>state.demo=true,403],['readiness revoked',()=>state.ready=false,409],['saved method reauthorization',()=>state.reauth=true,409],['responsibility hold',()=>state.snapshot.responsibilityReviewRequired=true,409],['webhook unavailable',()=>state.webhook=null,409],['provider readiness unavailable',()=>state.providerReady=false,409],['provider unavailable',()=>state.providerError=true,409],
])test(`actual route blocks ${name}`,async()=>{reset();mutate();const r=await POST(request());assert.equal(r.status,status);assert.equal((await r.json()).url,undefined);});
test('actual route rejects uncorrelated or extra input',async()=>{reset();for(const body of [{familyId:'family_test'},{familyId:'family_test',requestNonce:'nonce',paymentId:'other'},{familyId:'../bad',requestNonce:'nonce'}])assert.equal((await POST(request(body))).status,400);assert.equal(state.providerReads,0);});
