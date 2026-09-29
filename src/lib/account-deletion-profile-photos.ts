import type { SupabaseClient } from "@supabase/supabase-js";
import { readProfilePhotoFields } from "./profile-photo";
import { getSupabaseStorageClient, PROFILE_PHOTO_BUCKET } from "./supabase-storage";

/** Remove current and replaced personal avatars; never traverse school media. */
export async function deleteAccountProfilePhotos(input: { tenantId: string; userId: string; customFields: unknown }, client?: SupabaseClient) {
  // Match the uploader's path without allowing normalization collisions or traversal.
  for (const id of [input.tenantId, input.userId]) {
    if (!/^[a-z0-9_-]{1,80}$/.test(id)) throw new Error("The profile photo account path needs operator review.");
  }
  const prefix = `profile-photos/${input.tenantId}/${input.userId}`;
  const current = readProfilePhotoFields(input.customFields);
  if (current.storageKey && (!current.storageKey.startsWith(`${prefix}/`) || current.bucket && current.bucket !== PROFILE_PHOTO_BUCKET)) {
    throw new Error("The stored profile photo needs operator review before deletion can complete.");
  }
  const storage = (client ?? getSupabaseStorageClient()).storage.from(PROFILE_PHOTO_BUCKET);
  const paths: string[] = [];
  async function collect(folder: string, depth: number) {
    for (let offset = 0; ; offset += 100) {
      const { data, error } = await storage.list(folder, { limit: 100, offset, sortBy: { column: "name", order: "asc" } });
      if (error || !data) throw new Error("Personal profile photo cleanup could not be verified.");
      for (const entry of data) {
        if (!entry.id && depth < 2 && (depth === 0 ? /^\d{4}$/ : /^(0[1-9]|1[0-2])$/).test(entry.name)) {
          await collect(`${folder}/${entry.name}`, depth + 1);
        } else if (entry.id && depth === 2 && /^[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$/i.test(entry.name)) {
          paths.push(`${folder}/${entry.name}`);
        } else throw new Error("An unexpected personal profile photo path needs operator review.");
        if (paths.length > 10000) throw new Error("Personal profile photo cleanup needs a larger operator batch.");
      }
      if (data.length < 100) break;
    }
  }
  // Collect before deleting so pagination never skips files after an earlier batch.
  await collect(prefix, 0);
  for (let index = 0; index < paths.length; index += 100) {
    const { error } = await storage.remove(paths.slice(index, index + 100));
    if (error) throw new Error("Personal profile photo cleanup is incomplete; retry the same deletion request.");
  }
  return paths.length;
}
