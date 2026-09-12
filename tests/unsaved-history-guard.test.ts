import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { installUnsavedHistoryGuard, UNSAVED_HISTORY_BOOTSTRAP } from "../src/lib/unsaved-history-guard";

function fixture() {
  const entries = [{ state: { __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: { opaque: "fake" } } as unknown, url: "https://fake.example.test/a" }];
  let index = 0, dirty = false, answer = false, dialogs = 0, downstream = 0;
  const browser = new EventTarget() as EventTarget & { crypto: { randomUUID: () => string }; history: object; location: { href: string } };
  browser.crypto = { randomUUID: () => "fake-document" };
  browser.location = { href: entries[0].url };
  const pop = () => { browser.location.href = entries[index].url; const event = new Event("popstate"); Object.assign(event, { state: entries[index].state }); browser.dispatchEvent(event); };
  const rawPush = (state: unknown, _unused: string, url?: string | URL | null) => {
    if ((state as { fail?: boolean })?.fail) throw new Error("Fake clone failure");
    entries.splice(index + 1); entries.push({ state: structuredClone(state), url: url ? new URL(String(url), browser.location.href).href : browser.location.href }); index++; browser.location.href = entries[index].url;
  };
  const history = {
    get state() { return entries[index].state; },
    get length() { return entries.length; },
    pushState: rawPush,
    replaceState(state: unknown, _unused: string, url?: string | URL | null) { entries[index] = { state: structuredClone(state), url: url ? new URL(String(url), browser.location.href).href : browser.location.href }; browser.location.href = entries[index].url; },
    go(delta: number) { const next = index + delta; if (next < 0 || next >= entries.length) return; index = next; pop(); },
  };
  browser.history = history;
  const install = () => installUnsavedHistoryGuard(browser as unknown as Window, () => dirty, () => { dialogs++; return answer; });
  install(); browser.addEventListener("popstate", () => { downstream++; });
  return { browser, history, install, entries, rawPush, pop, setDirty(value: boolean) { dirty = value; }, setAnswer(value: boolean) { answer = value; }, dialogs: () => dialogs, downstream: () => downstream };
}

test("history cancellation restores exact entries without new history or downstream router events", () => {
  const f = fixture(); f.history.pushState({ opaque: [1, 2] }, "", "/b"); f.history.pushState({ opaque: { keep: true } }, "", "/c");
  f.setDirty(true); f.history.go(-2);
  assert.equal(f.browser.location.href, "https://fake.example.test/c"); assert.equal(f.history.length, 3);
  assert.equal(f.dialogs(), 1); assert.equal(f.downstream(), 0);
  assert.deepEqual((f.history.state as { opaque: unknown }).opaque, { keep: true });
  f.setAnswer(true); f.history.go(-2);
  assert.equal(f.browser.location.href, "https://fake.example.test/a"); assert.equal(f.downstream(), 1);
  f.setAnswer(false); f.history.go(2);
  assert.equal(f.browser.location.href, "https://fake.example.test/a"); assert.equal(f.history.length, 3); assert.equal(f.downstream(), 1);
  f.setAnswer(true); f.history.go(2); assert.equal(f.browser.location.href, "https://fake.example.test/c");
});

test("history replacement retains position and opaque state; installs are idempotent", () => {
  const f = fixture(); f.install();
  f.history.pushState({ __NA: true, opaque: { keep: true } }, "", "/b");
  const position = (f.history.state as Record<string, unknown>).__beeUnsavedHistory;
  f.history.replaceState({ opaque: { replacement: true } }, "", "/b?new=1");
  assert.deepEqual((f.history.state as Record<string, unknown>).__beeUnsavedHistory, position);
  assert.equal(f.history.length, 2);
  assert.throws(() => f.history.pushState({ fail: true }, "", "/failed"));
  f.setDirty(true); f.history.go(-1); assert.equal(f.browser.location.href, "https://fake.example.test/b?new=1"); assert.equal(f.dialogs(), 1);
  assert.deepEqual((f.history.state as { opaque: unknown }).opaque, { replacement: true });
});

test("hash traversal preserves drafts without prompting but identical URLs at distinct entries still guard", () => {
  const f = fixture(); f.setDirty(true);
  f.rawPush(null, "", "/a#fake-section"); f.pop(); f.history.go(-1);
  assert.equal(f.browser.location.href, "https://fake.example.test/a"); assert.equal(f.dialogs(), 0);
  f.history.pushState(null, "", "/a"); f.history.go(-1);
  assert.equal(f.dialogs(), 1); assert.equal(f.history.length, 2);
});

test("foreign history markers are not assigned guessed traversal offsets", () => {
  const f = fixture();
  f.rawPush({ __beeUnsavedHistory: { documentId: "foreign-document", position: 1000 }, opaque: "preserve" }, "", "/foreign");
  f.history.pushState({}, "", "/known"); f.setDirty(true); f.history.go(-1);
  assert.equal(f.browser.location.href, "https://fake.example.test/foreign"); assert.equal(f.dialogs(), 0);
  assert.equal((f.history.state as { opaque: string }).opaque, "preserve");
});

test("an early root-layout listener precedes Next hydration and no draft data is persisted", () => {
  const layout = readFileSync("src/app/layout.tsx", "utf8"), source = readFileSync("src/lib/unsaved-history-guard.ts", "utf8");
  assert.match(layout, /id="bee-unsaved-history" strategy="beforeInteractive"/);
  assert.match(layout, /<UnsavedChangesHistoryRuntime \/>/);
  assert.match(UNSAVED_HISTORY_BOOTSTRAP, /addEventListener\("popstate"/);
  assert.match(source, /event\.stopImmediatePropagation\(\)/);
  assert.doesNotMatch(source, /localStorage|sessionStorage/);
  assert.match(readFileSync("scripts/qa-unsaved-history.ts", "utf8"), /Canceled and restoration pops never reach Next\/downstream listeners/);
});
