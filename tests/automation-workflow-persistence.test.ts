import test from "node:test";
import assert from "node:assert/strict";
import { Prisma, type PrismaClient, type UserRole } from "@prisma/client";
import { readFileSync } from "node:fs";
import { automationTenantScopeWhere } from "../src/lib/automation-tenant-scope";
import { automationRecordSignature, newAutomationDraft } from "../src/lib/automation-workflow-state";
import { AutomationConfigurationError, saveAutomationConfiguration } from "../src/lib/automation-workflow-persistence";
import { automationPageHref, readAutomationPage } from "../src/lib/automation-page";

type Row = Record<string, unknown>;
function matches(row: Row | null, where: Row): boolean {
  if (!row) return false;
  return Object.entries(where).every(([key, expected]) => {
    if (key === "OR") return (expected as Row[]).some(part => matches(row, part));
    if (key === "AND") return (expected as Row[]).every(part => matches(row, part));
    if (expected && typeof expected === "object") {
      const filter = expected as Row;
      if ("is" in filter) return matches(row[key] as Row | null, filter.is as Row);
      if ("equals" in filter) return filter.equals === Prisma.AnyNull ? row[key] === null : JSON.stringify(row[key]) === JSON.stringify(filter.equals);
      return matches(row[key] as Row | null, filter);
    }
    return row[key] === expected;
  });
}
const actor = { id: "fake-manager", tenantId: "fake-tenant", email: "manager@example.test", role: "CENTER_DIRECTOR" as UserRole, isActive: true };
const original = { id: "fake-automation", tenantId: "fake-tenant" as string | null, brandId: "fake-brand" as string | null, brand: { tenantId: "fake-tenant" } as Row | null, name: "Original", trigger: "manual", condition: { rule: "Old rule", audience: "Old audience", custom: { center: "fake-center" } } as unknown, action: { type: "create_task", channel: "task", legacy: { approved: true } } as unknown, delay: null, status: "paused" };

function fixture(requestActor = actor) {
  let state = structuredClone(original);
  let currentActor: Row | null = structuredClone(requestActor);
  let beforeUpdate = (_row: typeof original) => {};
  let failAudit = false;
  let writes = 0;
  const committedAudits: string[] = [];
  const database = { async $transaction(run: (tx: unknown) => Promise<unknown>, options: unknown) {
    assert.deepEqual(options, { isolationLevel: "Serializable" });
    let working = structuredClone(state);
    const audits: string[] = [];
    const tx = {
      user: { findFirst: async ({ where }: { where: Row }) => matches(currentActor, where) ? currentActor : null },
      automation: {
        findFirst: async ({ where }: { where: Row }) => matches(working, where) ? structuredClone(working) : null,
        updateMany: async ({ where, data }: { where: Row; data: Row }) => {
          beforeUpdate(working);
          if (!matches(working, where)) return { count: 0 };
          assert.ok(!("tenantId" in data) && !("brandId" in data), "Update never reparents ownership");
          working = { ...working, ...data }; writes++; return { count: 1 };
        },
        create: async ({ data }: { data: Row }) => {
          assert.equal(data.tenantId, actor.tenantId); assert.equal(data.brandId, null);
          working = { ...working, ...data, id: "fake-new", brand: null }; writes++; return structuredClone(working);
        },
      },
      auditLog: { create: async () => { if (failAudit) throw new Error("Fake audit failure"); audits.push("saved"); } },
    };
    const result = await run(tx);
    state = working; committedAudits.push(...audits); return result;
  } } as unknown as Pick<PrismaClient, "$transaction">;
  const save = (id = original.id, signature = automationRecordSignature(state)) => saveAutomationConfiguration({
    database, actor: requestActor, id, expectedRecordSignature: signature, draft: { ...newAutomationDraft(), name: "Saved fake configuration", requiresReview: false },
    canManage: candidate => ["CENTER_DIRECTOR", "ASSISTANT_DIRECTOR"].includes(candidate.role),
    audit: async tx => { await tx.auditLog.create({ data: { tenantId: actor.tenantId, userId: actor.id, action: "operations.automation.updated", resource: "automation" } }); },
  });
  return { save, state: () => state, setState: (value: Partial<typeof original>) => { state = { ...state, ...value }; }, setActor: (value: Row | null) => { currentActor = value; }, beforeUpdate: (callback: typeof beforeUpdate) => { beforeUpdate = callback; }, failAudit: () => { failAudit = true; }, audits: committedAudits, writes: () => writes };
}
const status = (code: number) => (error: unknown) => error instanceof AutomationConfigurationError && error.status === code;

test("automation ownership allows only consistent direct or legacy brand ownership", () => {
  const scope = automationTenantScopeWhere("fake-tenant");
  const cases: Array<[string | null, string | null, boolean]> = [
    ["fake-tenant", null, true], ["fake-tenant", "fake-tenant", true], [null, "fake-tenant", true],
    ["foreign", "fake-tenant", false], ["fake-tenant", "foreign", false], [null, null, false], ["foreign", null, false],
  ];
  for (const [tenantId, brandTenant, allowed] of cases) assert.equal(matches({ tenantId, brandId: brandTenant ? "fake-brand" : null, brand: brandTenant ? { tenantId: brandTenant } : null }, scope), allowed);
  assert.deepEqual(automationTenantScopeWhere(""), { id: "__no_automation_tenant__" });
});

test("automation save retains ownership and nested JSON, clears fields and audits atomically", async () => {
  for (const owner of [{ tenantId: actor.tenantId, brandId: null, brand: null }, { tenantId: null, brandId: "fake-brand", brand: { tenantId: actor.tenantId } }, { tenantId: actor.tenantId, brandId: "fake-brand", brand: { tenantId: actor.tenantId } }]) {
    const f = fixture(); f.setState(owner);
    const saved = await f.save();
    assert.equal(saved.tenantId, owner.tenantId); assert.equal(saved.brandId, owner.brandId);
    assert.deepEqual(saved.condition, { rule: null, audience: null, requiresReview: false, custom: { center: "fake-center" } });
    assert.deepEqual(saved.action, { type: "create_task", channel: "task", legacy: { approved: true } });
    assert.deepEqual(f.audits, ["saved"]);
  }
  const created = await fixture().save(""); assert.equal(created.id, "fake-new"); assert.equal(created.status, "draft"); assert.equal(created.brandId, null);
});

test("automation conflicts and authorization changes fail closed without a committed mutation", async () => {
  const blankTenant = fixture({ ...actor, tenantId: "" }); await assert.rejects(blankTenant.save(), status(403)); assert.equal(blankTenant.writes(), 0);
  for (const values of [{ tenantId: "foreign" }, { brand: { tenantId: "foreign" } }, { tenantId: null, brand: null, brandId: null }]) {
    const f = fixture(); f.setState(values); await assert.rejects(f.save(), status(404)); assert.equal(f.writes(), 0);
  }
  for (const changed of [null, { ...actor, isActive: false }, { ...actor, tenantId: "foreign" }, { ...actor, email: "changed@example.test" }, { ...actor, role: "READ_ONLY_AUDITOR" }]) {
    const f = fixture(); f.setActor(changed); await assert.rejects(f.save(), status(403)); assert.equal(f.writes(), 0);
  }
  const stale = fixture(); await assert.rejects(stale.save(original.id, "stale-client-snapshot"), status(409)); assert.equal(stale.writes(), 0);
  for (const change of [(row: typeof original) => { row.status = "changed"; }, (row: typeof original) => { row.brand = { tenantId: "foreign" }; }, (row: typeof original) => { row.condition = { changed: true }; }]) {
    const f = fixture(); f.beforeUpdate(change); await assert.rejects(f.save(), status(409)); assert.equal(f.writes(), 0); assert.deepEqual(f.audits, []);
  }
});

test("automation audit errors roll back and incompatible legacy JSON is never discarded", async () => {
  const f = fixture(); f.failAudit(); await assert.rejects(f.save(), /Fake audit failure/); assert.deepEqual(f.state(), original); assert.deepEqual(f.audits, []);
  for (const values of [{ condition: [] }, { condition: { requiresReview: "false" } }, { condition: { requiresReview: { manager: true } } }, { action: "legacy-action" }, { action: null }]) {
    const incompatible = fixture(); incompatible.setState(values); await assert.rejects(incompatible.save(), status(409)); assert.equal(incompatible.writes(), 0);
  }
  const database = { $transaction: async () => { throw new Prisma.PrismaClientKnownRequestError("Fake conflict", { code: "P2034", clientVersion: "test" }); } } as unknown as Pick<PrismaClient, "$transaction">;
  await assert.rejects(saveAutomationConfiguration({ database, actor, id: original.id, draft: newAutomationDraft(), expectedRecordSignature: "", canManage: () => true, audit: async () => {} }), status(409));
});

test("automation pages reach every counted record with deterministic scoped bounds", async () => {
  for (const total of [0, 50, 51, 101]) {
    const scope = automationTenantScopeWhere(actor.tenantId);
    const client = {
      automation: { count: async ({ where }: { where: Row }) => { assert.deepEqual(where.OR, scope.OR); return where.status ? 0 : total; }, findMany: async (args: Row) => { assert.deepEqual(args.where, scope); assert.deepEqual(args.orderBy, [{ status: "asc" }, { name: "asc" }, { id: "asc" }]); assert.equal(args.take, 50); assert.equal((args.include as { runs: { take: number } }).runs.take, 1); return []; } },
      automationRun: { count: async ({ where }: { where: Row }) => { assert.deepEqual(where.automation, scope); return 0; } },
    } as unknown as Pick<Prisma.TransactionClient, "automation" | "automationRun">;
    const page = await readAutomationPage(client, actor.tenantId, "999", new Date("2026-09-12T15:00:00Z"));
    assert.equal(page.pagination.page, Math.max(1, Math.ceil(total / 50))); assert.equal(page.pagination.total, total); assert.equal(page.pagination.nextHref, null);
    assert.equal(page.pagination.previousHref, total > 50 ? automationPageHref(page.pagination.page - 1) : null);
  }
});

test("automation API returns its transactional receipt without generic notification or second audit", () => {
  const source = readFileSync("src/app/api/operations/records/route.ts", "utf8");
  const block = source.split('} else if (entity === "automation") {')[1].split('} else if (entity === "document") {')[0];
  assert.match(block, /saveAutomationConfiguration/); assert.match(block, /configurationOnly: true/); assert.match(block, /return NextResponse.json/);
  assert.match(block, /writeAuditLog\(user,[\s\S]*\}, tx\)/); assert.doesNotMatch(block, /brand.findFirst|notifyOperationsRecordChange|automationRun/);
  assert.match(readFileSync("src/components/live-ops-pages.tsx", "utf8"), /<AutomationWorkflowBuilder key=\{data.pagination\?\.page \?\? 1\} data=\{data\}/);
});
