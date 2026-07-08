import assert from "node:assert/strict";
import { test } from "node:test";
import { parsePilotReadinessArgs, readinessStatus } from "../scripts/pilot-readiness-check";

test("pilot readiness args enable machine-readable rollout reports", () => {
  assert.deepEqual(parsePilotReadinessArgs([]), {
    all: false,
    json: false,
    failOnWarn: false,
  });

  assert.deepEqual(parsePilotReadinessArgs(["--all", "--json", "--fail-on-warn", "--output", "tmp/readiness.json"]), {
    all: true,
    json: true,
    failOnWarn: true,
    outputPath: "tmp/readiness.json",
  });

  assert.deepEqual(parsePilotReadinessArgs(["--output=tmp/readiness.json"]), {
    all: false,
    json: false,
    failOnWarn: false,
    outputPath: "tmp/readiness.json",
  });
});

test("pilot readiness args reject ambiguous output paths and unknown flags", () => {
  assert.throws(() => parsePilotReadinessArgs(["--output"]), /requires a file path/);
  assert.throws(() => parsePilotReadinessArgs(["--output", "--json"]), /requires a file path/);
  assert.throws(() => parsePilotReadinessArgs(["--quiet"]), /Unknown pilot readiness option/);
});

test("pilot readiness status separates warnings from blockers", () => {
  assert.equal(readinessStatus(0, 0), "ready");
  assert.equal(readinessStatus(0, 2), "ready_with_warnings");
  assert.equal(readinessStatus(1, 0), "blocked");
  assert.equal(readinessStatus(1, 2), "blocked");
});
