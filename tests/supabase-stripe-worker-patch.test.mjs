import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { rateLimitMethod, replaceOnce, patchWorker } from "../scripts/patch-supabase-stripe-worker.mjs";

function client(query) {
  const waits = [];
  const context = vm.createContext({
    setTimeout(resolve, delay) { waits.push(delay); queueMicrotask(resolve); },
  });
  const C = vm.runInContext("(class { " + rateLimitMethod + " })", context);
  const instance = new C();
  instance.syncSchema = "stripe";
  instance.query = query;
  return { instance, waits };
}
test("rate-limit denial sleeps a full window and retries without an exception", async () => {
  let calls = 0;
  const { instance, waits } = client(async (sql, params) => {
    assert.match(sql, /ON CONFLICT \(key\) DO UPDATE/);
    assert.match(sql, /WHERE limits.count < \$2/);
    assert.match(sql, /RETURNING count/);
    assert.deepEqual(Array.from(params), ["stripe", 25]);
    return { rows: ++calls === 1 ? [] : [{ count: 1 }] };
  });
  await instance.waitForRateLimit(25);
  assert.equal(calls, 2);
  assert.deepEqual(waits, [1000]);
});
test("available permit returns immediately", async () => {
  const { instance, waits } = client(async () => ({ rows: [{ count: 1 }] }));
  await instance.waitForRateLimit(25);
  assert.deepEqual(waits, []);
});
test("database failures propagate instead of retrying indefinitely", async () => {
  const { instance } = client(async () => { throw new Error("database unavailable"); });
  await assert.rejects(instance.waitForRateLimit(25), /database unavailable/);
});
test("invalid limits fail before a query", async () => {
  const { instance } = client(async () => { throw new Error("unexpected query"); });
  for (const limit of [0, -1, NaN, 1.5]) {
    await assert.rejects(instance.waitForRateLimit(limit), /Invalid sync rate limit/);
  }
});
test("patch rejects unknown or ambiguous deployed source", () => {
  assert.throws(() => patchWorker("unknown bundle"), /Deployed worker changed/);
  assert.throws(() => replaceOnce("a a", "a", "b"), /ambiguous/);
  assert.throws(() => replaceOnce("a", "b", "c"), /missing/);
});

