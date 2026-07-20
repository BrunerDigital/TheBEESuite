import assert from "node:assert/strict";
import test from "node:test";
import {
  assertNonProductionBaseUrl,
  percentile,
  QA_RECOMMENDED_THRESHOLDS,
  QA_SYNTHETIC_SCENARIOS,
  QA_TARGET_VIEWPORTS,
} from "../scripts/qa-standards";

test("QA standards define measurable browser, HTTP, and recovery thresholds", () => {
  assert.equal(QA_RECOMMENDED_THRESHOLDS.browser.horizontalOverflowPx, 0);
  assert.equal(QA_RECOMMENDED_THRESHOLDS.recovery.duplicateCommittedWrites, 0);
  assert.ok(QA_RECOMMENDED_THRESHOLDS.http.publicPage.p95Ms > 0);
  assert.ok(QA_SYNTHETIC_SCENARIOS.length >= 4);
  assert.ok(QA_TARGET_VIEWPORTS.some((viewport) => viewport.width <= 360));
  assert.ok(QA_TARGET_VIEWPORTS.some((viewport) => viewport.width >= 1440));
});

test("QA host guard permits local and rejects production", () => {
  assert.equal(assertNonProductionBaseUrl("http://127.0.0.1:4177/"), "http://127.0.0.1:4177");
  assert.equal(assertNonProductionBaseUrl("https://bee-preview.example.test"), "https://bee-preview.example.test");
  assert.throws(() => assertNonProductionBaseUrl("https://thebeesuite.io"), /refuse production-like host/);
});

test("percentile uses the nearest-rank result", () => {
  assert.equal(percentile([10, 20, 30, 40, 50], 50), 30);
  assert.equal(percentile([10, 20, 30, 40, 50], 95), 50);
  assert.equal(percentile([], 95), 0);
});

