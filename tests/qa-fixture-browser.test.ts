import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import test from "node:test";
import { withFixtureBrowser } from "../scripts/qa-fixture-browser";

async function listeningServer() {
  const server = createServer((_request, response) => response.end("Fake local fixture"));
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  return server;
}

test("fixture server closes when browser launch fails before any context exists", async () => {
  const server = await listeningServer();
  await assert.rejects(withFixtureBrowser(server, async () => { throw new Error("Fake missing browser"); }, async () => { assert.fail("Cannot run without browser"); }), /Fake missing browser/);
  assert.equal(server.listening, false);
});

test("context or test setup failure closes both browser and fixture server", async () => {
  const server = await listeningServer(); let closed = 0;
  await assert.rejects(withFixtureBrowser(server, async () => ({ async close() { closed++; } }), async () => { throw new Error("Fake context failure"); }), /Fake context failure/);
  assert.equal(closed, 1); assert.equal(server.listening, false);
});

test("fixture server closes even when browser cleanup itself rejects", async () => {
  const server = await listeningServer();
  await assert.rejects(withFixtureBrowser(server, async () => ({ async close() { throw new Error("Fake close failure"); } }), async () => {}), /Fake close failure/);
  assert.equal(server.listening, false);
});

test("teacher harnesses put browser launch and all setup inside shared cleanup", () => {
  for (const file of ["scripts/qa-teacher-report-targets.ts", "scripts/qa-teacher-child-picker.ts"]) {
    const source = readFileSync(file, "utf8");
    assert.match(source, /await withFixtureBrowser\(server, \(\) => \(browserEngine === "webkit" \? webkit : chromium\).launch\(\), async browser => \{/);
    assert.doesNotMatch(source, /const browser = await/);
  }
});
