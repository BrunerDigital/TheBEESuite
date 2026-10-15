import assert from "node:assert/strict";
import test from "node:test";
import {
  clearConfirmedOfflinePaymentOperation,
  getOrCreateOfflinePaymentOperation,
  OfflinePaymentOperationError,
  readOfflinePaymentOperation,
  type OfflinePaymentOperationScope,
  type OfflinePaymentOperationStorage,
} from "../src/lib/offline-payment-operation";

const scope = { userId: "user-1", centerId: "school-1", familyId: "family-1" };
const firstId = "00000000-0000-4000-8000-000000000001";
const secondId = "00000000-0000-4000-8000-000000000002";
const first = () => firstId;

function fixture(values = new Map<string, string>()) {
  const storage: OfflinePaymentOperationStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
  };
  return { values, storage };
}

const errorCode = (code: OfflinePaymentOperationError["code"]) => (error: unknown) => error instanceof OfflinePaymentOperationError && error.code === code;

test("read-only recovery does not create an operation or write storage", () => {
  const f = fixture();
  assert.equal(readOfflinePaymentOperation(f.storage, scope), null);
  assert.equal(f.values.size, 0);
});

test("operation survives reload with a new module instance and storage adapter", async () => {
  const original = fixture();
  const operation = getOrCreateOfflinePaymentOperation(original.storage, scope, first);
  const reloaded = fixture(new Map(original.values));
  const moduleUrl = new URL("../src/lib/offline-payment-operation.ts", import.meta.url);
  moduleUrl.searchParams.set("testInstance", "reload");
  const freshModule = await import(moduleUrl.href) as typeof import("../src/lib/offline-payment-operation");
  assert.deepEqual(freshModule.getOrCreateOfflinePaymentOperation(reloaded.storage, scope, () => { throw new Error("must not rotate"); }), operation);
  assert.deepEqual(freshModule.readOfflinePaymentOperation(reloaded.storage, scope), operation);
});

test("user, school and family scopes remain distinct", () => {
  const f = fixture();
  getOrCreateOfflinePaymentOperation(f.storage, scope, first);
  for (const changed of [{ userId: "user-2" }, { centerId: "school-2" }, { familyId: "family-2" }]) {
    assert.equal(readOfflinePaymentOperation(f.storage, { ...scope, ...changed }), null);
    assert.equal(getOrCreateOfflinePaymentOperation(f.storage, { ...scope, ...changed }, () => secondId).requestId, secondId);
  }
  assert.equal(f.values.size, 4);
  assert.equal(readOfflinePaymentOperation(f.storage, scope)?.requestId, firstId);
});

test("creating the billing account and changing cash/check methods does not rotate family identity", () => {
  const f = fixture();
  const cashScope = { ...scope, method: "cash", billingAccountId: null };
  const checkScope = { ...scope, method: "check", billingAccountId: "created-account" };
  const operation = getOrCreateOfflinePaymentOperation(f.storage, cashScope, first);
  assert.deepEqual(getOrCreateOfflinePaymentOperation(f.storage, checkScope, () => secondId), operation);
  assert.equal(f.values.size, 1);
});

test("storage contains only version, opaque scope IDs and request identity", () => {
  const f = fixture();
  getOrCreateOfflinePaymentOperation(f.storage, {
    ...scope, billingAccountId: "account-1", amountCents: 10000, notes: "private notes", name: "Private Name", method: "cash",
  } as OfflinePaymentOperationScope, first);
  const [key, raw] = [...f.values][0];
  assert.deepEqual(Object.keys(JSON.parse(raw)).sort(), ["version", "userId", "centerId", "familyId", "requestId"].sort());
  assert.doesNotMatch(key + raw, /10000|private|Private|notes|amount|method|account-1/);
});

test("only the explicitly confirmed matching operation can be cleared", () => {
  const f = fixture();
  getOrCreateOfflinePaymentOperation(f.storage, scope, first);
  assert.equal(clearConfirmedOfflinePaymentOperation(f.storage, scope, { requestId: secondId, receiptConfirmed: true }), false);
  assert.equal(readOfflinePaymentOperation(f.storage, scope)?.requestId, firstId);
  assert.throws(() => clearConfirmedOfflinePaymentOperation(f.storage, scope, { requestId: firstId, receiptConfirmed: false } as never), errorCode("unconfirmed_receipt"));
  assert.equal(clearConfirmedOfflinePaymentOperation(f.storage, scope, { requestId: firstId, receiptConfirmed: true }), true);
  assert.equal(readOfflinePaymentOperation(f.storage, scope), null);
  assert.equal(getOrCreateOfflinePaymentOperation(f.storage, scope, () => secondId).requestId, secondId);
  assert.equal(clearConfirmedOfflinePaymentOperation(f.storage, scope, { requestId: firstId, receiptConfirmed: true }), false);
  assert.equal(readOfflinePaymentOperation(f.storage, scope)?.requestId, secondId);
});

test("a receipt from another scope cannot clear the family's operation", () => {
  const f = fixture();
  getOrCreateOfflinePaymentOperation(f.storage, scope, first);
  for (const changed of [{ userId: "user-2" }, { centerId: "school-2" }, { familyId: "family-2" }]) {
    assert.equal(clearConfirmedOfflinePaymentOperation(f.storage, { ...scope, ...changed }, { requestId: firstId, receiptConfirmed: true }), false);
    assert.equal(readOfflinePaymentOperation(f.storage, scope)?.requestId, firstId);
  }
});

test("storage read failures never create or overwrite an operation", () => {
  let writes = 0;
  const storage = { getItem: () => { throw new Error("blocked"); }, setItem: () => { writes++; }, removeItem: () => undefined };
  assert.throws(() => getOrCreateOfflinePaymentOperation(storage, scope, first), errorCode("storage_unavailable"));
  assert.equal(writes, 0);
});

test("write failures and silent write failures stop submission", () => {
  for (const write of [() => { throw new Error("quota"); }, () => undefined]) {
    const storage = { getItem: () => null, setItem: write, removeItem: () => undefined };
    assert.throws(() => getOrCreateOfflinePaymentOperation(storage, scope, first), errorCode("storage_unavailable"));
  }
});

test("a failed read-back preserves any stored token for later recovery", () => {
  const f = fixture();
  let reads = 0;
  const storage = { ...f.storage, getItem: (key: string) => { if (++reads === 2) throw new Error("blocked"); return f.storage.getItem(key); } };
  assert.throws(() => getOrCreateOfflinePaymentOperation(storage, scope, first), errorCode("storage_unavailable"));
  assert.equal(readOfflinePaymentOperation(f.storage, scope)?.requestId, firstId);
});

test("corrupt, wrong-scope, unknown-version or extra-field records never rotate silently", () => {
  const f = fixture();
  const valid = getOrCreateOfflinePaymentOperation(f.storage, scope, first);
  const key = [...f.values.keys()][0];
  for (const corrupted of ["", "{", "null", "[]", JSON.stringify({ ...valid, version: 2 }), JSON.stringify({ ...valid, userId: "other" }), JSON.stringify({ ...valid, requestId: "bad" }), JSON.stringify({ ...valid, notes: "unexpected" })]) {
    f.values.set(key, corrupted);
    assert.throws(() => getOrCreateOfflinePaymentOperation(f.storage, scope, () => secondId), errorCode("corrupt_operation"));
    assert.equal(f.values.get(key), corrupted);
  }
});

test("unavailable or invalid random identities fail before writing", () => {
  const f = fixture();
  for (const generate of [() => "bad", () => { throw new Error("unavailable"); }]) {
    assert.throws(() => getOrCreateOfflinePaymentOperation(f.storage, scope, generate), errorCode("request_unavailable"));
    assert.equal(f.values.size, 0);
  }
});

test("invalid scopes fail before touching storage", () => {
  const f = fixture();
  for (const changed of [{ userId: "" }, { centerId: "wrong:scope" }, { familyId: "x".repeat(192) }, { billingAccountId: "bad/id" }]) {
    assert.throws(() => getOrCreateOfflinePaymentOperation(f.storage, { ...scope, ...changed }, first), errorCode("invalid_scope"));
    assert.equal(f.values.size, 0);
  }
});

test("failed and silent-failed removals never claim recovery state was cleared", () => {
  const f = fixture();
  getOrCreateOfflinePaymentOperation(f.storage, scope, first);
  for (const removeItem of [() => { throw new Error("blocked"); }, () => undefined]) {
    assert.throws(() => clearConfirmedOfflinePaymentOperation({ ...f.storage, removeItem }, scope, { requestId: firstId, receiptConfirmed: true }), errorCode("storage_unavailable"));
    assert.equal(readOfflinePaymentOperation(f.storage, scope)?.requestId, firstId);
  }
});
