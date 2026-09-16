/** Reveal only the initiating control if it still owns focus after browser/layout changes. */
export function revealFocusedPortalControl(trigger: HTMLElement | null) {
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
  // Workspace scroll margins account for shell overlays. Never refocus a later interaction.
  trigger.scrollIntoView({ block: "nearest", behavior: "instant" });
  return true;
}

/** Focus may scroll before a sticky shell or a newly selected panel has settled. */
export function scheduleFocusedPortalControlReveal(trigger: HTMLElement | null) {
  if (!trigger?.matches("a, button, input, select, textarea, summary, [role=combobox]")) return;
  const viewport = trigger.ownerDocument.defaultView;
  if (!viewport || !trigger.closest(".bee-app-frame")) return;
  viewport.requestAnimationFrame(() => viewport.requestAnimationFrame(() => revealFocusedPortalControl(trigger)));
}

export function scheduleFocusedPortalControlRevealExcept(trigger: HTMLElement | null, excludedIds: ReadonlySet<string>) {
  if (trigger && excludedIds.has(trigger.id)) return;
  scheduleFocusedPortalControlReveal(trigger);
}
