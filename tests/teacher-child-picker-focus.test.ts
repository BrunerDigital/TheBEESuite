import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { revealFocusedTeacherChildPicker } from "../src/lib/teacher-child-picker-focus";

function fixture({ top = 200, bottom = 244, focused = true, connected = true, open = false, headerPosition = "sticky", navHidden = false } = {}) {
  const calls: ScrollIntoViewOptions[] = [];
  const header = { getBoundingClientRect: () => ({ bottom: 132 }) };
  const nav = { getBoundingClientRect: () => ({ top: navHidden ? 0 : 779, height: navHidden ? 0 : 65 }) };
  const trigger = {
    isConnected: connected,
    getAttribute: () => open ? "true" : "false",
    getBoundingClientRect: () => ({ top, bottom }),
    closest: () => ({ querySelector: (selector: string) => selector === ".app-header" ? header : nav }),
    scrollIntoView: (options: ScrollIntoViewOptions) => calls.push(options),
    ownerDocument: { activeElement: null as unknown, defaultView: { innerHeight: 844, getComputedStyle: () => ({ position: headerPosition }) } },
  };
  trigger.ownerDocument.activeElement = focused ? trigger : {};
  return { trigger: trigger as unknown as HTMLElement, calls };
}

test("picker reveals focused control covered by sticky header after draft layout shrinks", () => {
  const { trigger, calls } = fixture({ top: 18, bottom: 62 });
  assert.equal(revealFocusedTeacherChildPicker(trigger), true);
  assert.deepEqual(calls, [{ block: "nearest", behavior: "instant" }]);
});
test("picker reveals bottom-nav overlap but leaves visible and short-screen controls in place", () => {
  for (const input of [{ top: 755, bottom: 799 }, { top: -8, bottom: 36 }]) {
    const f = fixture(input); assert.equal(revealFocusedTeacherChildPicker(f.trigger), true); assert.equal(f.calls.length, 1);
  }
  for (const input of [{}, { top: 18, bottom: 62, headerPosition: "relative" }]) {
    const f = fixture(input); assert.equal(revealFocusedTeacherChildPicker(f.trigger), false); assert.equal(f.calls.length, 0);
  }
});
test("picker never steals focus from subsequent interaction, an open popup or an unmounted control", () => {
  for (const input of [{ focused: false }, { connected: false }, { open: true }]) {
    const f = fixture({ top: 18, bottom: 62, ...input }); assert.equal(revealFocusedTeacherChildPicker(f.trigger), false); assert.equal(f.calls.length, 0);
  }
  assert.equal(revealFocusedTeacherChildPicker(null), false);
});
test("desktop hidden bottom navigation never creates a false focus obstruction", () => {
  const f = fixture({ top: 790, bottom: 830, navHidden: true });
  assert.equal(revealFocusedTeacherChildPicker(f.trigger), false);
  assert.equal(f.calls.length, 0);
});
test("only the closing initiating picker schedules visibility after settled layout", () => {
  const source = readFileSync("src/components/teacher-child-picker.tsx", "utf8");
  assert.match(source, /onOpenChangeComplete=\{open =>/);
  assert.match(source, /if \(!open\) requestAnimationFrame\(\(\) => requestAnimationFrame\(\(\) => revealFocusedTeacherChildPicker\(triggerRef.current\)\)\)/);
  assert.match(source, /<SelectTrigger ref=\{triggerRef\}/);
  assert.doesNotMatch(readFileSync("src/lib/teacher-child-picker-focus.ts", "utf8"), /\.focus\(/);
});
