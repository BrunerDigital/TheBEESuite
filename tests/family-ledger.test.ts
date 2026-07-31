import assert from "node:assert/strict";
import test from "node:test";
import { filterFamilyLedgerEntries } from "../src/lib/family-ledger";

const entries = [
  { id: "harris-1", billingAccount: { family: { id: "harris" } } },
  { id: "davis-1", billingAccount: { family: { id: "davis" } } },
  { id: "harris-2", billingAccount: { family: { id: "harris" } } },
];

test("family ledger shows entries for only the selected family", () => {
  assert.deepEqual(
    filterFamilyLedgerEntries(entries, "harris").map((entry) => entry.id),
    ["harris-1", "harris-2"],
  );
  assert.deepEqual(filterFamilyLedgerEntries(entries, ""), []);
});
