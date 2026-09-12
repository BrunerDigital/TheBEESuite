import assert from "node:assert/strict";
import { mock, test } from "node:test";

process.env.SUPABASE_URL = "https://fake-storage.example.test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fake-test-key";
process.env.SUPABASE_DOCUMENT_BUCKET = "fake-documents";
process.env.SUPABASE_CHILD_MEDIA_BUCKET = "fake-media";
let uploaded, removed, signed, failUpload, failSigning, failRemoval;
function reset() { uploaded = []; removed = []; signed = []; failUpload = false; failSigning = true; failRemoval = false; }
// Intercept the SDK transport itself so both ESM and CJS resolution are inert.
mock.method(globalThis, "fetch", async (input, init) => {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  assert.equal(url.origin, "https://fake-storage.example.test");
  const path = url.pathname.split("/").slice(4);
  const response = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
  if (path[0] === "sign") {
    const [, bucket, ...parts] = path; signed.push({ bucket, key: parts.join("/") });
    return failSigning === true || (failSigning === "primary" && bucket === "fake-documents") ? response({ message: "Fake signing failure", statusCode: "400", error: "Fake" }, 400) : response({ signedURL: "/fake-signed" });
  }
  const [bucket, ...parts] = path;
  if (init.method === "DELETE") {
    removed.push({ bucket, keys: JSON.parse(init.body).prefixes });
    return failRemoval ? response({ message: "Fake removal failure", statusCode: "400", error: "Fake" }, 400) : response([]);
  }
  assert.equal(init.method, "POST");
  const key = parts.join("/");
  uploaded.push({ bucket, key, options: { upsert: new Headers(init.headers).get("x-upsert") === "true" } });
  return failUpload ? response({ message: "Fake upload failure", statusCode: "400", error: "Fake" }, 400) : response({ Key: `${bucket}/${key}` });
});
const { uploadDocumentBuffer } = await import("../../src/lib/supabase-storage.ts");
const input = { bytes: Buffer.from("Fake document only"), contentType: "text/plain", originalName: "fake.txt", tenantId: "fake-tenant", familyId: "fake-family", documentId: "fake-document" };

test("document upload recovery", async (t) => {
  await t.test("signed URL failure cleans only the newly uploaded document bucket key", async () => {
    reset(); await assert.rejects(() => uploadDocumentBuffer(input), /Could not create signed document URL/);
    assert.equal(uploaded.length, 1); assert.equal(uploaded[0].options.upsert, false);
    assert.deepEqual(removed, [{ bucket: "fake-documents", keys: [uploaded[0].key] }]);
    assert.deepEqual(signed.map((item) => item.bucket), ["fake-documents", "fake-media"]);
  });
  await t.test("successful upload returns its exact key without cleanup", async () => {
    reset(); failSigning = false; const result = await uploadDocumentBuffer(input);
    assert.equal(result.storageKey, uploaded[0].key); assert.equal(result.bucket, "fake-documents"); assert.equal(removed.length, 0);
  });
  await t.test("uncertain upload failure never deletes an object", async () => {
    reset(); failUpload = true; await assert.rejects(() => uploadDocumentBuffer(input), /Fake upload failure/);
    assert.equal(signed.length, 0); assert.equal(removed.length, 0);
  });
  await t.test("successful fallback URL never removes either bucket object", async () => {
    reset(); failSigning = "primary"; const result = await uploadDocumentBuffer(input);
    assert.equal(result.storageKey, uploaded[0].key); assert.equal(removed.length, 0); assert.equal(signed.length, 2);
  });
  await t.test("cleanup failure preserves the original error and emits only a constant event", async () => {
    reset(); failRemoval = true; const logging = mock.method(console, "error", () => {});
    try {
      await assert.rejects(() => uploadDocumentBuffer(input), /Could not create signed document URL/);
      assert.deepEqual(logging.mock.calls.map((call) => call.arguments), [["document_upload_unreferenced_object_cleanup_failed"]]);
    } finally { logging.mock.restore(); }
  });
});
