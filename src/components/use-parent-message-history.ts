"use client";

import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import { appendEarlierParentMessages, isParentMessagePage, type ParentMessageView } from "@/lib/parent-message-history";

type Request = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
export function useParentMessageHistory(input: {
  familyId: string; messages: ParentMessageView[]; nextCursor: string | null; enabled: boolean;
  timeline: RefObject<HTMLOListElement | null>; request: Request;
}) {
  const { familyId, messages, nextCursor, enabled, timeline, request } = input;
  const freshHistory = { familyId, source: messages, sourceNextCursor: nextCursor, enabled, items: messages, nextCursor };
  const [history, setHistory] = useState(freshHistory);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const activeFamily = useRef(familyId);
  const generation = useRef(0);
  const anchor = useRef<{ height: number; top: number } | null>(null);
  const sourceChanged = history.familyId !== familyId || history.source !== messages || history.sourceNextCursor !== nextCursor || history.enabled !== enabled;
  // Reset derived state before rendering a new server/family snapshot, not in a cascading effect.
  if (sourceChanged) { setHistory(freshHistory); setLoading(false); setNotice(""); }
  const currentHistory = sourceChanged ? freshHistory : history;
  useLayoutEffect(() => {
    activeFamily.current = familyId; generation.current += 1;
    controller.current?.abort(); controller.current = null; anchor.current = null;
    return () => { generation.current += 1; controller.current?.abort(); };
  }, [familyId, messages, nextCursor, enabled]);
  useLayoutEffect(() => {
    const list = timeline.current;
    if (anchor.current && list) {
      list.scrollTo({ top: anchor.current.top + list.scrollHeight - anchor.current.height, behavior: "instant" });
      anchor.current = null;
    }
  }, [history, timeline]);

  async function loadEarlier() {
    if (!enabled || controller.current || !currentHistory.nextCursor) return;
    const capturedCursor = currentHistory.nextCursor, capturedFamily = familyId, capturedGeneration = generation.current;
    const abort = new AbortController(); controller.current = abort; setLoading(true); setNotice("");
    const current = () => !abort.signal.aborted && controller.current === abort && activeFamily.current === capturedFamily && generation.current === capturedGeneration;
    try {
      const params = new URLSearchParams({ familyId: capturedFamily, cursor: capturedCursor });
      const response = await request(`/api/parent/history/messages?${params}`, { method: "GET", cache: "no-store", signal: abort.signal });
      const result: unknown = await response.json().catch(() => null);
      if (!current()) return;
      if (!response.ok || !isParentMessagePage(result, capturedFamily, capturedCursor)) throw new Error("Unverified message history");
      const list = timeline.current;
      anchor.current = list ? { height: list.scrollHeight, top: list.scrollTop } : null;
      setHistory(previous => ({ ...previous, items: appendEarlierParentMessages(previous.items, result.items), nextCursor: result.nextCursor }));
      setNotice(result.items.length ? `${result.items.length} earlier message${result.items.length === 1 ? "" : "s"} loaded. Your draft is unchanged.` : "You have reached the start of this conversation.");
    } catch {
      if (current()) setNotice("Earlier messages could not be loaded. Your draft is unchanged. Try again, or sign in again if your session expired.");
    } finally {
      if (current()) { controller.current = null; setLoading(false); }
    }
  }
  return { messages: enabled ? currentHistory.items : messages, nextCursor: enabled ? currentHistory.nextCursor : null, notice, loading, loadEarlier };
}
