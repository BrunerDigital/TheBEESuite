import assert from "node:assert/strict";
import { test } from "node:test";
import { prioritizeFteFollowUp } from "../src/lib/corporate-dashboard";

test("corporate FTE follow-up keeps every visible school and puts missing reports first", () => {
  const schools = [
    { id: "submitted-b", name: "B School", fteSubmitted: true },
    { id: "missing-z", name: "Z School", fteSubmitted: false },
    { id: "missing-a", name: "A School", fteSubmitted: false },
    { id: "submitted-a", name: "A School", fteSubmitted: true },
  ];

  const prioritized = prioritizeFteFollowUp(schools);

  assert.deepEqual(prioritized.map((school) => school.id), [
    "missing-a",
    "missing-z",
    "submitted-a",
    "submitted-b",
  ]);
  assert.equal(prioritized.length, schools.length);
  assert.deepEqual(schools.map((school) => school.id), [
    "submitted-b",
    "missing-z",
    "missing-a",
    "submitted-a",
  ]);
});
