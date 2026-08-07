import assert from "node:assert/strict";
import { test } from "node:test";
import { parseReviewedBalanceRows } from "../scripts/reconcile-reviewed-procare-current-family-balances";

const header = "Account ID,Account Key,Is Hidden,Balance,Person ID,Full Name,BEE Balance Cents,BEE Scope";

test("reviewed balance parser accepts current-family debit, zero, and accounting credit rows", () => {
  const rows = parseReviewedBalanceRows(Buffer.from([
    header,
    "100,ONE,Unchecked,12.34,person-1,Parent One,1234,current_family",
    "200,TWO,Unchecked,0.00,person-2,Parent Two,0,current_family",
    '300,THREE,Unchecked,(5.67),person-3,Parent Three,-567,current_family',
  ].join("\r\n")));
  assert.deepEqual(rows.map((row) => [row.accountId, row.balanceCents]), [
    ["100", 1234],
    ["200", 0],
    ["300", -567],
  ]);
});

test("reviewed balance parser rejects hidden, non-current, mismatched, and duplicate accounts", () => {
  assert.throws(() => parseReviewedBalanceRows(Buffer.from(`${header}\r\n100,ONE,Checked,1.00,p,Parent,100,current_family`)), /hidden/);
  assert.throws(() => parseReviewedBalanceRows(Buffer.from(`${header}\r\n100,ONE,Unchecked,1.00,p,Parent,100,historical`)), /outside the current-family scope/);
  assert.throws(() => parseReviewedBalanceRows(Buffer.from(`${header}\r\n100,ONE,Unchecked,1.00,p,Parent,200,current_family`)), /no longer matches/);
  assert.throws(() => parseReviewedBalanceRows(Buffer.from(`${header}\r\n100,ONE,Unchecked,1.00,p,Parent,100,current_family\r\n100,ONE,Unchecked,1.00,p,Parent,100,current_family`)), /Duplicate Account ID/);
});
