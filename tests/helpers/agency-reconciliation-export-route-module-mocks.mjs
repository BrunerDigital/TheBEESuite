import assert from "node:assert/strict";
import { mock, test } from "node:test";

const originalHeaders = [
  "School ID",
  "School",
  "Agency",
  "Program",
  "A/R GL",
  "Cash GL",
  "Adjustment GL",
  "Cost center",
  "Approved",
  "Remitted",
  "Unapplied cash",
  "Adjustments",
  "Expected balance",
  "Ledger balance",
  "Variance",
  "Open batch exceptions",
];

const currentUser = {
  id: "auditor-user",
  tenantId: "tenant-test",
  email: "auditor@example.test",
  name: "Read-only Auditor",
  role: "READ_ONLY_AUDITOR",
  centerIds: ["center-test"],
  workspace: { mode: "fixed", activeCenterId: "center-test" },
};

const account = {
  id: "account-test",
  centerId: "center-test",
  agencyProgramId: "program-test",
  balanceCents: 5_500,
  center: { id: "center-test", name: "Test School" },
  agencyProgram: {
    id: "program-test",
    centerId: "center-test",
    name: "State Agency",
    programName: "Child Care",
    // These extra mock fields prove the export ignores mutable current values.
    receivableGlCode: "AR-CURRENT-A",
    cashGlCode: "CASH-CURRENT-A",
    adjustmentGlCode: "ADJ-CURRENT-A",
    costCenterCode: "CC-CURRENT-A",
  },
};

let snapshotAggregates = [];

const tx = {
  agencyLedgerAccount: {
    async findMany() {
      return [account];
    },
  },
  async $queryRaw() {
    return snapshotAggregates;
  },
};

mock.module("@/lib/prisma", {
  namedExports: {
    prisma: {
      async $transaction(callback) {
        return callback(tx);
      },
    },
  },
});

mock.module("@/lib/auth", {
  namedExports: {
    async getCurrentUser() {
      return currentUser;
    },
    canManageBilling() {
      return false;
    },
    canAccessCenter(_user, centerId) {
      return centerId === "center-test";
    },
  },
});

mock.module("@/lib/audit", {
  namedExports: {
    async writeAuditLog() {
      throw new Error("A read-only export must not write an audit event");
    },
  },
});

mock.module("@/lib/request-response-logging", {
  namedExports: {
    withApiLogging(_name, handler) {
      return handler;
    },
  },
});

const { NextRequest } = await import("next/server");
const { GET } = await import("../../src/app/api/billing/agency-claims/route.ts");

function aggregate(overrides) {
  return {
    agencyLedgerAccountId: "account-test",
    mappingCategory: "receivable",
    glCodeSnapshot: "AR-OLD",
    costCenterCodeSnapshot: "CC-OLD",
    snapshotStatus: "COMPLETE",
    approvedCents: 0n,
    remittedCents: 0n,
    unappliedCents: 0n,
    adjustmentCents: 0n,
    ledgerBalanceCents: 0n,
    openBatchExceptionCount: 0n,
    missingImmutableEventCount: 0n,
    unsupportedLedgerEntryCount: 0n,
    ...overrides,
  };
}

async function exportCsv() {
  const response = await GET(new NextRequest("https://app.test/api/billing/agency-claims?centerId=center-test&exportReconciliation=true"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "text/csv; charset=utf-8");
  return response.text();
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(cell);
      cell = "";
    } else if (character === "\n") {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

test("immutable snapshot rows remain stable after current mappings change", async () => {
  snapshotAggregates = [
    aggregate({
      mappingCategory: "adjustment",
      glCodeSnapshot: "ADJ-OLD",
      adjustmentCents: 500n,
      ledgerBalanceCents: 500n,
    }),
    aggregate({
      mappingCategory: "cash",
      glCodeSnapshot: "CASH-OLD",
      remittedCents: 4_000n,
      unappliedCents: 1_000n,
      ledgerBalanceCents: -5_000n,
      openBatchExceptionCount: 1n,
    }),
    aggregate({
      approvedCents: 10_000n,
      ledgerBalanceCents: 10_000n,
    }),
  ];

  const before = await exportCsv();
  account.agencyProgram.receivableGlCode = "AR-CURRENT-B";
  account.agencyProgram.cashGlCode = "CASH-CURRENT-B";
  account.agencyProgram.adjustmentGlCode = "ADJ-CURRENT-B";
  account.agencyProgram.costCenterCode = "CC-CURRENT-B";
  const after = await exportCsv();
  assert.equal(after, before);
  assert.doesNotMatch(after, /CURRENT-[AB]/);

  const rows = parseCsv(after);
  assert.deepEqual(rows[0].slice(0, 16), originalHeaders);
  assert.deepEqual(rows.slice(1).map((row) => row[16]), ["receivable", "cash", "adjustment"]);
  assert.equal(rows[1][4], "AR-OLD");
  assert.equal(rows[1][5], "");
  assert.equal(rows[2][4], "");
  assert.equal(rows[2][5], "CASH-OLD");
  assert.equal(rows[3][6], "ADJ-OLD");
  assert.deepEqual(rows.slice(1).map((row) => row[20]), ["COMPLETE", "COMPLETE", "COMPLETE"]);

  const sum = (column) => rows.slice(1).reduce((total, row) => total + Number(row[column]), 0);
  assert.equal(sum(8), 100);
  assert.equal(sum(9), 40);
  assert.equal(sum(10), 10);
  assert.equal(sum(11), 5);
  assert.equal(sum(12), 55);
  assert.equal(sum(13), 55);
  assert.equal(sum(14), 0);
  assert.equal(sum(15), 1);
});

test("unknown, missing, unsupported, and control states stay explicit", async () => {
  snapshotAggregates = [
    aggregate({
      mappingCategory: "account_control_difference",
      glCodeSnapshot: null,
      costCenterCodeSnapshot: null,
      snapshotStatus: "ACCOUNT_CONTROL_DIFFERENCE",
      ledgerBalanceCents: 200n,
      missingImmutableEventCount: 1n,
    }),
    aggregate({
      mappingCategory: "unsupported",
      glCodeSnapshot: "MISC-OLD",
      costCenterCodeSnapshot: "CC-MISC",
      snapshotStatus: "UNSUPPORTED_LEDGER_TYPE",
      ledgerBalanceCents: 100n,
      unsupportedLedgerEntryCount: 1n,
    }),
    aggregate({
      mappingCategory: "cash",
      glCodeSnapshot: null,
      costCenterCodeSnapshot: null,
      snapshotStatus: "MISSING_IMMUTABLE_EVENT",
      remittedCents: 500n,
      missingImmutableEventCount: 1n,
    }),
    aggregate({
      mappingCategory: "cash",
      glCodeSnapshot: null,
      costCenterCodeSnapshot: null,
      snapshotStatus: "UNKNOWN_AT_EVENT_TIME",
      ledgerBalanceCents: -100n,
    }),
    aggregate({
      mappingCategory: "receivable",
      glCodeSnapshot: null,
      costCenterCodeSnapshot: null,
      snapshotStatus: "UNKNOWN_AT_EVENT_TIME",
      approvedCents: 2_000n,
      ledgerBalanceCents: 2_000n,
    }),
  ];

  const rows = parseCsv(await exportCsv());
  const byCategory = new Map(rows.slice(1).map((row) => [row[16], row]));
  const cashRows = rows.slice(1).filter((row) => row[16] === "cash");
  const missingCash = cashRows.find((row) => row[20] === "MISSING_IMMUTABLE_EVENT");
  const unknownCash = cashRows.find((row) => row[20] === "UNKNOWN_AT_EVENT_TIME");
  assert.equal(byCategory.get("receivable")[4], "UNKNOWN_AT_EVENT_TIME");
  assert.equal(byCategory.get("receivable")[7], "UNKNOWN_AT_EVENT_TIME");
  assert.equal(byCategory.get("receivable")[20], "UNKNOWN_AT_EVENT_TIME");
  assert.equal(cashRows.length, 2);
  assert.equal(missingCash[5], "MISSING_IMMUTABLE_EVENT");
  assert.equal(missingCash[7], "MISSING_IMMUTABLE_EVENT");
  assert.equal(missingCash[18], "MISSING_IMMUTABLE_EVENT");
  assert.equal(missingCash[19], "missing_immutable_event");
  assert.equal(missingCash[14], "5");
  assert.equal(unknownCash[5], "UNKNOWN_AT_EVENT_TIME");
  assert.equal(unknownCash[20], "UNKNOWN_AT_EVENT_TIME");
  assert.equal(byCategory.get("unsupported")[17], "MISC-OLD");
  assert.equal(byCategory.get("unsupported")[20], "UNSUPPORTED_LEDGER_TYPE");
  assert.equal(byCategory.get("account_control_difference")[13], "2");
  assert.equal(byCategory.get("account_control_difference")[14], "2");
  assert.equal(byCategory.get("account_control_difference")[20], "ACCOUNT_CONTROL_DIFFERENCE");
  assert.doesNotMatch(rows.flat().join("|"), /CURRENT-[AB]/);
});
