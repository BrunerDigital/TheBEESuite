import { requestWithNetworkRecovery } from "./client-request-recovery";

/** Each recipient uses the existing server authorization and photo-permission checks. */
export async function shareTeacherPhoto({ childIds, rosterIds, photo, caption, fetcher = fetch }: {
  childIds: readonly string[];
  rosterIds: readonly string[];
  photo: File;
  caption: string;
  fetcher?: typeof fetch;
}) {
  const ids = [...new Set(childIds)];
  const savedChildIds: string[] = [];
  const warnings: string[] = [];
  if (!ids.length || ids.some(id => !rosterIds.includes(id))) {
    return { savedChildIds, warnings, error: "Choose current children from your roster before sharing this photo." };
  }
  // Stop on the first failure. Never retry a write whose outcome may be unknown.
  for (const childId of ids) {
    const body = new FormData();
    body.set("childId", childId);
    body.set("caption", caption);
    body.set("photo", photo);
    body.set("sharedWithParents", "true");
    const recovery = "We could not confirm whether the photo was shared. Check this child's photos before trying again to avoid a duplicate. Your photo and remaining recipients are still selected.";
    const response = await requestWithNetworkRecovery("/api/teacher/media", { method: "POST", body }, recovery, fetcher);
    const result = await response.json().catch(() => null) as { ok?: boolean; error?: string; warning?: string } | null;
    if (!response.ok || result?.ok !== true) {
      return { savedChildIds, warnings, error: response.status >= 500 || response.ok ? recovery : result?.error || "Photo could not be shared. Your remaining recipients are still selected." };
    }
    savedChildIds.push(childId);
    if (result.warning) warnings.push(result.warning);
  }
  return { savedChildIds, warnings, error: null };
}
