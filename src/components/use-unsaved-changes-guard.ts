"use client";

import { useEffect, useRef } from "react";

const activeUnsavedChangeGuards = new Map<symbol, string>();

function activeGuardMessage() {
  if (activeUnsavedChangeGuards.size === 1) {
    return activeUnsavedChangeGuards.values().next().value
      ?? "This page has unsaved changes. Discard them and leave this page?";
  }
  return "This page has unsaved changes. Discard them and leave this page?";
}

function warnBeforeUnload(event: BeforeUnloadEvent) {
  event.preventDefault();
  event.returnValue = "";
}

function guardLink(event: MouseEvent) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
  if (!link || link.hasAttribute("download") || (link.target && link.target !== "_self")) return;
  const destination = new URL(link.href, window.location.href);
  if (!/^https?:$/.test(destination.protocol)) return;
  if (destination.origin === window.location.origin && destination.pathname === window.location.pathname && destination.search === window.location.search) return;
  if (!window.confirm(activeGuardMessage())) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
}

function registerGuard(id: symbol, message: string) {
  const shouldAttachListeners = activeUnsavedChangeGuards.size === 0;
  activeUnsavedChangeGuards.set(id, message);
  if (!shouldAttachListeners) return;
  window.addEventListener("beforeunload", warnBeforeUnload);
  document.addEventListener("click", guardLink, true);
}

function unregisterGuard(id: symbol) {
  activeUnsavedChangeGuards.delete(id);
  if (activeUnsavedChangeGuards.size > 0) return;
  window.removeEventListener("beforeunload", warnBeforeUnload);
  document.removeEventListener("click", guardLink, true);
}

/** Protect document exits and ordinary internal links without changing native/download links. */
export function useUnsavedChangesGuard(dirty: boolean, message: string) {
  const guardId = useRef(Symbol("unsaved-change-guard"));

  useEffect(() => {
    if (!dirty) return;
    const id = guardId.current;
    registerGuard(id, message);
    return () => unregisterGuard(id);
  }, [dirty, message]);
}
