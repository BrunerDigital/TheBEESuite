import "./load-env";
import { CHILD_MEDIA_BUCKET, getSupabaseStorageClient } from "@/lib/supabase-storage";

async function main() {
  const client = getSupabaseStorageClient();
  const bucketConfig = {
    public: false,
    allowedMimeTypes: ["image/*"],
    fileSizeLimit: "8MB",
  };

  const { data: existing, error: getError } = await client.storage.getBucket(CHILD_MEDIA_BUCKET);
  if (getError && !getError.message.toLowerCase().includes("not found")) {
    throw new Error(`Could not inspect bucket: ${getError.message}`);
  }

  if (existing) {
    const { error } = await client.storage.updateBucket(CHILD_MEDIA_BUCKET, bucketConfig);
    if (error) throw new Error(`Could not update bucket: ${error.message}`);
    console.log(`Updated private Supabase Storage bucket "${CHILD_MEDIA_BUCKET}".`);
    return;
  }

  const { error } = await client.storage.createBucket(CHILD_MEDIA_BUCKET, bucketConfig);
  if (error) throw new Error(`Could not create bucket: ${error.message}`);
  console.log(`Created private Supabase Storage bucket "${CHILD_MEDIA_BUCKET}".`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
