export type RecordPagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  from: number;
  to: number;
  skip: number;
};

export function recordPagination(requested: unknown, total: number, pageSize = 50): RecordPagination {
  const candidate = typeof requested === "string" && /^[1-9]\d*$/.test(requested) ? Number(requested) : 1;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Number.isSafeInteger(candidate) ? Math.min(candidate, totalPages) : 1;
  const skip = (page - 1) * pageSize;
  return { page, pageSize, total, totalPages, skip, from: total ? skip + 1 : 0, to: Math.min(skip + pageSize, total) };
}

export type LinkedRecordPagination = RecordPagination & { previousHref: string | null; nextHref: string | null };

export function teamPermissionsHref(query: string, peoplePage: number, sessionPage: number, section: "user-directory" | "device-sessions") {
  const params = new URLSearchParams({ view: "permissions" });
  if (query) params.set("q", query);
  if (peoplePage > 1) params.set("peoplePage", String(peoplePage));
  if (sessionPage > 1) params.set("sessionPage", String(sessionPage));
  return `/staff?${params}#${section}`;
}
