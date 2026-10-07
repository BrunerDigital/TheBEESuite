import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma } from "@prisma/client";
import { lockBatchInvoiceAccounts } from "../src/lib/billing-invoices";

test("batch invoicing locks every family account before the school", async () => {
  const events: string[] = [];
  const tx = {
    billingAccount: {
      createMany: async ({ data, skipDuplicates }: { data: Array<{ familyId: string }>; skipDuplicates: boolean }) => {
        assert.deepEqual(data.map((row) => row.familyId), ["family-a", "family-b"]);
        assert.equal(skipDuplicates, true);
        events.push("accounts-created");
      },
    },
    $queryRaw: async (query: { text: string; values: unknown[] }) => {
      if (query.text.includes('FROM "BillingAccount"')) {
        assert.match(query.text, /ORDER BY "id" FOR UPDATE/);
        assert.deepEqual(query.values, ["family-a", "family-b"]);
        events.push("accounts-locked");
        return [{ id: "account-a" }, { id: "account-b" }];
      }
      assert.match(query.text, /FROM "Center".*FOR UPDATE/);
      assert.deepEqual(query.values, ["school"]);
      events.push("school-locked");
      return [{ id: "school" }];
    },
  } as unknown as Prisma.TransactionClient;

  await lockBatchInvoiceAccounts(tx, ["family-b", "family-a", "family-b"], "school");
  assert.deepEqual(events, ["accounts-created", "accounts-locked", "school-locked"]);
});

test("batch invoicing stops before the school lock if an account is missing", async () => {
  const events: string[] = [];
  const tx = {
    billingAccount: { createMany: async () => { events.push("accounts-created"); } },
    $queryRaw: async () => { events.push("accounts-locked"); return []; },
  } as unknown as Prisma.TransactionClient;
  await assert.rejects(lockBatchInvoiceAccounts(tx, ["family-a"], "school"), /accounts changed/);
  assert.deepEqual(events, ["accounts-created", "accounts-locked"]);
});
