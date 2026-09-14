import assert from "node:assert/strict";
import test from "node:test";

import { auditProductionDependencies, classifyAuditResult } from "../scripts/audit-production-dependencies.mjs";

test("audit classification passes when the production audit is clean", () => {
  const result = classifyAuditResult({
    status: 0,
    stdout: JSON.stringify({ metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 } } }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.kind, "clean");
});

test("audit classification fails when npm reports production vulnerabilities", () => {
  const result = classifyAuditResult({
    status: 1,
    stdout: JSON.stringify({ metadata: { vulnerabilities: { info: 0, low: 0, moderate: 1, high: 0, critical: 0, total: 1 } } }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.kind, "vulnerabilities");
  assert.match(result.summary, /1 production vulnerability/);
});

test("audit classification marks registry outages as transient errors", () => {
  const result = classifyAuditResult({
    status: 1,
    stderr: "npm error audit endpoint returned an error\n503 Service Unavailable",
  });

  assert.equal(result.ok, false);
  assert.equal(result.kind, "transient-error");
});

test("production audit retries transient registry outages before succeeding", async () => {
  let attempts = 0;
  const warnings = [];
  const result = await auditProductionDependencies({
    attempts: 3,
    retryDelayMs: 0,
    log: { warn: (message) => warnings.push(message) },
    runner: () => {
      attempts += 1;

      if (attempts < 3) {
        return { status: 1, stderr: "503 Service Unavailable" };
      }

      return {
        status: 0,
        stdout: JSON.stringify({ metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 } } }),
      };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.kind, "clean");
  assert.equal(attempts, 3);
  assert.equal(warnings.length, 2);
});

test("production audit allows validation to continue after repeated registry outages", async () => {
  const result = await auditProductionDependencies({
    attempts: 2,
    retryDelayMs: 0,
    log: { warn: () => {} },
    runner: () => ({ status: 1, stderr: "503 Service Unavailable" }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.kind, "transient-warning");
  assert.match(result.summary, /continuing without failing validation/);
});
