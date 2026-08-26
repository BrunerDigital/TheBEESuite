import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("notification menu renders the complete notification body", () => {
  const source = readFileSync("src/components/app-shell.tsx", "utf8");
  const notificationBody = source.match(/<p className="([^"]+)"[^>]*>\s*\{shellUserViewText\(item\.body, currentUser\)\}/)?.[1] ?? "";
  assert.match(notificationBody, /whitespace-pre-wrap/);
  assert.doesNotMatch(notificationBody, /line-clamp/);
});
