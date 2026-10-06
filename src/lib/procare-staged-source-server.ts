import { createHash } from "node:crypto";
import { ASSET_HUB_BUCKET, getSupabaseStorageClient, requireAssetHubBucket } from "@/lib/supabase-storage";
import { verifyStagedSourceManifest, type StagedSourceScope } from "@/lib/procare-staged-source";

export async function readStagedSourceFiles(receipt: string, scope: StagedSourceScope) {
  const manifest = verifyStagedSourceManifest(receipt, scope, process.env.AUTH_SECRET || "");
  await requireAssetHubBucket();
  const client = getSupabaseStorageClient();
  const files: File[] = [];
  for (const file of manifest.files) {
    const { data: info, error: infoError } = await client.storage.from(ASSET_HUB_BUCKET).info(file.path);
    if (infoError || !info || info.size !== file.size) throw new Error("A report upload is incomplete or its size changed. Retry the upload with the same files.");
    const { data, error } = await client.storage.from(ASSET_HUB_BUCKET).download(file.path);
    if (error || !data || data.size !== file.size) throw new Error("A report could not be retrieved. Retry with the same selected files.");
    const bytes = new Uint8Array(await data.arrayBuffer());
    if (createHash("sha256").update(bytes).digest("hex") !== file.sha256) throw new Error("A report changed after upload. Select the unchanged source reports again.");
    files.push(new File([bytes], file.name));
  }
  return { files, manifest };
}
