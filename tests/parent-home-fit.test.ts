import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { canCompactParentAccount } from "../src/lib/parent-home-account";
import { activeItemScrollDelta } from "../src/lib/horizontal-active-item";

const quiet = { billingAccount: { id: "fake-account", balanceCents: 0 }, openInvoiceCount: 0, paymentActivity: { pendingCount: 0, provisionalCreditCents: 0 } };

test("quiet account compaction requires a real account and complete zero counts, not a truncated history", () => {
  assert.equal(canCompactParentAccount(quiet), true);
  for (const change of [
    { billingAccount: null }, { billingAccount: undefined }, { billingAccount: { id: "", balanceCents: 0 } },
    { billingAccount: { id: "fake", balanceCents: -100 } }, { billingAccount: { id: "fake", balanceCents: 100 } },
    { openInvoiceCount: undefined }, { openInvoiceCount: 1 }, { openInvoiceCount: 21 },
    { paymentActivity: undefined }, { paymentActivity: { pendingCount: 1, provisionalCreditCents: 0 } },
    { paymentActivity: { pendingCount: 21, provisionalCreditCents: 0 } },
    { paymentActivity: { pendingCount: 0, provisionalCreditCents: 15000 } },
    { paymentActivity: { pendingCount: -1, provisionalCreditCents: 0 } },
  ]) assert.equal(canCompactParentAccount({ ...quiet, ...change }), false, JSON.stringify(change));
});

test("quiet summary never conceals active billing notices or unknown provisional credit", () => {
  for (const key of ["bankVerificationPending", "autopayPending", "responsibilityReview", "reauthorizationRequired", "transitionActive", "paymentContinuityAccess"] as const) {
    assert.equal(canCompactParentAccount({ ...quiet, [key]: true }), false, key);
  }
  assert.equal(canCompactParentAccount({ ...quiet, paymentActivity: { pendingCount: 0, provisionalCreditCents: Number.NaN } }), false);
});

test("active section correction changes only the minimal clipped horizontal distance", () => {
  const viewport = { left: 12, right: 308 };
  assert.equal(activeItemScrollDelta(viewport, { left: 30, right: 200 }), 0);
  assert.equal(activeItemScrollDelta(viewport, { left: 12, right: 308 }), 0);
  assert.equal(activeItemScrollDelta(viewport, { left: 310.84, right: 526.72 }), 218.72000000000003);
  assert.equal(activeItemScrollDelta(viewport, { left: -80, right: 100 }), -92);
});

test("server supplies complete pending count without changing charge queries or deriving it from visible payments", () => {
  const page = readFileSync("src/app/[slug]/page.tsx", "utf8");
  assert.match(page, /prisma\.billingAccount\.findUnique\(\{\s*where: \{ familyId \},[\s\S]*?_count: \{ select: \{ payments: \{ where: \{ status: PaymentStatus\.DRAFT \} \} \} \}/);
  assert.match(page, /paymentActivitySummary=\{\{ pendingCount: billingAccount\?\._count\.payments \?\? 0, provisionalCreditCents: pendingAchCreditCents \}\}/);
  assert.match(page, /attentionSummary=\{\{ openInvoiceCount, unacknowledgedIncidentCount \}\}/);
});

test("family tabs observe layout changes without scrolling the page or stealing focus", () => {
  const source = readFileSync("src/components/parent-portal-workspace.tsx", "utf8");
  const effect = source.slice(source.indexOf('if (activeView !== "family") return;'), source.indexOf("const activeViewCopy"));
  assert.match(effect, /new ResizeObserver/);
  assert.match(effect, /nav\.querySelectorAll\("a"\)/);
  assert.match(effect, /nav\.scrollLeft \+= delta/);
  assert.match(effect, /observer\.disconnect\(\); cancelAnimationFrame\(frame\)/);
  assert.doesNotMatch(effect, /scrollIntoView|\.focus\(/);
  assert.match(source, /min-h-11 min-w-0 max-w-full shrink-0 snap-start items-center whitespace-normal break-words/);
  assert.match(source, /paymentActivity: paymentActivitySummary/);
  assert.match(source, /Account details are not available yet/);
  assert.doesNotMatch(source, /Your family balance is current\./);
});
