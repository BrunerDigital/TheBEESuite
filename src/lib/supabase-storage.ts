import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cleanSupabaseUrl } from "@/lib/supabase-auth";

export const CHILD_MEDIA_BUCKET = process.env.SUPABASE_CHILD_MEDIA_BUCKET || "child-media";
export const CHILD_MEDIA_SIGNED_URL_SECONDS = Number(process.env.SUPABASE_CHILD_MEDIA_SIGNED_URL_SECONDS || 60 * 60 * 2);
export const CHILD_MEDIA_MAX_BYTES = 8 * 1024 * 1024;

type StorageClient = SupabaseClient;

function getSupabaseStorageKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
}

export function isSupabaseStorageConfigured() {
  return Boolean(cleanSupabaseUrl(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) && getSupabaseStorageKey());
}

export function getSupabaseStorageClient(): StorageClient {
  const url = cleanSupabaseUrl(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = getSupabaseStorageKey();
  if (!url || !key) throw new Error("Supabase Storage environment variables are not configured.");

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

function safePathPart(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "unassigned";
}

function extensionFor(contentType: string, originalName?: string) {
  const fromName = originalName?.split(".").pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{2,5}$/.test(fromName)) return fromName;
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  if (contentType === "image/gif") return "gif";
  return "jpg";
}

export function buildChildMediaPath({
  tenantId,
  centerId,
  classroomId,
  childId,
  originalName,
  contentType,
}: {
  tenantId: string;
  centerId?: string | null;
  classroomId?: string | null;
  childId: string;
  originalName?: string;
  contentType: string;
}) {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const ext = extensionFor(contentType, originalName);
  return [
    safePathPart(tenantId),
    safePathPart(centerId || "center"),
    safePathPart(classroomId || "classroom"),
    safePathPart(childId),
    String(year),
    month,
    `${randomUUID()}.${ext}`,
  ].join("/");
}

export async function uploadChildMediaBuffer({
  bytes,
  contentType,
  originalName,
  tenantId,
  centerId,
  classroomId,
  childId,
}: {
  bytes: Buffer;
  contentType: string;
  originalName?: string;
  tenantId: string;
  centerId?: string | null;
  classroomId?: string | null;
  childId: string;
}) {
  if (!contentType.startsWith("image/")) throw new Error("Only image uploads are supported.");
  if (bytes.byteLength > CHILD_MEDIA_MAX_BYTES) throw new Error("Photo must be 8MB or smaller.");

  const client = getSupabaseStorageClient();
  const storageKey = buildChildMediaPath({ tenantId, centerId, classroomId, childId, originalName, contentType });
  const { error: uploadError } = await client.storage.from(CHILD_MEDIA_BUCKET).upload(storageKey, bytes, {
    cacheControl: "3600",
    contentType,
    upsert: false,
  });
  if (uploadError) throw new Error(uploadError.message);

  const signedUrl = await createChildMediaSignedUrl(storageKey);
  return {
    bucket: CHILD_MEDIA_BUCKET,
    storageKey,
    recordUrl: `supabase://${CHILD_MEDIA_BUCKET}/${storageKey}`,
    signedUrl,
  };
}

export async function createChildMediaSignedUrl(storageKey: string, expiresIn = CHILD_MEDIA_SIGNED_URL_SECONDS) {
  const client = getSupabaseStorageClient();
  const { data, error } = await client.storage.from(CHILD_MEDIA_BUCKET).createSignedUrl(storageKey, expiresIn);
  if (error || !data?.signedUrl) throw new Error(error?.message || "Could not create signed media URL.");
  return data.signedUrl;
}

export async function signChildMediaRecords<T extends { url: string; storageKey?: string | null }>(records: T[]) {
  return Promise.all(
    records.map(async (record) => {
      if (!record.storageKey || record.storageKey.startsWith("inline-demo-upload")) return record;
      try {
        return { ...record, url: await createChildMediaSignedUrl(record.storageKey) };
      } catch {
        return record;
      }
    }),
  );
}
