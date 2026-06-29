import assert from "node:assert/strict";
import test from "node:test";
import { messageAttachmentKind, messageAttachmentsFromMetadata } from "@/lib/message-attachments";

test("messageAttachmentKind treats image content as image attachments", () => {
  assert.equal(messageAttachmentKind("image/png"), "image");
  assert.equal(messageAttachmentKind("application/pdf"), "file");
});

test("messageAttachmentsFromMetadata returns valid attachment records only", () => {
  const attachments = messageAttachmentsFromMetadata({
    attachments: [
      {
        id: "attachment-1",
        filename: "class-photo.png",
        contentType: "image/png",
        size: 12345,
        bucket: "child-media",
        storageKey: "message-attachments/tenant/center/thread/file.png",
        url: "supabase://child-media/message-attachments/tenant/center/thread/file.png",
        kind: "image",
        uploadedAt: "2026-06-29T12:00:00.000Z",
        uploadedById: "user-1",
      },
      { id: "missing-fields" },
    ],
  });

  assert.equal(attachments.length, 1);
  assert.equal(attachments[0].filename, "class-photo.png");
  assert.equal(attachments[0].kind, "image");
});
