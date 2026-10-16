import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {fixture,signIn,request,fakeRoles} from './fte-access-fixture.mjs';
import * as auth from '../src/lib/auth.ts';
import * as policy from '../src/lib/application-access.ts';
import * as rbac from '../src/lib/rbac.ts';
import * as fte from '../src/app/api/fte-reports/route.ts';
import * as workspace from '../src/app/api/workspace/selection/route.ts';
import * as login from '../src/app/api/auth/login/route.ts';
import * as password from '../src/app/api/profile/password/route.ts';
import * as forced from '../src/app/api/auth/force-password-reset/route.ts';
import * as mfa from '../src/app/api/profile/mfa/route.ts';
import * as devices from '../src/app/api/device-sessions/route.ts';
import * as logout from '../src/app/api/auth/logout/route.ts';
const purposes=['fte_reporting','workspace_selection','account_security'];
function setup(selection='center:school-a',extra={}) { const f=fixture();signIn(auth,f,selection,extra); f.phase='request';return f; }
const getUser=(accessPurpose='fte_reporting',extra={})=>auth.getCurrentUser({accessPurpose,...extra});
const cleanSideEffects=f=>{assert.equal(f.writes.length,0);assert.equal(f.provider.length,0);assert.equal(f.audit.length,0);};
const form={weekStart:'2026-10-12',weekEnd:'2026-10-18',centerId:'school-a',enrolledCount:0,status:'submitted'};
const pw={currentPassword:'synthetic-old',password:'synthetic-new',confirmPassword:'synthetic-new'};
const slugs=['dashboard','owner','fte-reports','billing','families','children','staff','messages','crm','reports','settings','executive','permissions','classroom','unknown','fte-reports/../billing','FTE-REPORTS'];

test('strict policy: absence preserves legacy, presence is fail-closed',()=>{
 for(const fields of [null,undefined,{}, {accountType:'school_owner'}]) assert.deepEqual(policy.readApplicationAccess(fields,'CENTER_DIRECTOR'),{mode:'unrestricted'});
 const valid={version:1,mode:'fte_only',centerIds:['a','b']};
 assert.deepEqual(policy.readApplicationAccess({applicationAccess:valid},'CENTER_DIRECTOR'),{mode:'fte_only',centerIds:['a','b']});
 for(const bad of [null,false,[],{},'fte_only',{...valid,version:2},{...valid,mode:'all'},{...valid,centerIds:[]},{...valid,centerIds:['a','a']},{...valid,centerIds:['a b']},{...valid,centerIds:[1]},{...valid,centerIds:['x'.repeat(201)]},{...valid,centerIds:Array.from({length:101},(_,i)=>'c'+i)},{...valid,extra:true}]) assert.equal(policy.readApplicationAccess({applicationAccess:bad},'CENTER_DIRECTOR').mode,'blocked');
 for(const role of fakeRoles.filter(r=>r!=='CENTER_DIRECTOR')) assert.equal(policy.readApplicationAccess({applicationAccess:valid},role).mode,'blocked');
 for(const purpose of [undefined,'billing','FTE_REPORTING',{},'fte_reporting/../billing']) assert.equal(policy.applicationAccessPurposeAllowed({mode:'fte_only',centerIds:['a']},purpose),false);
});

test('strict grants reject wrong tenant, broad scope, role, inactive, malformed and out-of-window',()=>{
 const f=fixture(),access=policy.readApplicationAccess(f.user.customFields,f.user.role),now=new Date('2026-10-14T12:00:00Z');
 for(const patch of [{tenantId:'other'},{scopeType:'TENANT'},{role:'PLATFORM_OWNER'},{isActive:false},{isActive:undefined},{brandId:'brand'},{organizationId:'org'},{ownerGroupId:'owner'},{startsAt:new Date('2026-10-15')},{endsAt:new Date('2026-10-13')},{startsAt:new Date('invalid')},{endsAt:'2027-01-01'}]) assert.deepEqual(policy.restrictedFteCenterIds(access,'tenant-a',[{...f.user.accessGrants[0],...patch}],now),[]);
 assert.deepEqual(policy.restrictedFteCenterIds(access,'tenant-a',f.user.accessGrants,now),['school-a','school-b']);
 assert.deepEqual(policy.restrictedFteCenterIds(access,'tenant-a',f.user.accessGrants,new Date('invalid')),[]);
});

test('default deny applies before protected queries, including reset/MFA flags and spoofed token role',async()=>{
 const f=setup('all',{role:'PLATFORM_OWNER'});
 for(const options of [{},{allowPasswordResetRequired:true},{allowMfaEnrollment:true},{accessPurpose:'billing'}]) assert.equal(await auth.getCurrentUser(options),null);
 assert.ok(f.dbCalls.every(c=>c.name==='user.findFirst'));cleanSideEffects(f);
 for(const purpose of purposes){const user=await getUser(purpose);assert.equal(user.role,'CENTER_DIRECTOR');assert.equal(user.applicationAccess,'fte_only');assert.equal(user.workspace.canSelectAll,false);assert.ok(!user.centerIds.includes('school-c'));}
});

test('allowed surfaces intersect marker, exact grants, current centers and tenant, ignoring staff/broad grants',async()=>{
 const f=setup();f.user.staffProfile={centerId:'school-c',classroomId:'other-class'};
 f.user.accessGrants.push({...f.user.accessGrants[0],scopeType:'TENANT',centerId:null},{...f.user.accessGrants[0],centerId:'school-c'});
 let u=await getUser();assert.deepEqual(u.authorizedCenterIds,['school-a','school-b']);assert.deepEqual(u.centerIds,['school-a']);
 f.centers[1].organization.tenantId='other';u=await getUser();assert.deepEqual(u.authorizedCenterIds,['school-a']);
 f.centers[0].status='closed';assert.equal(await getUser(),null);assert.ok(await getUser('account_security'));
});

test('inactive, stale, revoked, invalid review, password-reset and MFA gates preserved',async()=>{
 for(const mutate of [f=>f.user.isActive=false,f=>f.user.sessionVersion++,f=>f.reviewValid=false,f=>f.user.mustResetPassword=true]){const f=setup();mutate(f);assert.equal(await getUser(),null);cleanSideEffects(f);}
 let f=setup('center:school-a',{deviceSessionId:'fake-device'});f.deviceActive=false;assert.equal(await getUser(),null);
 f=setup();f.user.mustResetPassword=true;assert.ok(await getUser('account_security',{allowPasswordResetRequired:true}));
 const prior=process.env.BEE_MFA_REQUIRED_ROLES;process.env.BEE_MFA_REQUIRED_ROLES='CENTER_DIRECTOR';
 try{f=setup('center:school-a',{mfaVerified:false});assert.equal(await getUser(),null);assert.ok(await getUser('account_security',{allowMfaEnrollment:true}));}finally{if(prior===undefined)delete process.env.BEE_MFA_REQUIRED_ROLES;else process.env.BEE_MFA_REQUIRED_ROLES=prior;}
});

test('restriction is reread on every request and request/token metadata cannot remove it',async()=>{
 const f=setup();assert.ok(await getUser());f.user.customFields.applicationAccess=null;assert.equal(await getUser(),null);assert.equal(await getUser('account_security'),null);
});

test('existing users retain baseline resolver/permissions across all roles and workspace selections',async()=>{
 for(const role of fakeRoles)for(const selection of ['center:school-a','all',undefined]){
  const f=fixture();f.user.role=role;delete f.user.customFields.applicationAccess;signIn(auth,f,selection);f.phase='request';
  const baseline=JSON.parse(readFileSync(new URL('./fte-legacy-behavior.json',import.meta.url))).results.find(r=>r.role===role&&r.selection===(selection??null));const previous=baseline.user;const current=await auth.getCurrentUser();assert.deepEqual(current,previous,role+':'+selection);
  if(!current)continue;
  for(const name of ['canAccessAllCenters','canAdministerAllCenters','canManageCrmLeads','canViewCrmLeads','canManageOperations','canManageStaffCompensation','canManageClassroomTasks','canManageBilling'])assert.equal(auth[name](current),baseline.permissions[name],role+name);
  for(const slug of slugs)assert.equal(rbac.canAccessModule(current,slug),baseline.modules[slug],role+slug);
 }
});

test('restricted role has only FTE module and no broad administrative helpers',async()=>{
 setup();const u=await getUser();
 for(const slug of slugs)assert.equal(rbac.canAccessModule(u,slug),slug==='fte-reports',slug);
 for(const name of ['canAccessAllCenters','canAdministerAllCenters','canManageCrmLeads','canViewCrmLeads','canManageOperations','canManageStaffCompensation','canManageClassroomTasks','canManageBilling'])assert.equal(auth[name](u),false,name);
 assert.equal(auth.canAdministerCenter(u,'school-a'),false);assert.equal(auth.canManageChildInClassroom(u,'school-a'),false);assert.equal(auth.canManageFteReporting(u),true);
});

for(const center of ['school-a','school-b'])test('FTE selected school read/write works: '+center,async()=>{
 const f=setup('center:'+center);let res=await fte.GET(request('/api/fte-reports?centerId='+center));assert.equal(res.status,200);assert.deepEqual((await res.json()).reports,[]);
 res=await fte.POST(request('/api/fte-reports',{...form,centerId:center,status:'approved',userId:'other',tenantId:'other',applicationAccess:null}));assert.equal(res.status,200);assert.equal(f.reports[0].centerId,center);assert.equal(f.reports[0].submittedById,f.user.id);assert.equal(f.reports[0].status,'submitted');assert.equal(f.user.customFields.applicationAccess.mode,'fte_only');
});
for(const center of ['school-b','school-c'])test('FTE other selected-school or unauthorized-center reads/writes are denied: '+center,async()=>{
 const f=setup();assert.equal((await fte.GET(request('/api/fte-reports?centerId='+center))).status,403);assert.equal((await fte.POST(request('/api/fte-reports',{...form,centerId:center}))).status,403);cleanSideEffects(f);
});

test('FTE id substitution, report moves and approved report correction are denied',async()=>{
 for(const report of [{id:'foreign',centerId:'school-c',status:'submitted'},{id:'approved',centerId:'school-a',status:'approved'}]){
 const f=setup();f.reports.push(report);const response=await fte.POST(request('/api/fte-reports',{...form,id:report.id}));assert.equal(response.status,403);cleanSideEffects(f);}
});

test('workspace denies all/third/invalid selection; valid choices force FTE destination',async()=>{
 for(const selection of ['all','center:school-c','closed','https://bad.invalid']){const f=setup();const res=await workspace.POST(request('/api/workspace/selection',{selection,nextPath:'/billing'}));assert.ok([400,403].includes(res.status));assert.equal(f.responseCookies.length,0);cleanSideEffects(f);}
 for(const center of ['school-a','school-b']){const f=setup();const res=await workspace.POST(request('/api/workspace/selection',{selection:'center:'+center,nextPath:'//bad.invalid'}));assert.equal(res.status,200);assert.equal((await res.json()).nextPath,'/fte-reports');assert.equal(auth.verifySessionToken(f.responseCookies[0][1]).workspaceSelection,'center:'+center);}
 const f=setup();f.user.accessGrants[1].isActive=false;assert.equal((await workspace.POST(request('/api/workspace/selection',{selection:'center:school-b'}))).status,403);
});

test('login fixes restricted return path despite portal/open redirect inputs',async()=>{
 for(const next of [undefined,'/billing','/owner','https://bad.invalid','//bad.invalid','/%2f%2fbad.invalid','/account/security','/account/security?next=/billing']){
 const f=fixture();f.phase='request';const res=await login.POST(request('/api/auth/login',{email:f.user.email,password:'synthetic',next,loginPortal:'executive',applicationAccess:'unrestricted'}));assert.equal(res.status,200);assert.equal((await res.json()).nextPath,next==='/account/security'?next:'/fte-reports');assert.equal(f.user.customFields.applicationAccess.mode,'fte_only');}
});

test('login still denies inactive/malformed policy/provider failure and honors MFA/rate limit',async()=>{
 for(const [mutate,status] of [[f=>f.user.isActive=false,403],[f=>f.user.customFields.applicationAccess={},403],[f=>f.loginResult={status:'invalid'},401],[f=>f.loginResult={status:'mfa_required',factors:[]},401],[f=>f.loginResult={status:'unavailable'},503],[f=>f.rateAllowed=false,429]]){const f=fixture();mutate(f);const res=await login.POST(request('/api/auth/login',{email:f.user.email,password:'synthetic'}));assert.equal(res.status,status);assert.equal(f.responseCookies.length,0);assert.equal(f.writes.length,0);}
});

test('password route checks current password/rate and binds identity; rotation preserves restriction',async()=>{
 let f=setup();f.passwordValid=false;assert.equal((await password.POST(request('/api/profile/password',pw))).status,401);assert.equal(f.writes.length,0);
 f=setup();f.rateAllowed=false;assert.equal((await password.POST(request('/api/profile/password',pw))).status,429);cleanSideEffects(f);
 f=setup();const marker=structuredClone(f.user.customFields);const old=f.cookie;const res=await password.POST(request('/api/profile/password',{...pw,email:'other@example.invalid',userId:'other',customFields:{}}));assert.equal(res.status,200);assert.deepEqual(f.user.customFields,marker);assert.equal(f.user.sessionVersion,5);assert.ok(f.provider.every(p=>p[1]===f.user.email));assert.equal(await getUser(),null);f.cookie=f.responseCookies.at(-1)[1];assert.ok(await getUser());assert.equal(await auth.getCurrentUser(),null);assert.notEqual(f.cookie,old);
});

test('forced reset requires existing reset flag/current password and fixes return path',async()=>{
 let f=setup();assert.equal((await forced.POST(request('/api/auth/force-password-reset',pw))).status,400);cleanSideEffects(f);
 f=setup();f.user.mustResetPassword=true;f.passwordValid=false;assert.equal((await forced.POST(request('/api/auth/force-password-reset',pw))).status,401);assert.equal(f.writes.length,0);
 f=setup();f.user.mustResetPassword=true;const marker=structuredClone(f.user.customFields);const res=await forced.POST(request('/api/auth/force-password-reset',{...pw,next:'/billing',email:'other'}));assert.equal(res.status,200);assert.equal((await res.json()).nextPath,'/fte-reports');assert.equal(f.user.mustResetPassword,false);assert.deepEqual(f.user.customFields,marker);assert.equal(f.user.sessionVersion,5);
});

test('MFA rejects cross-origin/missing auth/rate; binds own identity and invalidates sessions',async()=>{
 let f=setup();let req=new Request('https://fixture.invalid/api/profile/mfa',{method:'POST',headers:{'content-type':'application/json',origin:'https://other.invalid'},body:JSON.stringify({action:'list',password:'synthetic'})});assert.equal((await mfa.POST(req)).status,403);cleanSideEffects(f);
 for(const action of ['list','enroll','confirm','remove']){f=setup();const marker=structuredClone(f.user.customFields);const res=await mfa.POST(request('/api/profile/mfa',{action,password:'synthetic',email:'other@example.invalid',userId:'other',applicationAccess:null}));assert.equal(res.status,200);assert.equal(f.provider[0][1],f.user.email);assert.deepEqual(f.user.customFields,marker);assert.equal(f.user.sessionVersion,action==='list'?4:5);if(action!=='list'){assert.equal(f.responseCookies.at(-1)[1],'');assert.equal(await getUser(),null);}}
 f=setup();f.rateAllowed=false;assert.equal((await mfa.POST(request('/api/profile/mfa',{action:'list',password:'synthetic'}))).status,429);cleanSideEffects(f);
});

test('device heartbeat allowed, team revocation denied, own logout scoped',async()=>{
 let f=setup('center:school-a',{deviceSessionId:'fake-device'});assert.equal((await devices.POST(request('/api/device-sessions',{action:'heartbeat'}))).status,200);assert.equal((await devices.POST(request('/api/device-sessions',{action:'revoke',sessionId:'another-device'}))).status,403);assert.equal(f.writes.length,0);
 assert.equal((await logout.POST()).status,200);const call=f.dbCalls.find(c=>c.name==='deviceSession.updateMany');assert.equal(call.args.where.id,'fake-device');assert.equal(call.args.where.userId,f.user.id);assert.equal(f.responseCookies.at(-1)[1],'');
});

test('login rejects security-version race without issuing session',async()=>{
 const f=fixture();f.onLogin=()=>f.user.sessionVersion++;const res=await login.POST(request('/api/auth/login',{email:f.user.email,password:'synthetic'}));assert.equal(res.status,409);assert.equal(f.responseCookies.length,0);assert.equal(f.writes.length,0);
});

test('security provider failure causes no application password state change',async()=>{
 for(const route of [password,forced]){const f=setup();if(route===forced)f.user.mustResetPassword=true;f.passwordResult={ok:false,error:'Synthetic failure'};const before=structuredClone(f.user);const res=await route.POST(request('/api/test',pw));assert.equal(res.status,400);assert.deepEqual(f.user,before);assert.equal(f.responseCookies.length,0);assert.equal(f.writes.length,0);}
});

test('malformed restriction denies every explicitly opted-in handler',async()=>{
 for(const [route,body] of [[fte,form],[workspace,{selection:'center:school-a'}],[password,pw],[forced,pw],[mfa,{action:'list',password:'synthetic'}],[devices,{action:'heartbeat'}]]){const f=setup();f.user.customFields.applicationAccess={version:2,mode:'fte_only',centerIds:['school-a']};assert.equal((await route.POST(request('/api/test',body))).status,401);cleanSideEffects(f);}
});

test('removing exact school grant invalidates an existing session for FTE even if marker remains',async()=>{
 const f=setup();f.user.accessGrants=[];assert.equal((await fte.GET(request('/api/fte-reports'))).status,401);assert.equal((await fte.POST(request('/api/fte-reports',form))).status,401);assert.equal((await workspace.POST(request('/api/workspace/selection',{selection:'center:school-a'}))).status,401);cleanSideEffects(f);assert.ok(await getUser('account_security'));
});

test('public optional-auth telemetry never treats restricted session as a broad actor',async()=>{
 const f=fixture();f.phase='import';const source=new URL('../src/app/api/system/client-error-reports/route.ts',import.meta.url);const telemetry=await import(existsSync(source)?source:new URL('../../reference/src/app/api/system/client-error-reports/route.ts',import.meta.url));signIn(auth,f);f.phase='request';
 const res=await telemetry.POST(request('/api/system/client-error-reports',{message:'synthetic',path:'/fte-reports',userId:'other',tenantId:'other'}));assert.equal(res.status,200);
 const stored=f.dbCalls.find(c=>c.name==='clientErrorReport.upsert');assert.ok(stored);for(const branch of ['update','create']){assert.equal(stored.args[branch].userId,null);assert.equal(stored.args[branch].tenantId,null);assert.equal(stored.args[branch].centerId,null);}
 assert.ok(f.dbCalls.every(c=>['user.findFirst','clientErrorReport.upsert'].includes(c.name)));assert.equal(f.provider.length,0);
});

test('own-password UI submit helper validates locally and posts only credential fields to fixed endpoint once',async()=>{
 const {submitAccountPasswordChange}=await import('../src/lib/account-password-change.ts');let calls=[];const send=async(url,init)=>{calls.push({url,init});return Response.json({ok:true,nextPath:'https://bad.invalid'})};
 for(const invalid of [{...pw,currentPassword:''},{...pw,password:'short',confirmPassword:'short'},{...pw,confirmPassword:'different'},{...pw,password:pw.currentPassword,confirmPassword:pw.currentPassword}])assert.equal((await submitAccountPasswordChange(invalid,send)).ok,false);assert.equal(calls.length,0);
 assert.deepEqual(await submitAccountPasswordChange({...pw,email:'other',applicationAccess:null},send),{ok:true});assert.equal(calls.length,1);assert.equal(calls[0].url,'/api/profile/password');assert.deepEqual(JSON.parse(calls[0].init.body),pw);assert.equal(calls[0].init.credentials,'same-origin');
 let failures=0;assert.equal((await submitAccountPasswordChange(pw,async()=>{failures++;throw Error('synthetic')})).ok,false);assert.equal(failures,1);
 assert.equal((await submitAccountPasswordChange(pw,async()=>Response.json({ok:true},{status:403}))).ok,false);
});
