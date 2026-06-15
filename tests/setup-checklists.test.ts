import assert from "node:assert/strict";
import test from "node:test";
import {
  directorLaunchChecklistTasks,
  readCompletedSetupChecklistIds,
  setupChecklistTasksForKey,
  teacherProfileChecklistTasks,
} from "../src/lib/setup-checklists";

test("setupChecklistTasksForKey returns the correct checklist task set", () => {
  assert.equal(setupChecklistTasksForKey("director_launch"), directorLaunchChecklistTasks);
  assert.equal(setupChecklistTasksForKey("teacher_profile"), teacherProfileChecklistTasks);
  assert.ok(directorLaunchChecklistTasks.some((task) => task.id === "procare-import"));
  assert.ok(teacherProfileChecklistTasks.some((task) => task.id === "classroom-assignment"));
});

test("readCompletedSetupChecklistIds extracts only string completed task ids", () => {
  const customFields = {
    setupChecklists: {
      director_launch: {
        completedIds: ["login-school-profile", "procare-import", 123, null, "launch-smoke-test"],
      },
    },
  };

  assert.deepEqual(readCompletedSetupChecklistIds(customFields, "director_launch"), [
    "login-school-profile",
    "procare-import",
    "launch-smoke-test",
  ]);
});

test("readCompletedSetupChecklistIds tolerates missing or malformed custom fields", () => {
  assert.deepEqual(readCompletedSetupChecklistIds(null, "director_launch"), []);
  assert.deepEqual(readCompletedSetupChecklistIds([], "teacher_profile"), []);
  assert.deepEqual(readCompletedSetupChecklistIds({ setupChecklists: [] }, "director_launch"), []);
  assert.deepEqual(
    readCompletedSetupChecklistIds({ setupChecklists: { teacher_profile: { completedIds: "teacher-login" } } }, "teacher_profile"),
    [],
  );
});
