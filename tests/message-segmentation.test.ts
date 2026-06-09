import assert from "node:assert/strict";
import { test } from "node:test";
import {
  broadcastSegmentIsEmpty,
  broadcastSegmentSummary,
  extractFamilyTags,
  familyMatchesBroadcastSegment,
  normalizeMessageBroadcastSegment,
} from "../src/lib/message-segmentation";

test("message broadcast segment normalizes arrays and comma-separated tags", () => {
  const segment = normalizeMessageBroadcastSegment({
    centerIds: ["center_1", "", "center_1"],
    classroomIds: "classroom_1,classroom_2",
    statuses: ["Enrolled", "waitlisted"],
    tags: "Subsidy, sibling",
  });

  assert.deepEqual(segment, {
    centerIds: ["center_1"],
    classroomIds: ["classroom_1", "classroom_2"],
    statuses: ["enrolled", "waitlisted"],
    tags: ["subsidy", "sibling"],
  });
  assert.equal(broadcastSegmentIsEmpty(segment), false);
  assert.equal(broadcastSegmentSummary(segment).includes("1 center"), true);
});

test("family tags are read from supported custom field keys", () => {
  assert.deepEqual(extractFamilyTags({
    tags: ["Sibling", "subsidy"],
    familyTags: "staff child",
    labels: ["Subsidy"],
  }), ["sibling", "staff child", "subsidy"]);
});

test("family broadcast matching applies center, classroom, status, and tags", () => {
  const family = {
    centerId: "center_1",
    customFields: { tags: ["subsidy"] },
    children: [
      { classroomId: "classroom_1", enrollmentStatus: "enrolled" },
      { classroomId: "classroom_2", enrollmentStatus: "waitlisted" },
    ],
  };

  assert.equal(familyMatchesBroadcastSegment(family, normalizeMessageBroadcastSegment({
    centerIds: ["center_1"],
    classroomIds: ["classroom_2"],
    statuses: ["waitlisted"],
    tags: ["subsidy"],
  })), true);

  assert.equal(familyMatchesBroadcastSegment(family, normalizeMessageBroadcastSegment({
    centerIds: ["center_2"],
  })), false);

  assert.equal(familyMatchesBroadcastSegment(family, normalizeMessageBroadcastSegment({
    statuses: ["withdrawn"],
  })), false);
});
