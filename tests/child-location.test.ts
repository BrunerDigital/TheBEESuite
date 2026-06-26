import assert from "node:assert/strict";
import test from "node:test";
import {
  childIsTransitioned,
  childLiveLocationCountsByClassroom,
  childLocationLabel,
  resolveCurrentClassroomId,
  validateChildLocationTarget,
} from "@/lib/child-location";

test("current classroom falls back to the assigned classroom until a live transition exists", () => {
  assert.equal(resolveCurrentClassroomId({
    assignedClassroomId: "assigned-room",
    liveLocation: null,
  }), "assigned-room");
});

test("current classroom can differ from assigned classroom without changing enrollment assignment", () => {
  assert.equal(resolveCurrentClassroomId({
    assignedClassroomId: "assigned-room",
    liveLocation: {
      currentClassroomId: "combination-room",
      status: "in_classroom",
    },
  }), "combination-room");
  assert.equal(childIsTransitioned({
    assignedClassroomId: "assigned-room",
    liveLocation: {
      currentClassroomId: "combination-room",
      status: "in_classroom",
    },
  }), true);
});

test("school area transitions remove the child from live classroom counts", () => {
  const counts = childLiveLocationCountsByClassroom([
    { assignedClassroomId: "room-a", liveLocation: null },
    { assignedClassroomId: "room-a", liveLocation: { currentClassroomId: "room-b", status: "in_classroom" } },
    { assignedClassroomId: "room-a", liveLocation: { areaName: "Playground", status: "in_area" } },
  ]);

  assert.equal(counts.get("room-a"), 1);
  assert.equal(counts.get("room-b"), 1);
});

test("location labels prefer current area or current classroom over assigned classroom", () => {
  assert.equal(childLocationLabel({
    assignedClassroom: { id: "room-a", name: "Bees" },
    liveLocation: { areaName: "Playground", status: "in_area" },
  }), "Playground");

  assert.equal(childLocationLabel({
    assignedClassroom: { id: "room-a", name: "Bees" },
    currentClassroom: { id: "room-b", name: "Butterflies" },
    liveLocation: { currentClassroomId: "room-b", status: "in_classroom" },
  }), "Butterflies");
});

test("location target validation requires a classroom or area", () => {
  assert.deepEqual(validateChildLocationTarget({ classroomId: "", areaName: "" }), {
    ok: false,
    status: 400,
    error: "Choose a classroom or school area for this child.",
  });
  assert.deepEqual(validateChildLocationTarget({ classroomId: "room-a", areaName: "Playground" }), {
    ok: true,
    classroomId: "room-a",
    areaName: null,
  });
});
