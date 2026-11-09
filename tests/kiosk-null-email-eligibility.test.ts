import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test, { type TestContext } from "node:test";
import ts from "typescript";
import { APP_REVIEW_RESERVED_EMAILS } from "../src/lib/app-review-targeting";
import * as attendance from "../src/lib/attendance-state";
import * as enrollment from "../src/lib/enrollment-status";
import * as kiosk from "../src/lib/kiosk";
import * as billingReminders from "../src/lib/kiosk-billing-reminders";

type RecordValue = Record<string, unknown>;
type RouteKind = "lookup" | "check";
type CredentialKind = "pin" | "qr";
type Reply = { status: number; body: RecordValue; headers?: Record<string, string> };
// Node 24 supplies SQLite; this repository's older Node typings do not declare it.
type SqlValue = string | number | null;
type FixtureDatabase = {
  exec(sql: string): void;
  prepare(sql: string): { run(...values: SqlValue[]): unknown; all(...values: SqlValue[]): Array<Record<string, SqlValue>> };
  close(): void;
};
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as { DatabaseSync: new (path: string) => FixtureDatabase };
const fixturePin = "2468"; // Fictional test input, never a person's credential.
const compiledRoutes = Object.fromEntries((["lookup", "check"] as const).map(kind => [kind,
  ts.transpileModule(readFileSync(`src/app/api/kiosk/${kind}/route.ts`, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText,
]));

function record(value: unknown): RecordValue {
  assert.ok(value && typeof value === "object" && !Array.isArray(value));
  return value as RecordValue;
}

// Translate only the predicates used by these routes, rejecting unsupported fields.
// SQLite evaluates IN/NOT/OR with real SQL NULL semantics; the fixture does not
// silently return a guardian regardless of the route's Prisma where clause.
function sqlPredicate(where: RecordValue, parameters: Array<string | number | null>, columns: Record<string, string>): string {
  return Object.entries(where).map(([key, value]) => {
    if (["AND", "OR", "NOT"].includes(key)) {
      const branches = (Array.isArray(value) ? value : [value]).map(item => sqlPredicate(record(item), parameters, columns));
      assert.ok(branches.length);
      return key === "NOT" ? branches.map(branch => `NOT (${branch})`).join(" AND ") : `(${branches.join(` ${key} `)})`;
    }
    if (key === "family") return sqlPredicate(record(value), parameters, { centerId: "centerId" });
    if (key === "user") {
      const relation = record(value);
      assert.deepEqual(Object.keys(relation), ["is"]);
      return `(userPresent = 1 AND (${sqlPredicate(record(relation.is), parameters, { email: "userEmail" })}))`;
    }
    const column = columns[key]; assert.ok(column, `Unsupported fixture predicate: ${key}`);
    if (value === null) return `${column} IS NULL`;
    if (typeof value === "string") { parameters.push(value); return `${column} = ?`; }
    const filter = record(value);
    assert.ok(Object.keys(filter).every(name => ["in", "notIn", "not", "mode"].includes(name)));
    if ("not" in filter) { assert.equal(filter.not, null); return `${column} IS NOT NULL`; }
    const values = filter.in ?? filter.notIn;
    assert.ok(Array.isArray(values) && values.length && values.every(item => typeof item === "string"));
    if (filter.mode !== undefined) assert.equal(filter.mode, "insensitive");
    parameters.push(...values);
    return `${column}${filter.mode === "insensitive" ? " COLLATE NOCASE" : ""} ${filter.notIn ? "NOT IN" : "IN"} (${values.map(() => "?").join(",")})`;
  }).join(" AND ") || "1";
}

function harness(t: TestContext, kind: RouteKind, options: { email?: string | null; userEmail?: string | null; noHash?: boolean; limited?: boolean; closed?: boolean } = {}) {
  const previousSecret = process.env.PIN_HASH_SECRET;
  process.env.PIN_HASH_SECRET = "fictional-null-email-kiosk-test-secret";
  t.after(() => { if (previousSecret === undefined) delete process.env.PIN_HASH_SECRET; else process.env.PIN_HASH_SECRET = previousSecret; });
  const pinHash = options.noHash ? null : kiosk.hashGuardianPin("fixture-guardian", fixturePin);
  const setAt = new Date("2026-10-01T12:00:00.000Z");
  const database = new DatabaseSync(":memory:");
  t.after(() => database.close());
  database.exec(`
    CREATE TABLE guardians (id TEXT, email TEXT, pinHash TEXT, centerId TEXT, userEmail TEXT, userPresent INTEGER);
    CREATE TABLE children (id TEXT, familyId TEXT, enrollmentStatus TEXT, classroomId TEXT, classroomCenterId TEXT);
    INSERT INTO children VALUES
      ('child-a','family-a','enrolled','class-a','school-a'),
      ('child-inactive','family-a','withdrawn','class-a','school-a'),
      ('child-wrong-school','family-a','enrolled','class-b','school-b'),
      ('child-unassigned','family-a','enrolled',NULL,NULL),
      ('child-other-family','family-b','enrolled','class-a','school-a');
  `);
  database.prepare("INSERT INTO guardians VALUES (?,?,?,?,?,?)").run("fixture-guardian", options.email ?? null, pinHash, "school-a", options.userEmail ?? null, options.userEmail ? 1 : 0);
  database.prepare("INSERT INTO guardians VALUES (?,?,?,?,?,?)").run("other-school-guardian", "other@example.test", kiosk.hashGuardianPin("other-school-guardian", "9753"), "school-b", null, 0);
  let guardianQueries = 0, transactions = 0, audits = 0, attendanceReads = 0;
  const rateLimits: RecordValue[] = [];
  const selectGuardians = async (query: unknown) => {
    guardianQueries++;
    const args = record(query), parameters: Array<string | number | null> = [];
    const predicate = sqlPredicate(record(args.where), parameters, { id: "id", email: "email", checkInPinHash: "pinHash" });
    const rows = database.prepare(`SELECT * FROM guardians WHERE ${predicate} ORDER BY rowid`).all(...parameters);
    const familySelect = record(record(record(args.include).family).select);
    const childrenWhere = record(record(familySelect.children).where);
    return rows.map(row => {
      const familyId = row.id === "fixture-guardian" ? "family-a" : "other-school-family";
      const childParameters: Array<string | number | null> = [familyId];
      const childPredicate = sqlPredicate(childrenWhere, childParameters, { id: "id", enrollmentStatus: "enrollmentStatus", classroomId: "classroomId" });
      const children = database.prepare(`SELECT * FROM children WHERE familyId = ? AND (${childPredicate})`).all(...childParameters);
      return {
        id: row.id, fullName: "Fictional Guardian", relation: "Parent", checkInPinHash: row.pinHash, checkInPinSetAt: setAt,
        family: { id: familyId, name: "Fictional Family", custodyNotes: null, billingAccount: null,
          children: children.map(child => ({ id: child.id, fullName: `Fictional ${child.id}`, preferredName: null, ageGroup: "preschool",
            classroom: child.classroomId ? { id: child.classroomId, name: "Fictional Classroom", centerId: child.classroomCenterId } : null })),
        },
      };
    });
  };
  // No Prisma client is imported. Every route dependency capable of live I/O is
  // replaced; the transaction callback is NEVER invoked and no attendance exists.
  const prisma = {
    guardian: { findMany: selectGuardians, findFirst: async (query: unknown) => (await selectGuardians(query))[0] ?? null },
    center: { findFirst: async (query: unknown) => {
      const where = record(record(query).where);
      assert.deepEqual(where.status, { not: "closed" });
      return options.closed ? null : { id: where.id, name: "Fictional School", email: null, crmLocationId: null, timezone: "America/New_York", customFields: {}, organization: { tenantId: "fixture-tenant" } };
    } },
    checkInOutLog: { findMany: async (query: unknown) => {
      attendanceReads++;
      assert.deepEqual(record(record(record(query).where).childId).in, ["child-a"]);
      return [];
    } },
    $transaction: async (callback: unknown) => { assert.equal(typeof callback, "function"); transactions++; return []; },
  };
  const requireStub = (name: string) => {
    if (name === "next/server") return { NextResponse: { json: (body: RecordValue, init?: { status?: number; headers?: Record<string, string> }) => ({ body, status: init?.status ?? 200, headers: init?.headers }) } };
    if (name === "@prisma/client") return { PaymentStatus: { OPEN: "OPEN" } };
    if (name === "@/lib/app-review-targeting") return { APP_REVIEW_RESERVED_EMAILS };
    if (name === "@/lib/attendance-state") return attendance;
    if (name === "@/lib/enrollment-status") return enrollment;
    if (name === "@/lib/kiosk") return kiosk;
    if (name === "@/lib/kiosk-billing-reminders") return billingReminders;
    if (name === "@/lib/prisma") return { prisma };
    if (name === "@/lib/rate-limit") return {
      requestIp: (headers: Headers) => headers.get("x-forwarded-for"), retryAfterSeconds: () => 60,
      checkPersistentRateLimit: async (input: RecordValue) => { rateLimits.push(input); return { ok: !options.limited, resetAt: new Date(Date.now() + 60_000) }; },
    };
    if (name === "@/lib/audit") return { writeSystemAuditLog: async () => { audits++; } };
    if (name === "@/lib/daily-report-email") return { sendCheckoutDailyReportEmail: async () => assert.fail("No email may be sent by this fixture") };
    if (name === "@/lib/request-response-logging") return { withApiLogging: (_method: string, handler: unknown) => handler };
    throw new Error(`Unexpected route dependency: ${name}`);
  };
  const route = { exports: {} as { POST: (request: Request) => Promise<Reply> } };
  new Function("require", "module", "exports", compiledRoutes[kind])(requireStub, route, route.exports);
  const qrToken = kiosk.createGuardianQrToken({ centerId: "school-a", guardianId: "fixture-guardian", checkInPinSetAt: setAt, checkInPinHash: pinHash ?? kiosk.hashGuardianPin("fixture-guardian", fixturePin) });
  assert.ok(qrToken);
  return {
    rateLimits, qrToken, counts: () => ({ guardianQueries, transactions, audits, attendanceReads }),
    request: (credential: CredentialKind, body: RecordValue = {}) => route.exports.POST(new Request(`https://example.test/api/kiosk/${kind}`, {
      method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "192.0.2.22" },
      body: JSON.stringify({ centerId: "school-a", ...(credential === "pin" ? { pin: fixturePin } : { qrToken }), type: "check_in", childIds: ["child-a"], ...body }),
    })),
  };
}

for (const kind of ["lookup", "check"] as const) for (const credential of ["pin", "qr"] as const) {
  for (const identity of [
    { label: "null email without linked user", email: null },
    { label: "ordinary email", email: "guardian@example.test" },
    { label: "null email with ordinary linked user", email: null, userEmail: "parent@example.test" },
  ]) test(`${kind}/${credential}: ${identity.label} reaches only its enrolled school child`, async t => {
    const h = harness(t, kind, identity), response = await h.request(credential);
    assert.equal(response.status, kind === "lookup" ? 200 : 201);
    assert.deepEqual((response.body.children as Array<{ id: string }>).map(child => child.id), ["child-a"]);
    assert.deepEqual(response.body.verification, { method: credential });
    assert.equal(h.counts().transactions, kind === "check" ? 1 : 0);
    assert.equal(h.counts().audits, kind === "check" ? 1 : 0);
    assert.deepEqual(h.rateLimits, [{ key: `kiosk-${kind}:school-a:192.0.2.22`, limit: kind === "lookup" ? 12 : 18, windowMs: 60_000 }]);
  });

  for (const reserved of APP_REVIEW_RESERVED_EMAILS) for (const identity of [
    { label: "reserved guardian email", email: reserved },
    { label: "case-insensitive reserved guardian email", email: reserved.toUpperCase() },
    { label: "null guardian email linked to reserved user", email: null, userEmail: reserved.toUpperCase() },
    { label: "ordinary guardian email linked to reserved user", email: "guardian@example.test", userEmail: reserved },
  ]) test(`${kind}/${credential}: excludes ${identity.label} (${reserved})`, async t => {
    const h = harness(t, kind, identity), response = await h.request(credential);
    assert.equal(response.status, 401);
    assert.deepEqual(response.body, { ok: false, error: `${credential === "pin" ? "PIN" : "QR code"} was not recognized for this school.` });
    assert.deepEqual(h.counts(), { guardianQueries: 1, transactions: 0, audits: 0, attendanceReads: 0 });
  });

  test(`${kind}/${credential}: rejects another school's credential before attendance`, async t => {
    const h = harness(t, kind), response = await h.request(credential, { centerId: "school-b" });
    assert.equal(response.status, 401);
    assert.equal(h.counts().guardianQueries, credential === "qr" ? 0 : 1);
    assert.equal(h.counts().attendanceReads, 0); assert.equal(h.counts().transactions, 0); assert.equal(h.counts().audits, 0);
  });

  test(`${kind}/${credential}: missing stored hash remains ineligible`, async t => {
    const h = harness(t, kind, { noHash: true }), response = await h.request(credential);
    assert.equal(response.status, 401); assert.equal(h.counts().transactions, 0);
  });

  test(`${kind}/${credential}: incorrect credentials remain rejected`, async t => {
    const h = harness(t, kind);
    const response = await h.request(credential, credential === "pin" ? { pin: "1357" } : { qrToken: `${h.qrToken.slice(0, -1)}${h.qrToken.endsWith("0") ? "1" : "0"}` });
    assert.equal(response.status, 401); assert.equal(h.counts().attendanceReads, 0); assert.equal(h.counts().transactions, 0); assert.equal(h.counts().audits, 0);
  });

  test(`${kind}/${credential}: persistent rate limit still rejects before guardian queries`, async t => {
    const h = harness(t, kind, { limited: true }), response = await h.request(credential);
    assert.equal(response.status, 429); assert.equal(response.headers?.["Retry-After"], "60");
    assert.deepEqual(h.counts(), { guardianQueries: 0, transactions: 0, audits: 0, attendanceReads: 0 });
  });

  test(`${kind}/${credential}: closed school remains unavailable`, async t => {
    const h = harness(t, kind, { closed: true }), response = await h.request(credential);
    assert.equal(response.status, 404); assert.equal(h.counts().guardianQueries, 0);
  });

  if (kind === "check") for (const childIds of [["child-other-family"], ["child-wrong-school"], ["child-inactive"], ["child-unassigned"], ["child-a", "child-other-family"]]) {
    test(`${kind}/${credential}: rejects unauthorized selection ${childIds.join(",")}`, async t => {
      const h = harness(t, kind), response = await h.request(credential, { childIds });
      assert.equal(response.status, 403);
      assert.equal(h.counts().attendanceReads, 0); assert.equal(h.counts().transactions, 0); assert.equal(h.counts().audits, 0);
    });
  }
}
