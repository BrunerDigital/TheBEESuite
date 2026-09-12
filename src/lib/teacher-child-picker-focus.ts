/** Reveal only the initiating picker if it still owns focus after popup/layout changes. */
export function revealFocusedTeacherChildPicker(trigger: HTMLElement | null) {
  if (!trigger?.isConnected || trigger.ownerDocument.activeElement !== trigger || trigger.getAttribute("aria-expanded") === "true") return false;
  const viewport = trigger.ownerDocument.defaultView;
  if (!viewport) return false;
  const frame = trigger.closest(".bee-app-frame");
  const header = frame?.querySelector<HTMLElement>(".app-header");
  const navigation = frame?.querySelector<HTMLElement>(".app-bottom-navigation");
  const headerPosition = header ? viewport.getComputedStyle(header).position : "";
  const top = header && ["sticky", "fixed"].includes(headerPosition) ? Math.max(0, header.getBoundingClientRect().bottom) : 0;
  const navBounds = navigation?.getBoundingClientRect();
  const bottom = navBounds && navBounds.height > 0 ? Math.min(viewport.innerHeight, navBounds.top) : viewport.innerHeight;
  const bounds = trigger.getBoundingClientRect();
  if (bounds.top >= top + 12 && bounds.bottom <= bottom - 12) return false;
  // Existing workspace scroll margins account for the sticky header and bottom nav.
  // Never refocus: a subsequent keyboard/touch action remains in control.
  trigger.scrollIntoView({ block: "nearest", behavior: "instant" });
  return true;
}
