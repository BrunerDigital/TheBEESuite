import assert from "node:assert/strict";
import test from "node:test";
import { revealFocusedPortalControl } from "../src/lib/focused-portal-control";

test("short portal focus centers an obscured field without changing focus", () => {
  for (const height of [320, 844]) {
    const scrolls: ScrollIntoViewOptions[] = [];
    const document = { activeElement: null as unknown, defaultView: { innerHeight: height, innerWidth: 390 } };
    const target = { ownerDocument: document, isConnected: true, getAttribute: () => null,
      closest: (selector: string) => selector === ".bee-app-frame" ? { querySelector: () => null } : {},
      getBoundingClientRect: () => ({ top: height - 30, bottom: height + 80 }),
      scrollIntoView: (options: ScrollIntoViewOptions) => scrolls.push(options) };
    document.activeElement = target;
    assert.equal(revealFocusedPortalControl(target as unknown as HTMLElement), true);
    assert.deepEqual(scrolls, [{ block: height === 320 ? "center" : "nearest", behavior: "instant" }]);
    document.activeElement = {};
    assert.equal(revealFocusedPortalControl(target as unknown as HTMLElement), false);
    assert.equal(scrolls.length, 1);
  }
});
