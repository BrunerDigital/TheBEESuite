/** Resolve a navigation indicator from the current URL, never the last click.
 * Prefer a specific query view over its containing workspace link. Extra scope
 * and filter parameters do not prevent an otherwise exact destination match. */
export function activeShellNavigationHref(items: ReadonlyArray<{ href: string }>, pathname: string, search: string) {
  const current = new URLSearchParams(search);
  let active: string | null = null, score = -1;
  for (const { href } of items) {
    if (!href.startsWith("/") || href.startsWith("//") || href.includes("#")) continue;
    const [targetPath, query = ""] = href.split("?");
    if (targetPath !== pathname) continue;
    const parameters = [...new URLSearchParams(query)];
    if (parameters.some(([key, value]) => current.get(key) !== value)) continue;
    if (parameters.length > score) { active = href; score = parameters.length; }
  }
  return active;
}

/** The full role/context stays in the trigger's accessible name. Remove only an
 * exact duplicated role segment from its compact visual detail, never a school
 * name containing the same word. */
export function mobileScopeDetail(detail: string, role: string) {
  if (!role) return detail;
  if (detail.endsWith(` · ${role}`)) return detail.slice(0, -(` · ${role}`).length);
  if (detail.startsWith(`${role} · `)) return detail.slice(`${role} · `.length);
  return detail;
}
