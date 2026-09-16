import assert from "node:assert/strict";
import test from "node:test";
import { PAY_AHEAD_MAX_MONTHS, payAheadDescription, payAheadMonthCount, payAheadTotalCents } from "../src/lib/pay-ahead";

test("pay-ahead uses the saved monthly rate instead of multiplying a weekly rate", () => {
  assert.equal(payAheadTotalCents(180_00, 3), 540_00);
  assert.equal(payAheadDescription("Infant Monthly", 3), "Infant Monthly · 3 months paid ahead");
});

test("pay-ahead accepts only one through twelve months", () => {
  assert.equal(payAheadMonthCount("1"), 1);
  assert.equal(payAheadMonthCount(PAY_AHEAD_MAX_MONTHS), PAY_AHEAD_MAX_MONTHS);
  assert.equal(payAheadMonthCount(0), null);
  assert.equal(payAheadMonthCount(13), null);
  assert.throws(() => payAheadTotalCents(18_000, 0), /between 1 and 12/);
});
