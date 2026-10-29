import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {inquiryFixture} from './helpers/inquiry-route-fixture.mjs';
import {embedFixture} from './helpers/inquiry-embed-fixture.mjs';
import {isActiveSchoolFinanceOperationsCandidate} from '../src/lib/active-school-locations';
const removed=[{id:'cmp4ewfzn004g6alwqbqrzcql',identifier:'Kid City USA - MO | Lees Summit',name:'Kid City USA - Lees Summit'},{id:'cmp4ewh78004y6alwu6s3bsv4',identifier:'Kid City USA - TX | Garland',name:'Kid City USA - Garland'}];
function setup(target:typeof removed[number],options={}){
 const f=inquiryFixture({restored:true,restorationEnabled:true,additionalLocations:[removed[1].identifier,'Kid City USA - FL | Vero Beach'],...options});
 const center=f.centers.find((c:{crmLocationId:string})=>c.crmLocationId===target.identifier)!;center.id=target.id;return {f,center};
}
for(const target of removed){
 test(target.name+': immutable resolved ID blocks mutable alias and default intake before effects',async()=>{
  for(const mode of ['alias','default'])for(const status of ['active','closed'])for(const form of [false,true]){
   const {f,center}=setup(target,{defaultCenterId:target.id});center.status=status;center.name='Synthetic renamed center';center.crmLocationId='synthetic-legacy';center.locationId='synthetic-legacy';
   const before=structuredClone(center);
   const response=await f.post({locationId:mode==='alias'?'synthetic-legacy':'unknown',brandName:'Example Brand'},{form,origin:''});
   assert.equal(response.status,400,mode+' '+status);
   for(const key of ['writes','notificationLookups','emails','sheets','unexpectedNetwork'] as const)assert.equal(f.effects[key],0,key);
   assert.deepEqual(center,before);
  }
 });
 test(target.name+': immutable ID blocks renamed live catalogs and fixed availability',async()=>{
  const {f,center}=setup(target);center.status='active';center.name='Synthetic renamed center';center.crmLocationId='synthetic-renamed';center.locationId='synthetic-renamed';
  const financeBefore=isActiveSchoolFinanceOperationsCandidate(center);
  for(const query of ['', '?purpose=inquiry','?purpose=inquiry&centerId='+target.id]){
   const result=await f.get(query);assert.equal(result.status,200);assert.equal(result.body.locations.some((r:{crmLocationId:string})=>r.crmLocationId==='synthetic-renamed'),false);
   if(query.includes('centerId='))assert.equal(result.body.inquiryCenterEligible,false);
   assert.equal(result.body.locations.some((r:{crmLocationId:string})=>r.crmLocationId==='Kid City USA - FL | Altamonte - Douglas'),true);
  }
  assert.equal(isActiveSchoolFinanceOperationsCandidate(center),financeBefore,'Public exclusion must preserve existing finance eligibility');
  assert.equal(f.effects.writes,0);
 });
 test(target.name+': canonical static and failed-live public catalogs omit only the approved school',async()=>{
  for(const options of [{},{liveFails:true},{emptyLive:true}]){
   const {f}=setup(target,options);const result=await f.get('?purpose=inquiry');assert.equal(result.body.locations.some((r:{crmLocationId:string})=>r.crmLocationId===target.identifier),false);assert.equal(f.effects.writes,0);
  }
  assert.equal(JSON.parse(readFileSync('public/kidcity-locations.json','utf8')).locations.some((r:{crmLocationId:string})=>r.crmLocationId===target.identifier),false);
  assert.equal(readFileSync('wordpress-avada/kidcity-inquiry-form-bee-suite.html','utf8').includes('value="'+target.identifier+'"'),false);
 });
 test(target.name+': stale hosted selectors and forged selections stop before submission',async()=>{
  for(const script of ['kidcity-inquiry-form.js','bee-suite-inquiry-form.js']){
   for(const field of ['centerId','locationId','publicLocationId','locationName']){
    const value=field==='centerId'?target.id:target.identifier;
    const fixed=await embedFixture(script,{dataset:{[field]:value},additionalLocations:[target.identifier]});
    assert.doesNotMatch(fixed.target.innerHTML,/<form/);assert.equal(fixed.calls.length,0);
   }
   const catalog=await embedFixture(script,{additionalLocations:[target.identifier]});assert.equal(catalog.target.innerHTML.includes(target.identifier),false);
   const forged=await embedFixture(script,{fields:{locationId:target.identifier}});await forged.submit();
   assert.equal(forged.calls.some((c:{options?:{method?:string}})=>c.options?.method==='POST'),false);
  }
 });
}
