import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import * as nodeModule from "node:module";
import test from "node:test";
import type { ParentPaymentRecovery } from "../src/components/use-parent-payment-recovery";
import { isParentPaymentObservation, isPaymentObservationId, isServerCheckoutReceipt } from "../src/lib/parent-payment-observation";
import { mergeParentAccountPaymentBlockers, mergeParentPaymentPhases } from "../src/lib/parent-payment-status";

// Execute the production hook with controlled hook state/effects and request
// completion. This is a unit lifecycle harness, not a browser/React render test.
const source = readFileSync("src/components/use-parent-payment-recovery.ts", "utf8").replace(/^import .*$/gm, "").replaceAll("export ", "");
// Runtime is Node 24; the repository's Node 20 typings predate this API.
const stripTypeScriptTypes = (nodeModule as unknown as { stripTypeScriptTypes: (code: string) => string }).stripTypeScriptTypes;
const executable = stripTypeScriptTypes(source);
function fixture() {
  const cells: unknown[] = [];
  let cursor = 0;
  let effects: Array<() => void> = [];
  const listeners = new Map<string, Set<() => void>>();
  const location = { href: "https://app.example.test/parent-portal?view=payments" };
  const requests: Array<{ url: string; init: RequestInit; resolve: (value: Response) => void; reject: (reason: Error) => void }> = [];
  const request = (url: string, init: RequestInit) => new Promise<Response>((resolve, reject) => requests.push({ url, init, resolve, reject }));
  const deps = {
    useState(initial: unknown) { const i = cursor++; if (!(i in cells)) cells[i] = initial; return [cells[i], (value: unknown) => { cells[i] = typeof value === "function" ? value(cells[i]) : value; }]; },
    useRef(initial: unknown) { const i = cursor++; if (!(i in cells)) cells[i] = { current: initial }; return cells[i]; },
    useLayoutEffect(effect: () => (() => void) | void, values: unknown[]) {
      const i = cursor++, prior = cells[i] as { values: unknown[]; cleanup?: () => void } | undefined;
      if (!prior || values.some((value, index) => !Object.is(value, prior.values[index]))) effects.push(() => { prior?.cleanup?.(); cells[i] = { values, cleanup: effect() }; });
    },
    isParentPaymentObservation, isPaymentObservationId, isServerCheckoutReceipt, mergeParentAccountPaymentBlockers, mergeParentPaymentPhases,
    crypto: { randomUUID }, window: { location, addEventListener(type: string, callback: () => void) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type)!.add(callback); }, removeEventListener(type: string, callback: () => void) { listeners.get(type)?.delete(callback); } },
  };
  const hook = Function(...Object.keys(deps), executable + "\nreturn useParentPaymentRecovery;")(...Object.values(deps)) as (...args: unknown[]) => ParentPaymentRecovery;
  let familyId = "family_test", navigationKey = "payments:billing";
  const render = () => { cursor = 0; effects = []; const result = hook(familyId, request, () => {}, null, navigationKey); for (const effect of effects) effect(); return result; };
  let recovery = render();
  return { requests, location,
    get recovery() { recovery = render(); return recovery; },
    family(value: string) { familyId = value; recovery = render(); },
    navigate(value: string) { navigationKey = value; recovery = render(); },
    fire(type: string) { for (const callback of listeners.get(type) ?? []) callback(); },
    unmount() { for (const cell of cells) (cell as { cleanup?: () => void } | undefined)?.cleanup?.(); },
    respond(patch: Record<string, unknown> = {}, status = 200) {
      const call = requests.at(-1)!, input = JSON.parse(String(call.init.body));
      call.resolve(new Response(JSON.stringify({ ok: true, ...input, paymentId: "payment_test", stripeSessionId: "cs_test", url: "https://checkout.stripe.com/c/pay/cs_test", ...patch }), { status }));
    },
  };
}

test("resume executes one read-only endpoint request and suppresses repeated clicks/new collections", async () => {
  const f = fixture(), pending = f.recovery.resumeCheckout();
  assert.equal(f.recovery.isResuming, true);
  await f.recovery.resumeCheckout(); await f.recovery.refresh();
  assert.equal(f.recovery.begin(null, "card"), null);
  assert.equal(f.requests.length, 1); assert.equal(f.requests[0].url, "/api/parent/resume-checkout");
  assert.equal(f.requests[0].init.method, "POST");
  f.respond(); await pending;
  assert.equal(f.location.href, "https://checkout.stripe.com/c/pay/cs_test");
});

for (const [name, change] of Object.entries({
  "same-family view navigation": (f: ReturnType<typeof fixture>) => f.navigate("home:profile"),
  "family change": (f: ReturnType<typeof fixture>) => f.family("another_family"),
  "client-side URL change": (f: ReturnType<typeof fixture>) => { f.location.href = "https://app.example.test/parent-portal?view=home"; },
  "history navigation": (f: ReturnType<typeof fixture>) => f.fire("popstate"),
  "page hide": (f: ReturnType<typeof fixture>) => f.fire("pagehide"),
  "unmount": (f: ReturnType<typeof fixture>) => f.unmount(),
})) test(`${name} prevents a late resume redirect`, async () => {
  const f = fixture(), pending = f.recovery.resumeCheckout(); change(f);
  const expected = f.location.href; f.respond(); await pending; assert.equal(f.location.href, expected);
});

for (const patch of [{ familyId: "another_family" }, { requestNonce: "wrong_nonce" }, { stripeSessionId: "pi_wrong" }, { url: "javascript:alert(1)" }]) {
  test(`invalid resume receipt ${Object.keys(patch)[0]} keeps checkout paused`, async () => {
    const f = fixture(), pending = f.recovery.resumeCheckout(); f.respond(patch); await pending;
    assert.equal(f.location.href, "https://app.example.test/parent-portal?view=payments");
    assert.match(f.recovery.refreshMessage, /remains paused/);
  });
}

test("failed or rejected resume retains an existing uncertainty hold", async () => {
  for (const failure of ["response", "network"]) {
    const f = fixture(), attempt = f.recovery.begin(null, "card"); assert.ok(attempt); f.recovery.hold(attempt, "payment_test");
    const pending = f.recovery.resumeCheckout();
    if (failure === "response") f.respond({ ok: false }, 409); else f.requests[0].reject(new Error("offline"));
    await pending;
    assert.equal(f.recovery.hasHolds, true); assert.equal(f.recovery.blocker?.phase, "confirmation_unknown");
    assert.equal(f.recovery.begin(null, "card"), null); assert.match(f.recovery.refreshMessage, /remains paused/);
  }
});
