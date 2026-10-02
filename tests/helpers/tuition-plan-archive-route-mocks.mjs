import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { NextRequest } from "next/server";
let actor, fields, centerTenant, writes, audits, planSchool;
function reset(){actor={id:"director",tenantId:"tenant-a",role:"CENTER_DIRECTOR",centerIds:["school-a"]};fields={kept:"setting"};centerTenant="tenant-a";planSchool="school-a";writes=0;audits=[];}
reset();
const db={
 center:{async findFirst({where}){return where.id==="school-a"&&where.organization.tenantId===centerTenant?{customFields:structuredClone(fields)}:null;},async update({data}){writes++;if(data.customFields)fields=data.customFields;return{};}},
 tuitionPlan:{async findFirst({where}){return where.id==="rate"&&where.centerId===planSchool?{id:"rate"}:null;}},
 auditLog:{async create({data}){audits.push(data);}},
 async $transaction(run,options){assert.equal(options.isolationLevel,"Serializable");const old=structuredClone(fields);try{return await run(db);}catch(e){fields=old;throw e;}}
};
mock.module("@/lib/prisma",{namedExports:{prisma:db}});
mock.module("@/lib/auth",{namedExports:{getCurrentUser:async()=>actor,canManageBilling:u=>u.role==="CENTER_DIRECTOR",canAccessCenter:(u,id)=>u.centerIds.includes(id)}});
mock.module("next/cache",{namedExports:{revalidatePath:()=>{}}});
mock.module("@/lib/request-response-logging",{namedExports:{withApiLogging:(_m,h)=>h}});
const route=await import("../../src/app/api/billing/tuition-plans/archive/route.ts");const {POST}=route.default??route;
function request(body={planId:"rate",centerId:"school-a",archived:true},origin="https://example.test"){return new NextRequest("https://example.test/api/billing/tuition-plans/archive",{method:"POST",headers:{"content-type":"application/json",origin},body:JSON.stringify(body)});}
test("unauthenticated, wrong-role and foreign-school actors cannot mutate archive",async()=>{for(const mode of ["none","parent","foreign"]){reset();if(mode==="none")actor=null;if(mode==="parent")actor.role="PARENT_GUARDIAN";if(mode==="foreign")actor.centerIds=[];const r=await POST(request());assert.equal(r.status,mode==="none"?401:403);assert.equal(writes,0);}});
test("same school ID in a foreign tenant fails closed without audit or mutation",async()=>{reset();centerTenant="tenant-b";assert.equal((await POST(request())).status,404);assert.equal(writes,0);assert.equal(audits.length,0);});
test("foreign plan and untrusted origin cannot archive",async()=>{reset();planSchool="school-b";assert.equal((await POST(request())).status,404);assert.equal(writes,0);reset();assert.equal((await POST(request(undefined,"https://evil.test"))).status,403);assert.equal(writes,0);});
test("archive and restore are scoped, atomic, audited and idempotent",async()=>{reset();assert.equal((await POST(request())).status,200);assert.equal(fields.kept,"setting");assert.deepEqual(fields.archivedTuitionPlanIds,["rate"]);assert.equal(audits.length,1);assert.equal(audits[0].tenantId,"tenant-a");assert.equal(audits[0].resourceId,"rate");const count=writes;await POST(request());assert.equal(writes,count);assert.equal(audits.length,1);assert.equal((await POST(request({planId:"rate",centerId:"school-a",archived:false}))).status,200);assert.deepEqual(fields.archivedTuitionPlanIds,[]);assert.equal(audits[1].action,"billing.tuition_plan.restored");});

