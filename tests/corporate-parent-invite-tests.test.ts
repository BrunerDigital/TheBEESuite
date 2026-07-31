import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildCorporateParentInviteTestLoginEmail,
  parseCorporateParentInviteTestArgs,
} from "@/../scripts/send-kidcity-corporate-parent-invite-tests";

test("corporate parent invite tests use isolated Gmail login aliases without changing the delivery inbox", () => {
  assert.equal(
    buildCorporateParentInviteTestLoginEmail({
      recipient: "brendenbruner@gmail.com",
      school: "North Richland Hills",
      runId: "Initial Review",
    }),
    "brendenbruner+bee-invite-north-richland-hills-initial-review@gmail.com",
  );
});

test("corporate parent invite test runner is dry-run by default", () => {
  assert.deepEqual(parseCorporateParentInviteTestArgs(["--run-id", "initial"]), {
    apply: false,
    acknowledged: false,
    fixtureOnly: false,
    provisionOnly: false,
    recipient: "brendenbruner@gmail.com",
    runId: "initial",
  });
});

test("corporate parent invite test runner requires explicit production acknowledgement", () => {
  assert.throws(
    () => parseCorporateParentInviteTestArgs(["--apply", "--run-id", "initial"]),
    /acknowledge-production-test-email/,
  );
  assert.equal(
    parseCorporateParentInviteTestArgs([
      "--apply",
      "--acknowledge-production-test-email",
      "--to",
      "brendenbruner@gmail.com",
      "--run-id",
      "initial",
    ]).apply,
    true,
  );
  assert.equal(
    parseCorporateParentInviteTestArgs([
      "--provision-only",
      "--acknowledge-production-test-email",
      "--run-id",
      "initial",
    ]).provisionOnly,
    true,
  );
  assert.equal(
    parseCorporateParentInviteTestArgs([
      "--fixture-only",
      "--acknowledge-production-test-email",
      "--run-id",
      "initial",
    ]).fixtureOnly,
    true,
  );
  assert.throws(
    () => parseCorporateParentInviteTestArgs([
      "--fixture-only",
      "--provision-only",
      "--acknowledge-production-test-email",
    ]),
    /cannot be used together/,
  );
});

test("corporate parent invite test login aliases require a Gmail delivery inbox", () => {
  assert.throws(
    () => buildCorporateParentInviteTestLoginEmail({
      recipient: "parent@example.com",
      school: "Kokomo",
      runId: "initial",
    }),
    /require a Gmail delivery address/,
  );
});
