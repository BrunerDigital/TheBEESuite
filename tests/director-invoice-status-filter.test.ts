import assert from "node:assert/strict";
import { test } from "node:test";
import {
  normalizeDirectorInvoiceStatus,
  paymentStatusForDirectorInvoiceStatus,
} from "../src/lib/director-invoice-status";

test("director invoice status defaults to open and supports paid and voided views", () => {
  assert.equal(normalizeDirectorInvoiceStatus(undefined), "open");
  assert.equal(normalizeDirectorInvoiceStatus("unknown"), "open");
  assert.equal(normalizeDirectorInvoiceStatus("paid"), "paid");
  assert.equal(normalizeDirectorInvoiceStatus("voided"), "voided");

  assert.equal(paymentStatusForDirectorInvoiceStatus("open"), "OPEN");
  assert.equal(paymentStatusForDirectorInvoiceStatus("paid"), "PAID");
  assert.equal(paymentStatusForDirectorInvoiceStatus("voided"), "VOID");
});
