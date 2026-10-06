import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "@prisma/client";
import { loadAgencyBalanceSummary } from "../src/lib/agency-balance-summary";

test("agency summary retains posted unapplied cash during allocation review and counts batches once", async () => {
  let captured: Prisma.Sql | undefined;
  const db = { async $queryRaw(query: Prisma.Sql) { captured = query; return []; } } as unknown as Pick<Prisma.TransactionClient, "$queryRaw">;
  await loadAgencyBalanceSummary(["school"], {}, new Date("2026-10-06T12:00:00Z"), db);
  assert.ok(captured);
  assert.match(captured.text, /SUM\(GREATEST\(batch\."unappliedCents", 0\)\) FILTER \(WHERE batch\."reviewedAt" IS NOT NULL AND batch\.status <> 'rejected'\)/);
  assert.match(captured.text, /batch\."reversedAt" IS NULL/);
  assert.match(captured.text, /COALESCE\(deposits\.review, 0\) \+ COALESCE\(adjustments\.review, 0\)\)\:\:bigint AS "pendingReviewCount"/);
  assert.doesNotMatch(captured.text, /AgencyRemittanceAllocation|allocations\.review/);
});
