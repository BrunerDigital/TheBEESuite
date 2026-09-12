import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parentAttentionScope, parentIncidentOrder, parentInvoiceOrder, prioritizeParentAttentionRecords, remainingParentIncidentCount } from "../src/lib/parent-attention";

test("older actionable records remain reachable despite twenty newer completed records", () => {
  const paid = Array.from({ length: 25 }, (_, index) => ({ id: `paid-${index}`, status: "PAID" }));
  const open = { id: "older-open", status: "OPEN" };
  const invoices = prioritizeParentAttentionRecords(paid.slice(0, 20), open);
  assert.equal(invoices[0], open); assert.equal(invoices.length, 20); assert.equal(new Set(invoices.map((row) => row.id)).size, 20);
  const acknowledged = Array.from({ length: 25 }, (_, index) => ({ id: `ack-${index}`, parentAcknowledgedAt: new Date() }));
  const incident = { id: "older-unacknowledged", parentAcknowledgedAt: null };
  const incidents = prioritizeParentAttentionRecords<{ id: string; parentAcknowledgedAt: Date | null }>(acknowledged.slice(0, 20), incident);
  assert.equal(incidents[0], incident); assert.equal(incidents.length, 20);
  assert.deepEqual(prioritizeParentAttentionRecords([open, ...paid.slice(0, 19)], open), [open, ...paid.slice(0, 19)]);
  assert.deepEqual(parentInvoiceOrder.at(-1), { id: "desc" }); assert.deepEqual(parentIncidentOrder.at(-1), { id: "desc" });
});

test("payment-continuity invoices remain visible while child incidents require current matching family ownership", () => {
  const scope = parentAttentionScope({ familyId: "fake-family", childIds: ["fake-child"], currentFamily: true });
  assert.deepEqual(scope.invoice, { billingAccount: { is: { familyId: "fake-family" } } });
  assert.deepEqual(scope.incident, { AND: [{ childId: { in: ["fake-child"] } }, { child: { is: { familyId: "fake-family", enrollmentStatus: { in: ["enrolled", "active", "current"] }, classroomId: { not: null } } } }] });
  assert.deepEqual(scope.openInvoice, { AND: [scope.invoice, { status: "OPEN" }] });
  assert.deepEqual(scope.unacknowledgedIncident, { AND: [scope.incident, { parentAcknowledgedAt: null }] });
  for (const input of [{ currentFamily: false, childIds: ["fake-child"] }, { currentFamily: true, childIds: [] }]) {
    const denied = parentAttentionScope({ familyId: "fake-family", ...input });
    assert.deepEqual(denied.invoice, scope.invoice); assert.deepEqual(denied.incident, { id: { in: [] } });
  }
});

test("confirmed incident acknowledgments do not subtract twice after a server refresh", () => {
  const optimistic = new Set(["first", "old-page"]);
  assert.equal(remainingParentIncidentCount(5, [{ id: "first", parentAcknowledgedAt: null }], optimistic), 4);
  assert.equal(remainingParentIncidentCount(4, [{ id: "first", parentAcknowledgedAt: "2026-09-12T00:00:00Z" }], optimistic), 4);
  assert.equal(remainingParentIncidentCount(0, [{ id: "first", parentAcknowledgedAt: null }], optimistic), 0);
});

test("counts and priority records use identical scope inside one bounded snapshot", () => {
  const page = readFileSync("src/app/[slug]/page.tsx", "utf8");
  for (const [model, name] of [["invoice", "openInvoice"], ["incidentReport", "unacknowledgedIncident"]]) {
    assert.match(page, new RegExp(`prisma\\.${model}\\.count\\(\\{ where: attentionScope\\.${name} \\}\\)`));
    assert.match(page, new RegExp(`prisma\\.${model}\\.findFirst\\(\\{ where: attentionScope\\.${name}`));
  }
  assert.match(page, /const invoices = prioritizeParentAttentionRecords\(invoiceRows, firstOpenInvoice\)/);
  assert.match(page, /const incidents = prioritizeParentAttentionRecords\(incidentRows, firstUnacknowledgedIncident\)/);
  assert.match(page, /attentionSummary=\{\{ openInvoiceCount, unacknowledgedIncidentCount \}\}/);
  const client = readFileSync("src/components/parent-portal-workspace.tsx", "utf8");
  assert.match(client, /documentActionCount \+\s*openInvoiceCount \+\s*unacknowledgedIncidentCount/);
  assert.doesNotMatch(client, /open invoice records are listed below/);
});
