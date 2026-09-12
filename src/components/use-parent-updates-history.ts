"use client";

import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { appendParentUpdateRows, isParentUpdatesPage, type ParentUpdatesPage, type ParentUpdatesRequest } from "@/lib/parent-updates-history";

type Stream = "reports" | "photos";
type Request = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
export function useParentUpdatesHistory({ familyId, initial, enabled, request, timeline }: {
  familyId: string; initial: ParentUpdatesPage | null; enabled: boolean; request: Request; timeline?: RefObject<HTMLDivElement | null>;
}) {
  const fresh = { familyId, source: initial, enabled, page: initial?.familyId === familyId ? initial : null };
  const [history, setHistory] = useState(fresh);
  const [loading, setLoading] = useState<Stream | null>(null);
  const [notice, setNotice] = useState("");
  const controller = useRef<AbortController | null>(null), generation = useRef(0);
  const activeFamily = useRef(familyId);
  const focusAnchor = useRef<{ id: string; initiator: HTMLElement } | null>(null);
  const changed = history.familyId !== familyId || history.source !== initial || history.enabled !== enabled;
  if (changed) { setHistory(fresh); setLoading(null); setNotice(""); }
  const current = changed ? fresh : history;
  useLayoutEffect(() => {
    activeFamily.current = familyId; generation.current += 1; controller.current?.abort(); controller.current = null; focusAnchor.current = null;
    return () => { generation.current += 1; controller.current?.abort(); };
  }, [familyId, initial, enabled]);
  useLayoutEffect(() => {
    const anchor = focusAnchor.current; focusAnchor.current = null;
    if (!anchor || (document.activeElement !== anchor.initiator && (anchor.initiator.isConnected || document.activeElement !== document.body))) return;
    const row = timeline?.current?.querySelector<HTMLElement>(`[data-update-id="${CSS.escape(anchor.id)}"]`);
    row?.focus({ preventScroll: true }); row?.scrollIntoView({ block: "start", behavior: "instant" });
  }, [history, timeline]);
  async function loadMore(kind: Stream, initiator?: HTMLElement) {
    const page = current.page, cursor = kind === "reports" ? page?.nextReportCursor : page?.nextPhotoCursor;
    if (!enabled || controller.current || !page?.day || page.familyId !== familyId || !cursor) return;
    const input: ParentUpdatesRequest = { familyId, day: page.day, kind, cursor }, captured = generation.current;
    const abort = new AbortController(); controller.current = abort; setLoading(kind); setNotice("");
    const matches = () => !abort.signal.aborted && controller.current === abort && activeFamily.current === familyId && generation.current === captured;
    try {
      const params = new URLSearchParams({ familyId, day: page.day, kind, cursor });
      const response = await request(`/api/parent/history/updates?${params}`, { method: "GET", cache: "no-store", signal: abort.signal });
      const result: unknown = await response.json().catch(() => null);
      if (!matches()) return;
      if (!response.ok || !isParentUpdatesPage(result, input, page.timeZone)) throw new Error("Unverified updates receipt");
      const anchor = kind === "reports" ? page.reports.find(row => row.id === cursor) : page.photos.find(row => row.id === cursor);
      const rows = kind === "reports" ? result.reports : result.photos;
      const time = (row: typeof rows[number]) => new Date("date" in row ? row.date : row.takenAt).getTime();
      if (!anchor || rows.some(row => time(row) > time(anchor) || (time(row) === time(anchor) && row.id >= anchor.id))) throw new Error("Unverified update continuation");
      if (initiator && document.activeElement === initiator) focusAnchor.current = { id: rows[0]?.id ?? cursor, initiator };
      setHistory(previous => ({ ...previous, page: previous.page && (kind === "reports"
        ? { ...previous.page, reports: appendParentUpdateRows(previous.page.reports, result.reports), nextReportCursor: result.nextReportCursor }
        : { ...previous.page, photos: appendParentUpdateRows(previous.page.photos, result.photos), nextPhotoCursor: result.nextPhotoCursor }) }));
      setNotice(rows.length ? `${rows.length} more ${rows.length === 1 ? kind.slice(0, -1) : kind} loaded for this date.` : `All shared ${kind} for this date are loaded.`);
    } catch {
      if (matches()) setNotice(`More ${kind} could not be loaded. The current day and loaded updates are unchanged. Try again, or sign in again if your session expired.`);
    } finally {
      if (matches()) { controller.current = null; setLoading(null); }
    }
  }
  return { page: current.page, loading, notice, loadMore };
}
