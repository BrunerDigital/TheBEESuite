import assert from "node:assert/strict";
import test from "node:test";
import { shareTeacherPhoto } from "../src/lib/teacher-photo-sharing";

const photo = new File(["synthetic photo"], "gallery.jpg", { type: "image/jpeg" });
const options = { childIds: ["a", "b", "c"], rosterIds: ["a", "b", "c"], photo, caption: "Classroom art" };

test("one gallery photo and caption reach every selected child once through the guarded endpoint", async () => {
  const received: string[] = [];
  const result = await shareTeacherPhoto({ ...options, childIds: ["a", "b", "a"], fetcher: async (url, init) => {
    assert.equal(url, "/api/teacher/media");
    assert.equal(init?.method, "POST");
    const body = init?.body as FormData;
    received.push(String(body.get("childId")));
    assert.equal(await (body.get("photo") as File).text(), await photo.text());
    assert.equal(body.get("caption"), options.caption);
    assert.equal(body.get("sharedWithParents"), "true");
    return Response.json({ ok: true });
  } });
  assert.deepEqual(received, ["a", "b"]);
  assert.deepEqual(result.savedChildIds, ["a", "b"]);
  assert.equal(result.error, null);
});

test("removed or empty photo recipients fail closed before any upload", async () => {
  for (const childIds of [[], ["a", "removed"]]) {
    const result = await shareTeacherPhoto({ ...options, childIds, fetcher: async () => { throw new Error("must not fetch"); } });
    assert.deepEqual(result.savedChildIds, []);
    assert.match(result.error!, /current children/);
  }
});

test("permission-review receipts remain saved while retaining the server warning", async () => {
  const result = await shareTeacherPhoto({ ...options, childIds: ["a"], fetcher: async () => Response.json({ ok: true, warning: "Held for permission review" }) });
  assert.deepEqual(result.savedChildIds, ["a"]);
  assert.deepEqual(result.warnings, ["Held for permission review"]);
  assert.equal(result.error, null);
});

test("a rejected child stops the batch and preserves confirmed successes for recovery", async () => {
  let calls = 0;
  const result = await shareTeacherPhoto({ ...options, fetcher: async () => ++calls === 1 ? Response.json({ ok: true }) : Response.json({ error: "Child is outside your assigned classroom." }, { status: 403 }) });
  assert.equal(calls, 2);
  assert.deepEqual(result.savedChildIds, ["a"]);
  assert.match(result.error!, /outside your assigned classroom/);
});

test("transport loss, server errors, and unreadable success receipts never trigger automatic retries", async () => {
  for (const failure of [() => { throw new Error("connection lost"); }, () => Response.json({ error: "server failure" }, { status: 500 }), () => new Response("invalid receipt", { status: 201 })]) {
    let calls = 0;
    const result = await shareTeacherPhoto({ ...options, fetcher: async () => ++calls === 1 ? Response.json({ ok: true }) : failure() });
    assert.equal(calls, 2);
    assert.deepEqual(result.savedChildIds, ["a"]);
    assert.match(result.error!, /Check this child's photos before trying again/);
  }
});
