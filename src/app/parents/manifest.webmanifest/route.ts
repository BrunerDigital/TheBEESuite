import { buildStoreAppManifest, storeApps } from "@/lib/app-store-apps";

export const dynamic = "force-static";

export function GET() {
  return new Response(JSON.stringify(buildStoreAppManifest(storeApps.parent)), {
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
