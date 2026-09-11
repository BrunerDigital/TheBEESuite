"use client";

import { useEffect, useRef, type FormEvent, type MouseEvent, type ReactNode } from "react";

const PREVIEW_PATH = "/device-preview";

function requestDetails(input: RequestInfo | URL, init?: RequestInit) {
  if (input instanceof Request) {
    return {
      method: (init?.method ?? input.method ?? "GET").toUpperCase(),
      url: new URL(input.url, window.location.href),
    };
  }

  return {
    method: (init?.method ?? "GET").toUpperCase(),
    url: new URL(String(input), window.location.href),
  };
}

function isAllowedPreviewRequest(method: string, url: URL) {
  if (method !== "GET") return false;
  if (url.origin !== window.location.origin) return false;
  if (url.pathname.startsWith("/api/")) return false;

  return url.pathname === PREVIEW_PATH
    || url.pathname.startsWith(`${PREVIEW_PATH}/`)
    || url.pathname.startsWith("/_next/")
    || url.pathname.startsWith("/brand/")
    || url.pathname === "/favicon.ico";
}

/**
 * Defense in depth for the development-only UI review route.
 *
 * Preview-aware components remain the primary safety boundary. This guard also
 * blocks accidental API calls, form submissions, and navigation into a real
 * authenticated workspace while reviewers exercise nested components.
 */
export function DevicePreviewGuard({ children, rewriteWorkspaceLinks = false }: { children: ReactNode; rewriteWorkspaceLinks?: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!rewriteWorkspaceLinks || !containerRef.current) return;
    // Real dashboard components retain their real destinations as evidence, but
    // every actionable preview URL (including Open in New Tab) stays synthetic.
    function rewriteLinks() {
      containerRef.current?.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((anchor) => {
        const href = anchor.getAttribute("href");
        if (!href || href.startsWith("#") || anchor.dataset.previewDestination) return;
        const destination = new URL(href, window.location.href);
        if (destination.pathname === PREVIEW_PATH && destination.origin === window.location.origin) return;
        const preview = new URL(window.location.href);
        preview.searchParams.set("target", `${destination.pathname}${destination.search}${destination.hash}`);
        anchor.dataset.previewDestination = href;
        anchor.href = `${preview.pathname}${preview.search}`;
      });
    }
    rewriteLinks();
    const observer = new MutationObserver(rewriteLinks);
    observer.observe(containerRef.current, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [rewriteWorkspaceLinks]);
  useEffect(() => {
    const originalFetch = window.fetch.bind(window);

    document.documentElement.dataset.devicePreviewHydrated = "true";

    window.fetch = async (input, init) => {
      const { method, url } = requestDetails(input, init);
      if (!isAllowedPreviewRequest(method, url)) {
        throw new DOMException(`Blocked in UI preview: ${method} ${url.pathname}`, "NotAllowedError");
      }
      return originalFetch(input, init);
    };

    return () => {
      delete document.documentElement.dataset.devicePreviewHydrated;
      window.fetch = originalFetch;
    };
  }, []);

  function preventSubmit(event: FormEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
  }

  function trapNavigation(event: MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement | null;
    const anchor = target?.closest("a[href]");
    if (!anchor) return;

    const href = anchor.getAttribute("href");
    if (!href || href.startsWith("#")) return;

    if (anchor.hasAttribute("data-preview-destination")) {
      event.preventDefault();
      event.stopPropagation();
      // Prevent Next Link's original closure from navigating to the live route.
      window.location.assign(href);
      return;
    }

    const url = new URL(href, window.location.href);
    if (url.origin === window.location.origin && url.pathname === PREVIEW_PATH) return;

    event.preventDefault();
    event.stopPropagation();
  }

  return (
    <div ref={containerRef} data-device-preview-guard="true" onSubmitCapture={preventSubmit} onClickCapture={trapNavigation}>
      <div className="sr-only" role="status">
        UI review preview. Network actions, form submissions, and navigation to live workspaces are disabled.
      </div>
      {children}
    </div>
  );
}
