import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildChildMediaPath,
  buildDocumentPath,
  buildMessageAttachmentPath,
  contentTypeForDocumentFile,
} from "../src/lib/supabase-storage";

test("document upload content type falls back from filename extension", () => {
  assert.equal(contentTypeForDocumentFile({ name: "immunization.pdf" }), "application/pdf");
  assert.equal(contentTypeForDocumentFile({ name: "policy.docx" }), "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  assert.equal(contentTypeForDocumentFile({ name: "custody.jpg" }), "image/jpeg");
  assert.equal(contentTypeForDocumentFile({ name: "notes.txt" }), "text/plain");
});

test("document upload content type keeps browser-provided type first", () => {
  assert.equal(contentTypeForDocumentFile({ type: "image/png", name: "file.bin" }), "image/png");
});

test("App Review uploads use dedicated demo storage namespaces", () => {
  assert.match(buildChildMediaPath({
    tenantId: "tenant-demo",
    centerId: "center-demo",
    classroomId: "classroom-demo",
    childId: "child-demo",
    originalName: "photo.jpg",
    contentType: "image/jpeg",
    appReviewDemo: true,
  }), /^demo-media\/child-demo\/app-review\/[0-9a-f-]+\.jpg$/);

  assert.match(buildDocumentPath({
    tenantId: "tenant-demo",
    centerId: "center-demo",
    familyId: "family-demo",
    childId: "child-demo",
    documentId: "document-demo",
    originalName: "signed.txt",
    contentType: "text/plain",
    appReviewDemo: true,
  }), /^demo-docs\/child-demo\/app-review\/document-demo\/[0-9a-f-]+\.txt$/);

  assert.match(buildMessageAttachmentPath({
    tenantId: "tenant-demo",
    centerId: "center-demo",
    familyId: "family-demo",
    uploadedById: "review-parent",
    originalName: "message.pdf",
    contentType: "application/pdf",
    appReviewDemo: true,
  }), /^demo-messages\/family-demo\/review-parent\/[0-9a-f-]+\.pdf$/);
});

test("normal uploads retain their production storage namespaces", () => {
  assert.match(buildChildMediaPath({
    tenantId: "tenant-a",
    centerId: "center-a",
    classroomId: "classroom-a",
    childId: "child-a",
    contentType: "image/png",
  }), /^tenant-a\/center-a\/classroom-a\/child-a\/\d{4}\/\d{2}\/[0-9a-f-]+\.png$/);
  assert.match(buildDocumentPath({
    tenantId: "tenant-a",
    centerId: "center-a",
    familyId: "family-a",
    documentId: "document-a",
    contentType: "application/pdf",
  }), /^documents\/tenant-a\/center-a\/family-a\/family\/document-a\/\d{4}\/\d{2}\/[0-9a-f-]+\.pdf$/);
  assert.match(buildMessageAttachmentPath({
    tenantId: "tenant-a",
    centerId: "center-a",
    familyId: "family-a",
    uploadedById: "user-a",
    contentType: "text/plain",
  }), /^message-attachments\/tenant-a\/center-a\/family-a\/user-a\/\d{4}\/\d{2}\/[0-9a-f-]+\.txt$/);
});
