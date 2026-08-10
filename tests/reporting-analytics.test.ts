import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildBillingReports,
  buildEnrollmentStatusReportRows,
  childAgeInMonths,
  normalizeReportFilters,
  parseReportDate,
  reportRowsToCsv,
  reportRowsToPdf,
  rowsForReportKind,
  type AnalyticsReportData,
} from "../src/lib/reporting-analytics";

const emptyReportData: AnalyticsReportData = {
  generatedAt: "2026-06-08T12:00:00.000Z",
  range: { startDate: "2026-06-01T00:00:00.000Z", endDate: "2026-06-08T23:59:59.999Z" },
  scope: { centerIds: ["center_1"], centerLabels: ["FL | Tampa"] },
  centers: [{ id: "center_1", name: "Main", label: "FL | Tampa", timezone: "America/New_York" }],
  enrollmentStatus: [
    {
      childId: "child_1",
      centerId: "center_1",
      centerLabel: "FL | Tampa",
      groupLabel: "Infants",
      groupSortOrder: 0,
      statusDate: "2026-01-27T12:00:00.000Z",
      childName: "Warren, Blake",
      gender: "Female",
      dateOfBirth: "2025-07-24T12:00:00.000Z",
      ageInMonths: 10,
      ageLabel: "0 Yr - 10 Mo",
      enrollmentStatus: "enrolled",
    },
  ],
  leadSources: [
    {
      centerId: "center_1",
      centerLabel: "FL | Tampa",
      source: "Website",
      leads: 10,
      tours: 6,
      applications: 4,
      enrolled: 3,
      waitlisted: 1,
      conversionRate: 30,
    },
  ],
  funnelStages: [{ stage: "ENROLLED", count: 3, share: 30 }],
  attendanceTrends: [],
  billing: [],
  weeklyBilling: [],
  weeklyPayments: [],
  messages: [],
  staffHours: [
    {
      staffId: "staff_1",
      staffName: "Lead Teacher",
      staffEmail: "lead@example.com",
      title: "Lead Teacher",
      centerId: "center_1",
      centerLabel: "FL | Tampa",
      classroomName: "Pre-K",
      status: "clocked_out",
      totalMinutes: 510,
      closedShiftMinutes: 510,
      openShiftMinutes: 0,
      closedShiftCount: 1,
      lastActionAt: "2026-06-04T20:30:00.000Z",
      openShiftStartedAt: null,
      activeUser: true,
    },
  ],
  totals: {
    leadCount: 10,
    enrolledCount: 3,
    leadConversionRate: 30,
    presentCount: 0,
    absentCount: 0,
    attendanceRate: 0,
    invoiceCents: 0,
    paidCents: 0,
    openCents: 0,
    overdueCents: 0,
    parentMessages: 0,
    unreadMessages: 0,
    avgResponseHours: null,
    staffHoursMinutes: 510,
    staffOpenShiftMinutes: 0,
    staffClockedIn: 0,
    currentEnrollmentCount: 1,
  },
};

test("weekly billing and payment rows use Monday-Sunday center-local periods", () => {
  const centerById = new Map([["center_1", emptyReportData.centers[0]]]);
  const rows = buildBillingReports({
    invoices: [
      {
        createdAt: new Date("2026-06-08T03:30:00.000Z"),
        dueDate: new Date("2026-06-10T12:00:00.000Z"),
        status: "OPEN",
        totalCents: 12500,
        isCurrentFamily: true,
        billingAccount: { family: { centerId: "center_1" } },
      },
    ],
    payments: [
      {
        paidAt: new Date("2026-06-08T14:00:00.000Z"),
        status: "PAID",
        amountCents: 5000,
        billingAccount: { family: { centerId: "center_1" } },
      },
    ],
    centerById,
    interval: "weekly",
    now: new Date("2026-06-11T12:00:00.000Z"),
  });

  assert.deepEqual(rows.map((row) => [row.period, row.invoiceCount, row.paymentCount]), [
    ["2026-06-08 to 2026-06-14", 0, 1],
    ["2026-06-01 to 2026-06-07", 1, 0],
  ]);
});

test("billing reports retain historical revenue while excluding past-family debt from open AR", () => {
  const centerById = new Map([["center_1", emptyReportData.centers[0]]]);
  const rows = buildBillingReports({
    invoices: [
      {
        createdAt: new Date("2026-06-08T12:00:00.000Z"),
        dueDate: new Date("2026-06-09T12:00:00.000Z"),
        status: "OPEN",
        totalCents: 12500,
        isCurrentFamily: true,
        billingAccount: { family: { centerId: "center_1" } },
      },
      {
        createdAt: new Date("2026-06-08T12:00:00.000Z"),
        dueDate: new Date("2026-06-09T12:00:00.000Z"),
        status: "OPEN",
        totalCents: 9900,
        isCurrentFamily: false,
        billingAccount: { family: { centerId: "center_1" } },
      },
    ],
    payments: [],
    centerById,
    interval: "weekly",
    now: new Date("2026-06-11T12:00:00.000Z"),
  });

  assert.equal(rows[0]?.invoiceCount, 2);
  assert.equal(rows[0]?.invoiceCents, 22400);
  assert.equal(rows[0]?.openCents, 12500);
  assert.equal(rows[0]?.overdueCents, 12500);
});

test("weekly billing and payment exports stay separate", () => {
  const weeklyRow = {
    period: "2026-06-01 to 2026-06-07",
    centerId: "center_1",
    centerLabel: "FL | Tampa",
    invoiceCents: 12500,
    paidCents: 5000,
    openCents: 7500,
    overdueCents: 0,
    invoiceCount: 2,
    paymentCount: 1,
  };
  const data = { ...emptyReportData, weeklyBilling: [weeklyRow], weeklyPayments: [weeklyRow] };

  const billingCsv = reportRowsToCsv(rowsForReportKind(data, "weekly_billing"));
  const paymentCsv = reportRowsToCsv(rowsForReportKind(data, "weekly_payments"));
  assert.match(billingCsv, /Weekly Billing Report/);
  assert.match(billingCsv, /"Invoices","Billed","Current-family open AR","Current-family overdue AR"/);
  assert.doesNotMatch(billingCsv, /Payments,Paid/);
  assert.match(paymentCsv, /Weekly Payment Report/);
  assert.match(paymentCsv, /"Payments","Paid"/);
  assert.doesNotMatch(paymentCsv, /open AR/);
});

test("enrollment status rows calculate age as of the report date and retain missing DOB exceptions", () => {
  const centerById = new Map([["center_1", emptyReportData.centers[0]]]);
  const children = [
    {
      id: "child_1", fullName: "Warren, Blake", dateOfBirth: new Date("2025-07-24T12:00:00.000Z"), startDate: new Date("2026-01-27T12:00:00.000Z"),
      ageGroup: "Infant", enrollmentStatus: "enrolled", customFields: { gender: "F" }, family: { centerId: "center_1" },
      classroom: { name: "Infants", ageGroup: "Infant", centerId: "center_1" },
    },
    {
      id: "child_2", fullName: "DOB, Review", dateOfBirth: new Date("1900-01-01T12:00:00.000Z"), startDate: null,
      ageGroup: "Twos", enrollmentStatus: "active", customFields: { dateOfBirthMissing: true, rawData: { Gender: "Male" } }, family: { centerId: "center_1" },
      classroom: { name: "Twos", ageGroup: "Twos", centerId: "center_1" },
    },
    {
      id: "child_other", fullName: "Other School", dateOfBirth: new Date("2025-01-01T12:00:00.000Z"), startDate: null,
      ageGroup: "Infant", enrollmentStatus: "enrolled", customFields: {}, family: { centerId: "center_2" },
      classroom: { name: "Infants", ageGroup: "Infant", centerId: "center_2" },
    },
  ];

  const rows = buildEnrollmentStatusReportRows(children, centerById, new Date("2026-07-31T23:59:59.999Z"));
  assert.equal(childAgeInMonths(children[0].dateOfBirth, new Date("2026-07-31T23:59:59.999Z")), 12);
  assert.deepEqual(rows.map((row) => [row.childId, row.gender, row.ageLabel]), [
    ["child_1", "Female", "1 Yr - 0 Mo"],
    ["child_2", "Male", "DOB needs review"],
  ]);
});

test("enrollment ages use the school's calendar date without shifting stored DOB dates", () => {
  assert.equal(
    childAgeInMonths(
      new Date("2025-08-01T00:00:00.000Z"),
      new Date("2026-08-01T03:59:59.999Z"),
      "America/New_York",
    ),
    11,
  );
});

test("report filters normalize quick ranges and center ids", () => {
  const filters = normalizeReportFilters(
    { range: "30", centerId: "center_1" },
    new Date("2026-06-08T12:00:00.000Z"),
  );

  assert.equal(filters.centerId, "center_1");
  assert.ok(filters.startDate);
  assert.ok(filters.endDate);
  assert.equal(filters.endDate.getHours(), 23);
  assert.equal(filters.endDate.getMinutes(), 59);
  assert.equal(filters.startDate.getHours(), 0);
  assert.equal(Math.round((filters.endDate.getTime() - filters.startDate.getTime()) / 86_400_000), 30);
  assert.equal(filters.startDate.getDate(), 10);
});

test("report date parser keeps date-only values on the selected local day", () => {
  const date = parseReportDate("2026-06-08");

  assert.ok(date);
  assert.equal(date.getFullYear(), 2026);
  assert.equal(date.getMonth(), 5);
  assert.equal(date.getDate(), 8);
  assert.equal(date.getHours(), 0);
});

test("lead funnel report exports CSV rows", () => {
  const report = rowsForReportKind(emptyReportData, "lead_funnel");
  const csv = reportRowsToCsv(report);

  assert.match(csv, /Lead Source And Funnel Conversion/);
  assert.match(csv, /Website/);
  assert.match(csv, /30%/);
});

test("enrollment status report exports the ProCare-style roster fields", () => {
  const report = rowsForReportKind(emptyReportData, "enrollment_status");
  const csv = reportRowsToCsv(report);

  assert.match(csv, /Enrollment Status Summary/);
  assert.match(csv, /Status date/);
  assert.match(csv, /Warren, Blake/);
  assert.match(csv, /0 Yr - 10 Mo/);
});

test("staff hours report exports clock totals", () => {
  const report = rowsForReportKind(emptyReportData, "staff_hours");
  const csv = reportRowsToCsv(report);

  assert.match(csv, /Staff Hours And Time Clock/);
  assert.match(csv, /Lead Teacher/);
  assert.match(csv, /8.50/);
});

test("report PDF export returns a PDF buffer", () => {
  const report = rowsForReportKind(emptyReportData, "lead_funnel");
  const pdf = reportRowsToPdf(report, new Date("2026-06-08T12:00:00.000Z"));

  assert.equal(pdf.subarray(0, 8).toString(), "%PDF-1.4");
  assert.match(pdf.toString(), /%%EOF/);
});

test("report PDF export paginates without dropping later rows", () => {
  const report = rowsForReportKind({
    ...emptyReportData,
    enrollmentStatus: Array.from({ length: 130 }, (_, index) => ({
      ...emptyReportData.enrollmentStatus[0],
      childId: `child_${index}`,
      childName: `Child ${String(index).padStart(3, "0")}`,
    })),
  }, "enrollment_status");
  const pdfText = reportRowsToPdf(report).toString();

  assert.match(pdfText, /Page 3 of 3/);
  assert.match(pdfText, /Child 129/);
});
