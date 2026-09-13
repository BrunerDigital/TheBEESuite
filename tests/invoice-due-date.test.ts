import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { formatInvoiceDueDate } from "../src/lib/invoice-due-date";
import { formatZonedDateTime } from "../src/lib/zoned-date-time";

const dates = [
  ["2026-09-14", "Sep 14, 2026"],
  ["2026-01-01", "Jan 1, 2026"],
  ["2026-12-31", "Dec 31, 2026"],
  ["2026-03-08", "Mar 8, 2026"],
  ["2026-11-01", "Nov 1, 2026"],
  ["2028-02-29", "Feb 29, 2028"],
] as const;

test("invoice due dates retain their calendar day for historical midnight and noon values", () => {
  for (const [day, expected] of dates) {
    for (const value of [day, `${day}T00:00:00.000Z`, `${day}T12:00:00.000Z`, new Date(`${day}T00:00:00.000Z`), new Date(`${day}T12:00:00.000Z`)]) {
      const original = value instanceof Date ? value.getTime() : value;
      assert.equal(formatInvoiceDueDate(value), expected);
      assert.equal(value instanceof Date ? value.getTime() : value, original, "Display must not mutate its source");
    }
  }
  // Match the existing date input's UTC day even for explicit-offset timestamps.
  assert.equal(formatInvoiceDueDate("2026-09-14T23:00:00-08:00"), "Sep 15, 2026");
});

test("calendar display is independent of server and browser-default timezones", () => {
  const script = `const {formatInvoiceDueDate}=require('./src/lib/invoice-due-date.ts');
    const days=${JSON.stringify(dates.map(([day]) => day))};
    process.stdout.write(JSON.stringify(days.flatMap(day=>[day,day+'T00:00:00.000Z',day+'T12:00:00.000Z',new Date(day)].map(value=>formatInvoiceDueDate(value)))));`;
  const expected = dates.flatMap(([, label]) => [label, label, label, label]);
  for (const timeZone of ["UTC", "America/New_York", "America/Los_Angeles", "Pacific/Honolulu", "Asia/Tokyo", "Pacific/Kiritimati"]) {
    const output = execFileSync(process.execPath, ["--import", "tsx", "--eval", script], { encoding: "utf8", env: { ...process.env, TZ: timeZone } });
    assert.deepEqual(JSON.parse(output), expected, timeZone);
  }
});

test("calendar display keeps safe fallbacks and compact kiosk labels", () => {
  for (const value of [null, undefined, "", "not-a-date", new Date(NaN)]) {
    assert.equal(formatInvoiceDueDate(value), "Not set");
    assert.equal(formatInvoiceDueDate(value, { fallback: "No due date", includeYear: false }), "No due date");
  }
  assert.equal(formatInvoiceDueDate("2026-09-14", { includeYear: false }), "Sep 14");
});

test("all direct invoice display surfaces share the calendar formatter", () => {
  const sites = new Map([
    ["src/components/billing-workbench.tsx", 4],
    ["src/components/parent-portal-workspace.tsx", 3],
    ["src/components/billing-print-actions.tsx", 1],
    ["src/components/payment-method-request-form.tsx", 1],
    ["src/components/live-ops-pages.tsx", 1],
    ["src/components/kiosk-check-in.tsx", 1],
    ["src/components/accounts-receivable-panel.tsx", 2],
    ["src/app/api/global-search/route.ts", 1],
  ]);
  for (const [file, expected] of sites) {
    const source = readFileSync(file, "utf8");
    assert.equal(source.match(/formatInvoiceDueDate\(/g)?.length, expected, file);
    assert.doesNotMatch(source, /(?:formatDate|formatShortDate|shortDate)\((?:invoice\.dueDate|selectedPaymentInvoice\.dueDate|nextOpenInvoice\.dueDate|openInvoices\[0\]\.dueDate|invoiceEditDueDate|account\.oldestOpenDueDate|lookup\.billing\.nextInvoiceDueDate)/, file);
  }
});

test("actual event timestamps retain their school timezone behavior", () => {
  const options = { month: "short", day: "numeric", year: "numeric" } as const;
  assert.equal(formatZonedDateTime("2026-09-14T00:00:00Z", "America/New_York", options), "Sep 13, 2026");
  assert.equal(formatZonedDateTime("2026-09-14T00:00:00Z", "Asia/Tokyo", options), "Sep 14, 2026");
  const billing = readFileSync("src/components/billing-workbench.tsx", "utf8");
  assert.ok(billing.includes("formatShortDate(selectedFamily?.updatedAt)"));
  assert.ok(billing.includes("formatShortDate(payment.paidAt)"));
  const parent = readFileSync("src/components/parent-portal-workspace.tsx", "utf8");
  for (const value of ["report.date", "entry.effectiveAt", "item.createdAt"]) assert.ok(parent.includes(`formatDate(${value})`));
  const print = readFileSync("src/components/billing-print-actions.tsx", "utf8");
  assert.ok(print.includes("formatDate(entry.effectiveAt, timeZone)"));
  assert.ok(print.includes("formatPrintDateTime(payment.paidAt, timeZone)"));
  assert.ok(print.includes("formatPrintDateTime(generatedAt, timeZone)"));
});
