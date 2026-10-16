import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {restrictedFteCenterDisplay,restrictedFtePrefill} from '../src/lib/fte-only-projection.ts';
const source=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('restricted FTE client center projection excludes tax/setup/contact/nested sentinel fields',()=>{
 const center={id:'a',name:'School',crmLocationId:'school',city:'City',state:'FL',ownerGroup:{name:'Owner',ownerType:'Franchise',secret:'SENTINEL_OWNER'},customFields:{ein:'SENTINEL_TAX',setup:'SENTINEL_SETUP'},email:'SENTINEL_EMAIL',phone:'SENTINEL_PHONE',_count:{staff:99},newSensitiveField:'SENTINEL_FUTURE'};
 const projected=restrictedFteCenterDisplay(center);assert.equal(JSON.stringify(projected).includes('SENTINEL'),false);assert.deepEqual(Object.keys(projected),['id','name','crmLocationId','city','state','ownerGroup']);assert.deepEqual(projected.ownerGroup,{name:'Owner',ownerType:'Franchise'});assert.equal(center.customFields.ein,'SENTINEL_TAX');
});

test('restricted FTE prefill retains counts, omits child roster and future fields',()=>{
 const row={centerId:'a',enrolledCount:12,unknownScheduleCount:3,accountReceivableReviewRequired:true,missingScheduleChildren:[{id:'SENTINEL_ID',fullName:'SENTINEL_CHILD',classroomName:'SENTINEL_ROOM'}],futureField:'SENTINEL_FUTURE'};
 const projected=restrictedFtePrefill(row);assert.equal(JSON.stringify(projected).includes('SENTINEL'),false);assert.equal(projected.enrolledCount,12);assert.equal(projected.unknownScheduleCount,3);assert.equal(projected.accountReceivableReviewRequired,true);assert.deepEqual(projected.missingScheduleChildren,[]);assert.equal(row.missingScheduleChildren.length,1);
});

test('server page wires exact-purpose authorization and restricted projections before client boundary',()=>{
 const page=source('src/app/[slug]/page.tsx');assert.match(page,/slug === "fte-reports" \? \{ accessPurpose: "fte_reporting" as const \} : \{\}/);
 assert.match(page,/centers: isFteOnlyUser\(user\) \? centers.map\(restrictedFteCenterDisplay\) : centers/);assert.match(page,/ftePrefills: isFteOnlyUser\(user\) \? ftePrefills.map\(restrictedFtePrefill\) : ftePrefills/);
 assert.match(page,/if \(isFteOnlyUser\(user\)\) return <FteOnlyShell currentUser=\{user\}>\{livePage\}<\/FteOnlyShell>/);
});

test('restricted shell imports no general shell/data widgets and offers only reporting/security/logout',()=>{
 const shell=source('src/components/fte-only-shell.tsx');const imports=shell.split('\n').filter(l=>l.startsWith('import')).join('\n');assert.doesNotMatch(imports,/app-shell|notification|web-push|global-search|billing/);
 assert.deepEqual([...shell.matchAll(/href="([^"]+)"/g)].map(m=>m[1]),['/fte-reports','/workspace?next=%2Ffte-reports','/account/security']);assert.match(shell,/fetch\("\/api\/auth\/logout", \{ method: "POST" \}\)/);
});

test('workspace/security/forced-reset UI retain only fixed FTE continuations for restricted actor',()=>{
 const workspace=source('src/app/workspace/page.tsx');assert.match(workspace,/accessPurpose: "workspace_selection"/);assert.match(workspace,/if \(isFteOnlyUser\(user\)\) \{/);assert.match(workspace,/nextPath="\/fte-reports" restrictedFte/);
 assert.match(source('src/app/account/security/page.tsx'),/isFteOnlyUser\(user\) \? "\/fte-reports" : homePathForRole/);
 assert.match(source('src/components/reset-password-form.tsx'),/data\?\.nextPath === "\/fte-reports"/);
});

test('restricted account page reuses credential-safe form controls, clears success and prevents duplicate submit',()=>{
 const page=source('src/app/account/security/page.tsx');assert.match(page,/Boolean\(await getCurrentUser\(\{ accessPurpose: "account_security" \}\)\)/);assert.match(page,/isFteOnlyUser\(user\) \? passwordChangeAllowed \? <AccountPasswordChangeForm/);
 const form=source('src/components/account-password-change-form.tsx');assert.match(form,/<ClientAuthForm action="\/api\/profile\/password"/);assert.match(form,/if \(submitting.current\) return/);assert.match(form,/form.reset\(\)/);assert.match(form,/autoComplete="current-password"/);assert.match(form,/autoComplete="new-password"/);assert.doesNotMatch(form,/localStorage|sessionStorage|console\.|router\.|setTimeout/);
});
