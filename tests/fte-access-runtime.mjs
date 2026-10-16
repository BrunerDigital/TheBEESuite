import { registerHooks } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';

// Isolated synthetic process state; no production credentials/configuration are loaded.
process.env.AUTH_SECRET='synthetic-fte-tests-only';
process.env.NODE_ENV='test';
process.env.BEE_MFA_REQUIRED_ROLES='';
for(const key of ['FTE_GOOGLE_SHEETS_SPREADSHEET_ID','FTE_GOOGLE_SHEETS_SPREADSHEET_URL','KIDCITY_FTE_SPREADSHEET_ID','KIDCITY_FTE_SPREADSHEET_URL','FTE_GOOGLE_SHEETS_WEBHOOK_URL','CLIENT_ERROR_REPORTING']) delete process.env[key];

const root = new URL('../', import.meta.url);
const roles = ['PLATFORM_OWNER','BRAND_ADMIN','REGIONAL_MANAGER','CENTER_DIRECTOR','ASSISTANT_DIRECTOR','TEACHER','BILLING_ADMIN','PARENT_GUARDIAN','AUTHORIZED_PICKUP','READ_ONLY_AUDITOR'];
const actual = new Set(['@/lib/auth','@/lib/application-access','@/lib/workspace-selection','@/lib/mfa-policy','@/lib/rbac','@/lib/login-routing','@/lib/fte-report-guardrails','@/lib/fte-report-selection','@/lib/device-sessions','@/lib/feature-availability']);
const mocks = {
  '@/lib/telemetry-privacy': 'export const isCredentialDiagnosticPath=()=>false;',
  '@/lib/client-error-reporting': 'export const normalizeClientErrorReportPayload=()=>({source:"browser",errorType:"error",severity:"error",message:"synthetic",path:"/fte-reports",metadata:{}});export const clientErrorFingerprintParts=()=>["synthetic"];',

  '@/lib/integration-setup': 'export const normalizeIntegrationProvider=()=>"google_ads";export const isMarketingIntegrationProvider=()=>true;',
  '@/lib/corporate-stripe-verification': 'export const readCorporateStripeVerificationTarget=()=>null;',

  '@/lib/request-origin': 'export const hasTrustedMutationOrigin=request=>request.headers.get("origin")===new URL(request.url).origin;',
  '@/lib/payment-redirect-security': 'export const getSecurePaymentAppBaseUrl=url=>new URL(url).origin;',
  '@/lib/integration-oauth': 'export const normalizeIntegrationProvider=()=>"google_ads";export const isMarketingIntegrationProvider=()=>true;',
  '@/lib/integration-providers': 'export const normalizeIntegrationProvider=()=>"google_ads";export const isMarketingIntegrationProvider=()=>true;',

  'next/headers': 'export const cookies=async()=>({get:(key)=>key==="bee_suite_session"&&globalThis.fteFixture.cookie?{value:globalThis.fteFixture.cookie}:undefined});',
  'next/navigation': 'export const redirect=(path)=>{throw new Error(`REDIRECT:${path}`)};',
  'next/server': `export class NextRequest extends Request {get nextUrl(){return new URL(this.url)}} export class NextResponse extends Response { constructor(...args){super(...args);this.cookies={set:(...a)=>globalThis.fteFixture.responseCookies.push(a),delete:(...a)=>globalThis.fteFixture.responseCookies.push(['delete',...a])}} static redirect(url,status=307){return new NextResponse(null,{status,headers:{location:String(url)}})} static json(body,init){return new NextResponse(JSON.stringify(body),{...init,headers:{'content-type':'application/json',...init?.headers}})} }`,
  '@prisma/client': `export const UserRole=Object.fromEntries(${JSON.stringify(roles)}.map(r=>[r,r]));export const Prisma={TransactionIsolationLevel:{RepeatableRead:"RepeatableRead"}};export const PaymentStatus={};export const EnrollmentStage={};export const DocumentStatus={};`,
  '@/lib/prisma': 'export const prisma=new Proxy({}, {get:(_,k)=>globalThis.fteFixture.db[k]});',
  '@/lib/school-owner-access': 'export const isSchoolOwnerAccount=(role,fields)=>role==="CENTER_DIRECTOR"&&fields?.accountType==="school_owner";',
  '@/lib/brand-assets': 'export const resolveWorkspaceBranding=()=>({name:"Synthetic brand",kind:"synthetic"});',
  '@/lib/app-review-runtime': 'export const appReviewRuntimeScopeIsValid=async()=>globalThis.fteFixture.reviewValid;',
  '@/lib/demo-accounts': 'export const isDemoAccountEmail=()=>false;export const resolveLoginIdentifier=x=>x;',
  '@/lib/profile-photo': 'export const defaultProfilePhotoUrlForRole=()=>null;export const readProfilePhotoStorageKey=()=>null;export const readProfilePhotoUrl=()=>null;',
  '@/lib/supabase-storage': 'export const isSupabaseStorageConfigured=()=>false;export const createProfilePhotoSignedUrl=async()=>null;',
  '@/lib/workspace-scope': 'export const workspaceScopeContext=()=>({});',
  '@/lib/attendance-state': 'export const readCenterLocationTimeZone=()=>"America/New_York";',
  '@/lib/request-response-logging': 'export const withApiLogging=(_,handler)=>handler;export const logOperationalError=(...a)=>globalThis.fteFixture.logs.push(a);',
  '@/lib/rate-limit': 'export const checkPersistentRateLimit=async()=>({ok:globalThis.fteFixture.rateAllowed,resetAt:Date.now()+60000});export const requestIp=()=>"synthetic";export const retryAfterSeconds=()=>60;',
  '@/lib/app-review-targeting': 'export const appReviewReservedIdentityKind=()=>null;',
  '@/lib/supabase-auth': 'export const verifySupabaseLogin=async(input)=>{globalThis.fteFixture.provider.push(["login",input.email]);globalThis.fteFixture.onLogin?.();return globalThis.fteFixture.loginResult};export const verifySupabasePassword=async(email)=>{globalThis.fteFixture.provider.push(["verifyPassword",email]);return globalThis.fteFixture.passwordValid};export const updateSupabaseAuthUserPasswordByEmail=async(input)=>{globalThis.fteFixture.provider.push(["updatePassword",input.email]);return globalThis.fteFixture.passwordResult??{ok:true}};export const getSupabaseAuthConfig=()=>({url:"https://synthetic.invalid",key:"not-a-real-key"});',
  '@/lib/audit': 'export const writeAuditLog=async(user,event)=>{globalThis.fteFixture.audit.push({userId:user.id,event})};',
  '@supabase/supabase-js': 'export const createClient=()=>({synthetic:true});',
  '@/lib/mfa-management': 'export const manageMfa=async(client,input,onChange)=>{globalThis.fteFixture.provider.push(["mfa",input.email,input.action]);if(input.action!=="list")await onChange();return {ok:true,factors:[],signInRequired:input.action!=="list"}};',
  '@/lib/google-sheets': 'export const appendRowToGoogleSheet=async()=>{throw new Error("Unexpected sheet write")};export const spreadsheetIdFromUrl=()=>null;',
  '@/lib/integration-credentials': 'export const credentialEnvValue=()=>undefined;export const getTenantIntegrationCredentialMap=async()=>({});',
  '@/lib/google-apps-script-webhook': 'export const postJsonToGoogleAppsScriptWebhook=async()=>{throw new Error("Unexpected webhook")};',
};
let generic={};try{generic=JSON.parse(readFileSync(new URL('./fte-generic-imports.json',import.meta.url),'utf8'))}catch{}
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (!specifier.startsWith('node:') && (Object.hasOwn(mocks,specifier)||(!actual.has(specifier)&&Object.hasOwn(generic,specifier)))) return {url:'fixture:'+specifier,shortCircuit:true};
    if (specifier.startsWith('@/')) specifier=new URL('src/'+specifier.slice(2)+'.ts',root).href;
    if ((specifier.startsWith('.')||specifier.startsWith('file:'))&&!/\.[a-z]+$/i.test(specifier)) {const p=new URL(specifier+'.ts',context.parentURL);if(existsSync(p))specifier=p.href;}
    return nextResolve(specifier,context);
  },
  load(url, context, nextLoad) {
    if(url.startsWith('fixture:')) {
      const key=url.slice(8);let source=mocks[key];
      if(!source){const names=generic[key];source='const fallback=globalThis.fteGeneric;'+names.map(n=>n==='default'?'export default fallback;':`export const ${n}=fallback;`).join('');}
      const declared=new Set([...source.matchAll(/export\s+(?:async\s+)?(?:const|function|class)\s+(\w+)/g)].map(m=>m[1])); for(const n of generic[key]||[]) {if(n==='default'){if(!source.includes('export default'))source+='export default globalThis.fteGeneric;';} else if(!declared.has(n))source+=`export const ${n}=globalThis.fteGeneric;`;}
      return {format:'module',source,shortCircuit:true};
    }
    return nextLoad(url,context);
  },
});
globalThis.fetch=()=>{throw new Error('Network is forbidden in offline FTE tests')};
let fallback;
fallback=new Proxy(function(){},{apply(){if(globalThis.fteFixture?.phase==='request')throw new Error('Unexpected non-auth dependency call');return fallback;},construct(){return fallback},get(_t,k){if(k==='then')return undefined;if(k===Symbol.iterator)return function*(){};if(k===Symbol.toPrimitive)return()=>0;return fallback;}});
globalThis.fteGeneric=fallback;
