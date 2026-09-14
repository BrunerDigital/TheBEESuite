"use client";

import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { appendEarlierParentAnnouncements, isEarlierParentAnnouncement, isParentAnnouncementPage, type ParentAnnouncementView } from "@/lib/parent-announcement-history";

type Request = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
export function useParentAnnouncementHistory(input: {
  familyId: string; announcements: ParentAnnouncementView[]; nextCursor: string | null; enabled: boolean; unavailable: boolean;
  container: RefObject<HTMLElement | null>; request: Request;
}) {
  const { familyId, announcements, nextCursor, enabled, unavailable, container, request } = input;
  const fresh = { familyId, source: announcements, sourceCursor: nextCursor, enabled, sourceUnavailable: unavailable, items: announcements, nextCursor, unavailable };
  const [history, setHistory] = useState(fresh), [notice, setNotice] = useState(""), [loading, setLoading] = useState(false);
  const controller = useRef<AbortController | null>(null), generation = useRef(0);
  const focus = useRef<{ id: string | null; trigger: HTMLElement } | null>(null);
  const changed = history.familyId !== familyId || history.source !== announcements || history.sourceCursor !== nextCursor || history.enabled !== enabled || history.sourceUnavailable !== unavailable;
  if (changed) { setHistory(fresh); setNotice(""); setLoading(false); }
  const currentHistory = changed ? fresh : history;
  useLayoutEffect(() => {
    generation.current += 1; controller.current?.abort(); controller.current = null; focus.current = null;
    return () => { generation.current += 1; controller.current?.abort(); };
  }, [familyId, announcements, nextCursor, enabled, unavailable]);
  useLayoutEffect(() => {
    const target = focus.current; focus.current = null;
    if (!target || document.activeElement !== target.trigger && (target.trigger.isConnected || document.activeElement !== document.body)) return;
    const item = target.id ? [...(container.current?.querySelectorAll<HTMLElement>("[data-announcement-id]") ?? [])].find(node => node.dataset.announcementId === target.id)
      : container.current?.querySelector<HTMLElement>("[data-announcement-history-status]");
    item?.focus({ preventScroll: true }); item?.scrollIntoView({ block: "nearest", behavior: "instant" });
  }, [history, container]);

  async function loadEarlier(trigger: HTMLElement) {
    if (!enabled || controller.current || !currentHistory.nextCursor && !currentHistory.unavailable) return;
    const capturedCursor = currentHistory.unavailable ? null : currentHistory.nextCursor;
    const capturedGeneration = generation.current, abort = new AbortController();
    const anchor = capturedCursor ? currentHistory.items.find(item => item.id === capturedCursor) : null;
    if (capturedCursor && !anchor) { setNotice("Refresh the page to reload announcement history."); return; }
    controller.current = abort; setLoading(true); setNotice("");
    const current = () => !abort.signal.aborted && controller.current === abort && generation.current === capturedGeneration;
    try {
      const params = new URLSearchParams({ familyId }); if (capturedCursor) params.set("cursor", capturedCursor);
      const response = await request(`/api/parent/history/announcements?${params}`, { method: "GET", cache: "no-store", signal: abort.signal });
      const result: unknown = await response.json().catch(() => null);
      if (!current()) return;
      if (!response.ok || !isParentAnnouncementPage(result, familyId, capturedCursor) || anchor && result.items.some(item => !isEarlierParentAnnouncement(item, anchor))) throw new Error("Unverified school announcement history");
      const firstNew = result.items.find(item => !currentHistory.items.some(loaded => loaded.id === item.id));
      focus.current = document.activeElement === trigger ? { id: firstNew?.id ?? null, trigger } : null;
      setHistory(previous => ({ ...previous, items: capturedCursor ? appendEarlierParentAnnouncements(previous.items, result.items) : result.items, nextCursor: result.nextCursor, unavailable: false }));
      setNotice(result.items.length ? `${result.items.length} ${capturedCursor ? "earlier " : ""}announcement${result.items.length === 1 ? "" : "s"} loaded.${result.nextCursor ? "" : " You have reached the end of the available notices."}` : "You have reached the end of the available notices.");
    } catch {
      if (current()) setNotice("Announcements could not be loaded. Your current notices are unchanged. Try again, or refresh the page if your access or history has changed.");
    } finally { if (current()) { controller.current = null; setLoading(false); } }
  }
  return { announcements: enabled ? currentHistory.items : announcements, nextCursor: enabled ? currentHistory.nextCursor : null,
    unavailable: enabled ? currentHistory.unavailable : unavailable, notice, loading, loadEarlier };
}
