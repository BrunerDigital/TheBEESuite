import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import test from "node:test";

const require = createRequire(import.meta.url);

test("installed web-push uses the standard URL API on Node 24", () => {
  const packageEntry = require.resolve("web-push");
  const implementationPath = join(dirname(packageEntry), "web-push-lib.js");
  const implementation = readFileSync(implementationPath, "utf8");

  assert.doesNotMatch(implementation, /\burl\.parse\s*\(/);
  assert.match(implementation, /new URL\(subscription\.endpoint\)/);
  assert.match(implementation, /new URL\(requestDetails\.endpoint\)/);
  assert.match(implementation, /urlParts\.pathname \+ urlParts\.search/);

  const installer = readFileSync("scripts/patch-web-push-url.mjs", "utf8");
  assert.match(installer, /packageMetadata\.version !== "3\.6\.7"/);
  assert.match(installer, /Refusing to patch unexpected web-push version/);
  assert.match(installer, /web-push patch context did not match/);
});
