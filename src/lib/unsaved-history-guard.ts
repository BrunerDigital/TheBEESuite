const ENTRY_KEY = "__beeUnsavedHistory";
const installed = new WeakSet<Window>();
type GuardWindow = Window & { __beeHistoryEarlyListener?: boolean; __beeHistoryPopHandler?: (event: PopStateEvent) => void };

// The listener must precede framework hydration: Chromium runs Window-target
// popstate listeners in registration order even when capture is requested.
export const UNSAVED_HISTORY_BOOTSTRAP = 'if(!window.__beeHistoryEarlyListener){window.__beeHistoryEarlyListener=true;window.addEventListener("popstate",function(event){window.__beeHistoryPopHandler?.(event)},true)}';

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/** Track existing History API entries without adding sentinel entries or
 * storing draft contents. Install at shell startup, before client navigation.
 * Opaque framework history state is copied, never interpreted or replaced. */
export function installUnsavedHistoryGuard(browser: Window, shouldGuard: () => boolean, confirmLeave: () => boolean) {
  if (installed.has(browser)) return;
  installed.add(browser);
  const history = browser.history;
  const documentId = browser.crypto.randomUUID();
  const push = history.pushState.bind(history), replace = history.replaceState.bind(history);
  let currentIndex = 0;
  let currentUrl = browser.location.href;
  let currentState: unknown = history.state;
  let restoringIndex: number | null = null;
  const stamped = (state: unknown, position: number) => ({ ...record(state), [ENTRY_KEY]: { documentId, position } });
  const position = (state: unknown) => {
    const entry = record(record(state)[ENTRY_KEY]);
    return entry.documentId === documentId && Number.isSafeInteger(entry.position) ? entry.position as number : null;
  };
  const sameRoute = (left: string, right: string) => {
    const a = new URL(left), b = new URL(right);
    return a.origin === b.origin && a.pathname === b.pathname && a.search === b.search;
  };
  const rememberCurrent = (index: number) => { currentIndex = index; currentUrl = browser.location.href; currentState = history.state; };
  replace(stamped(history.state, currentIndex), "", currentUrl);
  currentState = history.state;

  history.pushState = (state, unused, url) => {
    const next = currentIndex + 1;
    push(stamped(state, next), unused, url);
    rememberCurrent(next);
  };
  history.replaceState = (state, unused, url) => {
    replace(stamped(state, currentIndex), unused, url);
    rememberCurrent(currentIndex);
  };

  const guardTraversal = (event: PopStateEvent) => {
    const targetIndex = position(event.state);
    const destination = browser.location.href;
    // Native hash links can create an entry without going through pushState.
    // They cannot discard this route's form; give that new entry an index too.
    if ((targetIndex === null || targetIndex === currentIndex) && destination !== currentUrl && sameRoute(currentUrl, destination)) {
      replace(stamped(event.state ?? currentState, currentIndex + 1), "", destination);
      rememberCurrent(currentIndex + 1);
      return;
    }
    // Different-document entries use the existing beforeunload protection.
    // Never guess an offset for foreign/untracked entries.
    if (targetIndex === null) return;
    if (restoringIndex !== null) {
      event.stopImmediatePropagation();
      if (targetIndex === restoringIndex) { restoringIndex = null; rememberCurrent(targetIndex); }
      else history.go(restoringIndex - targetIndex);
      return;
    }
    const hashOnly = destination !== currentUrl && sameRoute(currentUrl, destination);
    if (targetIndex !== currentIndex && !hashOnly && shouldGuard() && !confirmLeave()) {
      // popstate itself is not cancelable. Stop the router from unmounting the
      // form, then traverse back to its existing entry (no push/replace trick).
      event.stopImmediatePropagation();
      restoringIndex = currentIndex;
      history.go(currentIndex - targetIndex);
      return;
    }
    rememberCurrent(targetIndex);
  };
  const guardedWindow = browser as GuardWindow;
  if (guardedWindow.__beeHistoryEarlyListener) guardedWindow.__beeHistoryPopHandler = guardTraversal;
  else browser.addEventListener("popstate", guardTraversal, true);
}
