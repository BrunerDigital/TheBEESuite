import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const routeSource = readFileSync("src/app/api/billing/agency-claims/route.ts", "utf8");

function actionBlock(marker: string) {
  const start = routeSource.indexOf(marker);
  assert.notEqual(start, -1, `Missing action marker ${marker}`);
  const next = routeSource.indexOf("\n  if (action === ", start + marker.length);
  return routeSource.slice(start, next === -1 ? routeSource.length : next);
}

test("authorization mutations write audit evidence inside their serializable transactions", () => {
  for (const action of ["createAuthorization", "updateAuthorization", "archiveAuthorization", "restoreAuthorization"]) {
    const block = actionBlock(`if (action === "${action}")`);
    assert.match(block, /prisma\.\$transaction\(async \(tx\) => \{/i, action);
    assert.match(block, /writeAuditLog\([\s\S]*?, tx\);/i, action);
    assert.match(block, /TransactionIsolationLevel\.Serializable/i, action);
    const transactionEnd = block.lastIndexOf("TransactionIsolationLevel.Serializable");
    assert.ok(block.lastIndexOf("writeAuditLog") < transactionEnd, `${action} audit must precede transaction completion`);
  }
});

test("claim preparation mutations write audit evidence inside their serializable transactions", () => {
  for (const action of ["syncRequirements", "updateDocument", "submitClaim", "voidClaim"]) {
    const block = actionBlock(`if (action === "${action}")`);
    assert.match(block, /prisma\.\$transaction\(async \(tx\) => \{/i, action);
    assert.match(block, /writeAuditLog\([\s\S]*?, tx\);/i, action);
    assert.match(block, /TransactionIsolationLevel\.Serializable/i, action);
  }
});

test("archive and void use transactional compare-and-set guards and safe completed retries", () => {
  const archive = actionBlock('if (action === "archiveAuthorization")');
  assert.match(archive, /authorization\.status === "inactive"[\s\S]*?findUniqueOrThrow/);
  assert.match(archive, /updateMany\(\{ where: \{ id: authorization\.id, status: authorization\.status \}/);
  assert.match(archive, /transition\.count !== 1/);

  const voidClaim = actionBlock('if (action === "voidClaim")');
  assert.match(voidClaim, /current\.status === "void"\) return current/);
  assert.match(voidClaim, /updateMany\(\{ where: \{ id: current\.id, centerId, status: current\.status, updatedAt: current\.updatedAt \}/);
  assert.match(voidClaim, /transition\.count !== 1/);
});
