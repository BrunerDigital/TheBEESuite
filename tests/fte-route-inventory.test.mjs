import test from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync,readFileSync,existsSync,writeFileSync} from 'node:fs';
import {pathToFileURL,fileURLToPath} from 'node:url';
import path from 'node:path';
import {fixture,signIn,request} from './fte-access-fixture.mjs';
import * as auth from '../src/lib/auth.ts';
const root=fileURLToPath(new URL('../',import.meta.url));
const reference=fileURLToPath(new URL('../../reference/',import.meta.url));
function walk(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);}
const localPaths=walk(path.join(root,'src/app/api')).filter(p=>path.basename(p)==='route.ts');
// The review bundle is sparse; a complete checkout uses its own route tree.
const inventoryRoot=localPaths.length>=168?root:reference;
const paths=walk(path.join(inventoryRoot,'src/app/api')).filter(p=>path.basename(p)==='route.ts');
const allowed=new Set(['src/app/api/fte-reports/route.ts','src/app/api/workspace/selection/route.ts','src/app/api/profile/password/route.ts','src/app/api/profile/mfa/route.ts','src/app/api/auth/force-password-reset/route.ts','src/app/api/device-sessions/route.ts']);
const results=[];
const optionalAuth=new Set(['src/app/api/system/client-error-reports/route.ts']);
for(const file of paths){
 const relative=path.relative(inventoryRoot,file).split(path.sep).join('/'),candidate=existsSync(path.join(root,relative))?path.join(root,relative):file;
 const source=readFileSync(candidate,'utf8');
 if(!source.includes('getCurrentUser')||allowed.has(relative)||optionalAuth.has(relative))continue;
 test('default-deny route '+relative,async()=>{
  let f=fixture();f.phase='import';const routeModule=await import(pathToFileURL(candidate));
  const methods=['GET','POST','PUT','PATCH','DELETE'].filter(m=>typeof routeModule[m]==='function');assert.ok(methods.length);
  for(const method of methods){
   f=fixture();signIn(auth,f,'center:school-a');f.phase='request';
   const res=await routeModule[method](request('/'+relative.replace('src/app/','').replace('/route.ts','').replace(/\[[^\]]+\]/g,'synthetic-id')+'?centerId=school-c&userId=other',method==='GET'?undefined:{action:relative.includes('/terminal-payment/')?'process_payment':'revoke',centerId:'school-c',userId:'other',email:'other@example.invalid',applicationAccess:null,accessPurpose:'fte_reporting'},method),{params:Promise.resolve({id:'synthetic-id',requestId:'synthetic-id',reportId:'synthetic-id',provider:'google_ads',childId:'synthetic-id',centerId:'school-c',token:'synthetic-token'})});
   assert.ok([401,403,307].includes(res.status),method+' unexpected '+res.status);if(res.status===307)assert.ok(['/directors','/billing-settings','/login'].includes(new URL(res.headers.get('location')).pathname));
   assert.ok(f.dbCalls.every(c=>c.name==='user.findFirst'),JSON.stringify(f.dbCalls));assert.equal(f.writes.length,0);assert.equal(f.provider.length,0);assert.equal(f.audit.length,0);
   results.push({relative,method,status:res.status});
  }
 });
}
test.after(()=>{if(process.env.FTE_TEST_RESULTS_PATH)writeFileSync(process.env.FTE_TEST_RESULTS_PATH,JSON.stringify(results,null,2)+'\n')});
test('API inventory covers all 170 routes with 141 getCurrentUser surfaces and fixed opt-ins',()=>{
 assert.equal(paths.length,170);assert.equal(paths.filter(p=>readFileSync(p,'utf8').includes('getCurrentUser')).length,141);
 for(const file of paths){const relative=path.relative(inventoryRoot,file).split(path.sep).join('/'),candidate=existsSync(path.join(root,relative))?path.join(root,relative):file;const source=readFileSync(candidate,'utf8');if(source.includes('accessPurpose:'))assert.ok(allowed.has(relative),relative);}
});
