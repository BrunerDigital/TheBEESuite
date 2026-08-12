import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const preview = readFileSync("src/app/ui-preview/page.tsx", "utf8");
const terminal = readFileSync("src/components/stripe-terminal-payment.tsx", "utf8");

test("UI preview is development-only and uses synthetic identifiers", () => {
  assert.match(preview, /process\.env\.NODE_ENV !== "development"/);
  assert.match(preview, /notFound\(\)/);
  assert.match(preview, /preview-family/);
  assert.match(preview, /Synthetic data only/);
  assert.doesNotMatch(preview, /prisma\.|getCurrentUser|method:\s*"(?:POST|PUT|PATCH|DELETE)"/);
});

test("terminal preview mode cannot submit or register a reader", () => {
  assert.match(terminal, /if \(previewMode\) \{[\s\S]*Preview only\. Reader settings are not saved/);
  assert.match(terminal, /if \(previewMode\) \{[\s\S]*No payment was submitted or recorded/);
});
