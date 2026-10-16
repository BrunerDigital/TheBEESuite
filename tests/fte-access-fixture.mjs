import {NextRequest} from "next/server";
export const fakeRoles=['PLATFORM_OWNER','BRAND_ADMIN','REGIONAL_MANAGER','CENTER_DIRECTOR','ASSISTANT_DIRECTOR','TEACHER','BILLING_ADMIN','PARENT_GUARDIAN','AUTHORIZED_PICKUP','READ_ONLY_AUDITOR'];
export function fixture(overrides={}) {
  const state={
    phase:'import',cookie:null,responseCookies:[],dbCalls:[],provider:[],audit:[],logs:[],writes:[],reviewValid:true,rateAllowed:true,passwordValid:true,
    loginResult:{status:'verified',mfaVerified:true},reports:[],deviceActive:true,
    user:{id:'fake-owner',email:'fake-owner@example.invalid',name:'Fake owner',tenantId:'tenant-a',organizationId:'org-a',role:'CENTER_DIRECTOR',isActive:true,mustResetPassword:false,sessionVersion:4,customFields:{accountType:'school_owner',applicationAccess:{version:1,mode:'fte_only',centerIds:['school-a','school-b']}},tenant:{name:'Fake tenant',slug:'fake'},organization:{name:'Fake org',brand:null},staffProfile:null,accessGrants:['school-a','school-b'].map(centerId=>({tenantId:'tenant-a',scopeType:'CENTER',role:'CENTER_DIRECTOR',centerId,brandId:null,ownerGroupId:null,organizationId:null,isActive:true,startsAt:null,endsAt:null}))},
    centers:['school-a','school-b','school-c'].map(id=>({id,name:id,crmLocationId:id,status:'active',city:'Fake city',state:'FL',postalCode:'00000',timezone:'America/New_York',customFields:null,licensedCapacity:10,ownerGroup:null,organization:{id:'org-a',name:'Fake org',tenantId:'tenant-a',tenant:{name:'Fake tenant',slug:'fake'},brand:null}})),
    ...overrides,
  };
  const record=(name,args)=>state.dbCalls.push({name,args});
  const userMatch=(where={})=>(where.isActive===undefined||where.isActive===state.user.isActive)&&(!where.id||where.id===state.user.id)&&(!where.email||where.email===state.user.email)&&(!where.tenantId||where.tenantId===state.user.tenantId)&&(!('sessionVersion'in where)||where.sessionVersion===state.user.sessionVersion);
  const centers=(where={})=>state.centers.filter(c=>(!where.id||typeof where.id==='string'?(!where.id||where.id===c.id):!where.id.in||where.id.in.includes(c.id))&&(!where.organization?.tenantId||c.organization.tenantId===where.organization.tenantId)&&(!where.status?.in||where.status.in.includes(c.status))&&(!where.status?.not||c.status!==where.status.not));
  const db={
    user:{findFirst:async(args)=>{record('user.findFirst',args);return userMatch(args.where)?structuredClone(state.user):null},findUnique:async(args)=>{record('user.findUnique',args);return userMatch(args.where)?structuredClone(state.user):null},findMany:async(args)=>{record('user.findMany',args);return []},update:async(args)=>{record('user.update',args);if(!userMatch(args.where))throw Error('wrong user');state.writes.push(args);state.user.mustResetPassword=args.data.mustResetPassword??state.user.mustResetPassword;state.user.sessionVersion+=args.data.sessionVersion?.increment||0;return structuredClone(state.user)},updateMany:async(args)=>{record('user.updateMany',args);if(!userMatch(args.where))return {count:0};state.writes.push(args);state.user.sessionVersion+=args.data.sessionVersion?.increment||0;return {count:1}}},
    center:{findMany:async(args)=>{record('center.findMany',args);return structuredClone(centers(args.where))},findUnique:async(args)=>{record('center.findUnique',args);return structuredClone(state.centers.find(c=>c.id===args.where.id)||null)}},
    deviceSession:{findFirst:async(args)=>{record('deviceSession.findFirst',args);return state.deviceActive?{id:'fake-device',revokedAt:null,lastSeenAt:new Date()}:null},create:async(args)=>{record('deviceSession.create',args);state.writes.push(args);return {id:'fake-device',label:'Fake device'}},updateMany:async(args)=>{record('deviceSession.updateMany',args);return {count:1}}},
    auditLog:{create:async(args)=>{state.audit.push(args);return {id:'fake-audit'}}},
    fteReport:{findMany:async(args)=>{record('fteReport.findMany',args);return structuredClone(state.reports.filter(r=>typeof args.where.centerId==='string'?r.centerId===args.where.centerId:args.where.centerId.in.includes(r.centerId)))},findUnique:async(args)=>{record('fteReport.findUnique',args);return structuredClone(args.where.id?state.reports.find(r=>r.id===args.where.id)||null:state.reports.find(r=>r.centerId===args.where.centerId_weekStart.centerId&&r.weekStart.toISOString()===args.where.centerId_weekStart.weekStart.toISOString())||null)},create:async(args)=>{record('fteReport.create',args);const r={...args.data,id:'fake-report',center:state.centers.find(c=>c.id===args.data.centerId),submittedBy:{email:state.user.email},updatedAt:new Date()};state.reports.push(r);state.writes.push(args);return r},update:async(args)=>{record('fteReport.update',args);const r={...state.reports.find(r=>r.id===args.where.id),...args.data,updatedAt:new Date()};state.writes.push(args);return r}},
    clientErrorReport:{upsert:async(args)=>{record("clientErrorReport.upsert",args);state.writes.push(args);return {id:"fake-error"}}},
    notification:{createMany:async()=>{throw Error('Unexpected notification')}},webPushDelivery:{updateMany:async()=>({count:0})},webPushSubscription:{updateMany:async()=>({count:0})},
  };
  db.$transaction=async(value)=>typeof value==='function'?value(db):Promise.all(value);
  state.db=new Proxy(db,{get(t,k){if(k in t)return t[k];throw Error('Unexpected database model '+String(k))}});
  globalThis.fteFixture=state;
  return state;
}
export function signIn(auth,state,selection='center:school-a',extra={}) {
  state.cookie=auth.createSessionToken({id:state.user.id,email:state.user.email,role:state.user.role,sessionVersion:state.user.sessionVersion,workspaceSelection:selection,mfaVerified:true,...extra});
}
export function request(path,body,method=body?'POST':'GET') {return new NextRequest('https://fixture.invalid'+path,{method,headers:{'content-type':'application/json',origin:'https://fixture.invalid'},...(body?{body:JSON.stringify(body)}:{})});}
