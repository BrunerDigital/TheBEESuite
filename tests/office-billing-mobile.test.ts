import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import postcss from "postcss";
import { scheduleFocusedPortalControlReveal } from "../src/lib/focused-portal-control";

const css = postcss.parse(readFileSync("src/app/product-ui.css", "utf8"));
function declarations(selector: string) {
  const values: Record<string, string> = {};
  css.walkRules(rule => {
    if (rule.selector === selector) rule.walkDecls(declaration => { values[declaration.prop] = declaration.value; });
  });
  return values;
}

test("Billing task tabs wrap complete names without overriding hidden More tasks", () => {
  const rule = declarations('#billing-action-tabs > [role="tab"]');
  assert.equal(rule.flex, "0 1 auto");
  assert.equal(rule["max-width"], "100%");
  assert.equal(rule.height, "auto");
  assert.equal(rule["min-height"], "44px");
  assert.equal(rule["white-space"], "normal");
  assert.equal(rule.display, undefined);
  const source = readFileSync("src/components/billing-workbench.tsx", "utf8");
  for (const action of ["edit", "batch", "weekly-recovery", "payroll", "refund", "agency"]) {
    assert.ok(source.includes(`!moreBillingActionsExpanded && billingAction !== "${action}"`), action);
  }
});

test("Terminal and shared task grids collapse with available width and enlarged text", () => {
  for (const selector of [".director-payment-terminal-workspace .terminal-payment-layout", ".workspace-section-directory .workspace-section-directory-grid", ".office-billing-workspace .billing-additional-line"]) {
    assert.match(declarations(selector)["grid-template-columns"], /^repeat\(auto-fit, minmax\(min\(100%, \d+rem\), 1fr\)\)$/);
  }
  const terminal = readFileSync("src/components/director-payment-terminal-workspace.tsx", "utf8");
  assert.match(terminal, /terminal-payment-layout grid grid-cols-1/);
  assert.match(terminal, /className="terminal-review-value block font-semibold"/);
  assert.doesNotMatch(terminal, /minmax\(28rem|block truncate font-semibold/);
  for (const guard of ["if (targetLocked || !families.some", "if (targetLocked || (nextTarget", "if (targetLocked) return;"]) assert.ok(terminal.includes(guard));
});

test("office focus waits for layout and cannot steal a later interaction", () => {
  for (const retainedFocus of [true, false]) {
    const frames: FrameRequestCallback[] = [], scrolls: ScrollIntoViewOptions[] = [];
    const document = { activeElement: null as unknown, defaultView: { innerHeight: 568, requestAnimationFrame: (callback: FrameRequestCallback) => frames.push(callback) } };
    const target = { ownerDocument: document, matches: () => true, closest: () => ({ querySelector: () => null }), isConnected: true, getAttribute: () => null, getBoundingClientRect: () => ({ top: 540, bottom: 584 }), scrollIntoView: (options: ScrollIntoViewOptions) => scrolls.push(options) };
    document.activeElement = target;
    scheduleFocusedPortalControlReveal(target as unknown as HTMLElement);
    assert.equal(frames.length, 1); assert.deepEqual(scrolls, []);
    frames.shift()!(0); assert.equal(frames.length, 1); assert.deepEqual(scrolls, []);
    if (!retainedFocus) document.activeElement = {};
    frames.shift()!(0); assert.equal(scrolls.length, retainedFocus ? 1 : 0);
  }
  for (const file of ["billing-workbench", "family-ledger-card", "director-payment-terminal-workspace"]) {
    assert.match(readFileSync(`src/components/${file}.tsx`, "utf8"), /onFocusCapture=\{event => scheduleFocusedPortalControlReveal\(event.target\)\}/);
  }
  assert.doesNotMatch(readFileSync("src/lib/focused-portal-control.ts", "utf8"), /\.focus\(/);
});

test("office selectors preserve full values and invoice history keeps its own boundary", () => {
  const selector = ':is(.director-payment-terminal-workspace, .office-billing-workspace) [data-slot="select-value"]';
  const rule = declarations(selector);
  assert.equal(rule["min-width"], "0");
  assert.equal(rule["white-space"], "normal");
  assert.equal(rule["-webkit-line-clamp"], "unset");
  assert.equal(rule.overflow, "visible");
  assert.match(readFileSync("src/components/family-ledger-card.tsx", "utf8"), /office-billing-workspace glass-panel/);
  assert.equal(declarations("#billing-family-overview .truncate")["white-space"], "normal");
  assert.equal(declarations(".director-payment-terminal-workspace .terminal-review-value")["overflow-wrap"], "anywhere");
  for (const selector of ["#family-ledger .ledger-heading-layout", "#family-ledger .ledger-date-grid", "#billing-family-overview .billing-summary-grid"]) {
    assert.match(declarations(selector)["grid-template-columns"], /^repeat\(auto-fit, minmax\(min\(100%, \d+rem\), 1fr\)\)$/);
  }
  assert.equal(declarations('#family-ledger input[type="date"]')["min-height"], "44px");
  assert.equal(declarations('#family-ledger input[type="date"]')["padding-inline"], "10px");
  assert.equal(declarations('.office-billing-workspace [data-slot="badge"]').height, "auto");
  assert.equal(declarations('.office-billing-workspace [data-slot="badge"]')["border-radius"], "var(--radius-lg)");
  assert.equal(declarations('.office-billing-workspace [data-slot="badge"]')["white-space"], "normal");
});
