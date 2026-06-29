import { createMessageAttachmentSignedUrl } from "@/lib/supabase-storage";

export type StoredMessageAttachment = {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  bucket: string;
  storageKey: string;
  url: string;
  kind: "image" | "file";
  uploadedAt: string;
  uploadedById: string;
};

export type MessageAttachmentView = StoredMessageAttachment & {
  downloadUrl: string | null;
};

export function messageAttachmentKind(contentType: string): StoredMessageAttachment["kind"] {
  return contentType.startsWith("image/") ? "image" : "file";
}

function recordFromUnknown(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringField(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberField(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function messageAttachmentsFromMetadata(metadata: unknown): StoredMessageAttachment[] {
  const fields = recordFromUnknown(metadata);
  const attachments = Array.isArray(fields.attachments) ? fields.attachments : [];

  return attachments.flatMap((item) => {
    const attachment = recordFromUnknown(item);
    const id = stringField(attachment.id);
    const filename = stringField(attachment.filename);
    const contentType = stringField(attachment.contentType);
    const bucket = stringField(attachment.bucket);
    const storageKey = stringField(attachment.storageKey);
    const url = stringField(attachment.url);
    const uploadedAt = stringField(attachment.uploadedAt);
    const uploadedById = stringField(attachment.uploadedById);
    const size = numberField(attachment.size);
    const kind = attachment.kind === "image" ? "image" : "file";

    if (!id || !filename || !contentType || !bucket || !storageKey || !url || !uploadedAt || !uploadedById || size === null) {
      return [];
    }

    return [{
      id,
      filename,
      contentType,
      size,
      bucket,
      storageKey,
      url,
      kind,
      uploadedAt,
      uploadedById,
    }];
  });
}

export async function signMessageAttachmentsFromMetadata(metadata: unknown): Promise<MessageAttachmentView[]> {
  const attachments = messageAttachmentsFromMetadata(metadata);
  return Promise.all(
    attachments.map(async (attachment) => {
      try {
        return { ...attachment, downloadUrl: await createMessageAttachmentSignedUrl(attachment.storageKey) };
      } catch {
        return { ...attachment, downloadUrl: attachment.url.startsWith("http") ? attachment.url : null };
      }
    }),
  );
}
