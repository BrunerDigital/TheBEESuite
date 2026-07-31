import assert from "node:assert/strict";
import test from "node:test";

import { familiesForCompleteRecordEditing } from "../src/lib/family-profile-visibility";

type TestFamily = {
  id: string;
  children: Array<{ id: string; status: string }>;
};

test("current family editing keeps every linked child from the complete family record", () => {
  const currentFamilies: TestFamily[] = [
    {
      id: "family-current",
      children: [{ id: "child-current", status: "enrolled" }],
    },
  ];
  const allFamilies: TestFamily[] = [
    {
      id: "family-current",
      children: [
        { id: "child-current", status: "enrolled" },
        { id: "child-review", status: "review_needed" },
        { id: "child-withdrawn", status: "withdrawn" },
      ],
    },
  ];

  const result = familiesForCompleteRecordEditing({
    currentFamilies,
    allFamilies,
  });

  assert.deepEqual(
    result[0]?.children.map((child) => child.id),
    ["child-current", "child-review", "child-withdrawn"],
  );
});

test("a requested past family opens first without dropping current families", () => {
  const currentFamilies: TestFamily[] = [
    {
      id: "family-current",
      children: [{ id: "child-current", status: "enrolled" }],
    },
  ];
  const allFamilies: TestFamily[] = [
    {
      id: "family-current",
      children: [
        { id: "child-current", status: "enrolled" },
        { id: "child-past", status: "withdrawn" },
      ],
    },
    {
      id: "family-past-only",
      children: [{ id: "child-past-only", status: "withdrawn" }],
    },
  ];

  const result = familiesForCompleteRecordEditing({
    currentFamilies,
    allFamilies,
    requestedFamilyId: "family-past-only",
  });

  assert.deepEqual(
    result.map((family) => family.id),
    ["family-past-only", "family-current"],
  );
  assert.deepEqual(
    result[1]?.children.map((child) => child.id),
    ["child-current", "child-past"],
  );
});
