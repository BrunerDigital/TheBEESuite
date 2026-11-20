import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { type TestContext } from "node:test";
import ts from "typescript";
import * as attendance from "../src/lib/attendance-state";
import * as enrollment from "../src/lib/enrollment-status";
import * as kiosk from "../src/lib/kiosk";
import * as pickups from "../src/lib/kiosk-authorized-pickup";
import * as billing from "../src/lib/kiosk-billing-reminders";

type Row = Record<string, unknown>;
const pin = "8642"; // Synthetic fixture only.
const compiled = Object.fromEntries((["lookup", "check"] as const).map((kind) => [kind,
  ts.transpileModule(readFileSync(`src/app/api/kiosk/${kind}/route.ts`, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText,
]));

function fixture(t: TestContext) {
  const oldSecret = process.env.PIN_HASH_SECRET;
  process.env.PIN_HASH_SECRET = "fictional-pickup-kiosk-secret";
  t.after(() => { if (oldSecret === undefined) delete process.env.PIN_HASH_SECRET; else process.env.PIN_HASH_SECRET = oldSecret; });
  const child = (id: string, enrollmentStatus = "enrolled", classroomCenterId = "school-a") => ({
    id, fullName: `Fictional ${id}`, preferredName: null, ageGroup: "preschool", enrollmentStatus,
    classroomId: "room-a", classroom: { id: "room-a", name: "Fictional room", centerId: classroomCenterId },
  });
  return {
    id: "pickup-a", fullName: "Fictional Uncle", relation: "Uncle",
    customFields: {
      retained: "source data",
      kioskCredential: { enabled: true, pinHash: kiosk.hashGuardianPin("pickup:pickup-a", pin), pinSetAt: "2026-11-20T12:00:00.000Z", pinSetById: "reviewer-a" },
      pickupAuthorization: { source: "reviewed_registration_forms", childIds: ["child-a", "child-b"], requirePictureId: true },
    },
    family: { id: "family-a", name: "Fictional family", centerId: "school-a", custodyNotes: null,
      children: [child("child-a"), child("child-b"), child("child-sibling"), child("child-inactive", "withdrawn"), child("child-other-school", "enrolled", "school-b")] },
  };
}

function harness(kind: "lookup" | "check", entries: ReturnType<typeof fixture>[], options: { guardianCollision?: boolean; checkedIn?: boolean } = {}) {
  const logs: Row[] = [], attendanceWrites: Row[] = [], audits: Row[] = [], emails: Row[] = [], queries: Row[] = [];
  let attendanceReads = 0, transactions = 0;
  const db = {
    guardian: { findMany: async () => options.guardianCollision ? [{ id: "guardian-a", checkInPinHash: kiosk.hashGuardianPin("guardian-a", pin), family: { children: [] } }] : [] },
    authorizedPickup: { findMany: async (query: Row) => { queries.push(query); return entries; } },
    center: { findFirst: async () => ({ id: "school-a", name: "Fictional school", timezone: "America/New_York", customFields: {}, organization: { tenantId: "tenant-a" } }) },
    checkInOutLog: {
      findMany: async () => { attendanceReads++; return options.checkedIn ? [{ childId: "child-b", type: "check_in", occurredAt: new Date() }] : []; },
      create: async ({ data }: { data: Row }) => { logs.push(data); return { id: `log-${logs.length}`, ...data }; },
    },
    attendanceRecord: {
      findFirst: async () => null,
      create: async ({ data }: { data: Row }) => { attendanceWrites.push(data); return data; },
    },
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) => { transactions++; return callback(db); },
  };
  const requireStub = (name: string) => {
    if (name === "next/server") return { NextResponse: { json: (body: Row, init?: { status?: number }) => ({ status: init?.status ?? 200, body }) } };
    if (name === "@prisma/client") return { PaymentStatus: { OPEN: "OPEN" } };
    if (name === "@/lib/app-review-targeting") return { APP_REVIEW_RESERVED_EMAILS: [] };
    if (name === "@/lib/attendance-state") return attendance;
    if (name === "@/lib/enrollment-status") return enrollment;
    if (name === "@/lib/kiosk") return kiosk;
    if (name === "@/lib/kiosk-authorized-pickup") return pickups;
    if (name === "@/lib/kiosk-billing-reminders") return billing;
    if (name === "@/lib/prisma") return { prisma: db };
    if (name === "@/lib/rate-limit") return { requestIp: () => "192.0.2.1", checkPersistentRateLimit: async () => ({ ok: true }), retryAfterSeconds: () => 60 };
    if (name === "@/lib/audit") return { writeSystemAuditLog: async (data: Row) => { audits.push(data); } };
    if (name === "@/lib/daily-report-email") return { sendCheckoutDailyReportEmail: async (data: Row) => { emails.push(data); return { attempted: false }; } };
    if (name === "@/lib/request-response-logging") return { withApiLogging: (_method: string, handler: unknown) => handler };
    throw new Error(`Unexpected external dependency: ${name}`);
  };
  const routeModule = { exports: {} as { POST: (request: Request) => Promise<{ status: number; body: Row }> } };
  new Function("require", "module", "exports", compiled[kind])(requireStub, routeModule, routeModule.exports);
  return { logs, attendanceWrites, audits, emails, queries, counts: () => ({ attendanceReads, transactions }),
    request: (body: Row = {}) => routeModule.exports.POST(new Request(`https://example.test/api/kiosk/${kind}`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ centerId: "school-a", pin, type: "check_in", childIds: ["child-a"], ...body }),
    })),
  };
}

test("pickup PIN lookup shows only explicit eligible children, identity warning and no billing", async (t) => {
  const entry = fixture(t);
  entry.customFields.pickupAuthorization.childIds.push("child-inactive", "child-other-school");
  const h = harness("lookup", [entry]);
  const response = await h.request();
  assert.equal(response.status, 200);
  assert.equal(response.body.actorType, "authorized_pickup");
  assert.equal(response.body.pickupId, entry.id);
  assert.deepEqual(response.body.guardian, { id: entry.id, fullName: entry.fullName, relation: "Uncle" });
  assert.deepEqual((response.body.children as Array<Row>).map((child) => child.id), ["child-a", "child-b"]);
  assert.equal(Object.hasOwn(response.body, "billing"), false);
  assert.match(JSON.stringify(response.body.warnings), /picture identification/);
  assert.deepEqual(h.queries[0].where, { family: { centerId: "school-a" }, customFields: { path: ["kioskCredential", "enabled"], equals: true } });
  assert.equal(JSON.stringify(response.body).includes("pinHash"), false);
  assert.equal(h.counts().transactions, 0);
});

for (const [label, mutate] of [
  ["disabled credential", (entry: ReturnType<typeof fixture>) => { entry.customFields.kioskCredential.enabled = false; }],
  ["missing metadata", (entry: ReturnType<typeof fixture>) => { entry.customFields = {} as never; }],
  ["unknown child scope", (entry: ReturnType<typeof fixture>) => { entry.customFields.pickupAuthorization.childIds.push("child-other-family"); }],
  ["no explicit child scope", (entry: ReturnType<typeof fixture>) => { entry.customFields.pickupAuthorization.childIds = []; }],
  ["missing picture ID requirement", (entry: ReturnType<typeof fixture>) => { entry.customFields.pickupAuthorization.requirePictureId = false; }],
  ["unreviewed source", (entry: ReturnType<typeof fixture>) => { entry.customFields.pickupAuthorization.source = "emergency_contact"; }],
  ["malformed hash", (entry: ReturnType<typeof fixture>) => { entry.customFields.kioskCredential.pinHash = "not-a-hash"; }],
  ["missing setter", (entry: ReturnType<typeof fixture>) => { entry.customFields.kioskCredential.pinSetById = ""; }],
  ["wrong school", (entry: ReturnType<typeof fixture>) => { entry.family.centerId = "school-b"; }],
] as const) for (const kind of ["lookup", "check"] as const) test(`${kind}: ${label} fails before attendance or writes`, async (t) => {
  const entry = fixture(t); mutate(entry);
  const h = harness(kind, [entry]), response = await h.request();
  assert.equal(response.status, 401);
  assert.deepEqual(h.counts(), { attendanceReads: 0, transactions: 0 });
  assert.deepEqual(h.audits, []); assert.deepEqual(h.emails, []);
});

test("incorrect PIN and cross-ID hash cannot authorize a pickup", async (t) => {
  const entry = fixture(t);
  assert.equal(pickups.authorizedPickupKioskActor(entry, "school-a", "1357"), null);
  entry.customFields.kioskCredential.pinHash = kiosk.hashGuardianPin(entry.id, pin);
  assert.equal(pickups.authorizedPickupKioskActor(entry, "school-a", pin), null);
});

for (const kind of ["lookup", "check"] as const) for (const actor of ["pickup", "guardian"] as const) test(`${kind}: ${actor} PIN collision fails closed`, async (t) => {
  const entry = fixture(t);
  const second = { ...entry, id: "pickup-b", customFields: { ...entry.customFields, kioskCredential: { ...entry.customFields.kioskCredential, pinHash: kiosk.hashGuardianPin("pickup:pickup-b", pin) } } };
  const h = harness(kind, actor === "pickup" ? [entry, second] : [entry], { guardianCollision: actor === "guardian" });
  assert.equal((await h.request()).status, 409);
  assert.deepEqual(h.counts(), { attendanceReads: 0, transactions: 0 });
});

test("tampered sibling selection is rejected before attendance reads or writes", async (t) => {
  const h = harness("check", [fixture(t)]);
  const response = await h.request({ childIds: ["child-a", "child-sibling"] });
  assert.equal(response.status, 403);
  assert.deepEqual(response.body.unauthorizedChildIds, ["child-sibling"]);
  assert.deepEqual(h.counts(), { attendanceReads: 0, transactions: 0 });
});

for (const type of ["check_in", "check_out"] as const) test(`pickup ${type} writes only selected authorized child with pickup evidence`, async (t) => {
  const entry = fixture(t), h = harness("check", [entry], { checkedIn: type === "check_out" });
  const response = await h.request({ type, childIds: ["child-b"] });
  assert.equal(response.status, 201);
  assert.deepEqual((response.body.children as Array<Row>).map((child) => child.id), ["child-b"]);
  assert.equal(h.logs.length, 1); assert.equal(h.attendanceWrites.length, 1);
  assert.equal(h.logs[0].guardianId, null);
  assert.equal(h.logs[0].pickupName, entry.fullName);
  assert.equal(h.logs[0].childId, "child-b");
  assert.deepEqual({ ...(h.logs[0].metadata as Row) }, {
    verificationMethod: "pin", qrVerified: false, pinVerified: true, credentialConfirmationMethod: "pin_verified",
    credentialHolderName: entry.fullName, credentialConfirmedAt: h.logs[0].occurredAt instanceof Date ? h.logs[0].occurredAt.toISOString() : "",
    latePickup: response.body.latePickup, latePickupCutoff: "18:00", pickupAuthorizationWarning: true,
    actorType: "authorized_pickup", pickupId: entry.id, requirePictureId: true, timeZone: "America/New_York",
  });
  assert.equal((h.audits[0].metadata as Row).pickupId, entry.id);
  assert.equal((h.audits[0].metadata as Row).guardianId, null);
  assert.deepEqual(h.emails.map((email) => email.childId), type === "check_out" ? ["child-b"] : []);
});
