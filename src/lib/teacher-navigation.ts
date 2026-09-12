type TeacherLocation = { pathname: string; search: string; previewMode?: boolean };

export function isTeacherWorkspaceLocation({ pathname, search, previewMode = false }: TeacherLocation) {
  return pathname === "/teacher-portal" || (previewMode && pathname === "/device-preview" && new URLSearchParams(search).get("view") === "teacher");
}

/** A literal fragment preserves every current query and lets native hash events
 * reach the existing disclosure/focus handler without a route remount. */
export function teacherTaskHref(href: string, location: TeacherLocation) {
  return isTeacherWorkspaceLocation(location) && /^\/teacher-portal#teacher-[a-z-]+$/.test(href)
    ? href.slice(href.indexOf("#")) : href;
}

export function teacherActiveTask({ hash, ...location }: TeacherLocation & { hash: string }): "Today" | "Roster" | "Log" | "Messages" | null {
  if (location.pathname === "/family-detail" && new URLSearchParams(location.search).get("view") === "messages") return "Messages";
  if (!isTeacherWorkspaceLocation(location)) return null;
  let target: string;
  try { target = decodeURIComponent(hash.replace(/^#/, "")); } catch { return null; }
  if (!target || target === "teacher-home-heading") return "Today";
  if (["teacher-roster", "teacher-attendance", "teacher-location"].includes(target)) return "Roster";
  if (["teacher-quick-log", "teacher-daily-report", "teacher-photo", "teacher-incident"].includes(target)) return "Log";
  return null;
}
