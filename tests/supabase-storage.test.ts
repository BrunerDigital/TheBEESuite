import assert from "node:assert/strict";
import { test } from "node:test";
import { contentTypeForDocumentFile } from "../src/lib/supabase-storage";

test("document upload content type falls back from filename extension", () => {
  assert.equal(contentTypeForDocumentFile({ name: "immunization.pdf" }), "application/pdf");
  assert.equal(contentTypeForDocumentFile({ name: "policy.docx" }), "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  assert.equal(contentTypeForDocumentFile({ name: "custody.jpg" }), "image/jpeg");
  assert.equal(contentTypeForDocumentFile({ name: "notes.txt" }), "text/plain");
});

test("document upload content type keeps browser-provided type first", () => {
  assert.equal(contentTypeForDocumentFile({ type: "image/png", name: "file.bin" }), "image/png");
});
