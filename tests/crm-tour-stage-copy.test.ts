import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as nodeModule from "node:module";
import test from "node:test";

// CI runs Node 24; the repository's older Node declarations omit this runtime API.
const { stripTypeScriptTypes } = nodeModule as typeof nodeModule & {
  stripTypeScriptTypes: (code: string) => string;
};
assert.equal(typeof stripTypeScriptTypes, "function", "The handler harness requires Node 24 type stripping.");

const source = readFileSync("src/components/crm/crm-workspace.tsx", "utf8");
const crm = readFileSync("src/lib/crm.ts", "utf8");

function section(start: string, end: string) {
  const first = source.indexOf(start);
  const last = source.indexOf(end, first);
  assert.ok(first >= 0 && last > first);
  return source.slice(first, last);
}

function harness({ ok = true, error = "Stage denied", stage = "NEW_INQUIRY", startsAt = "2026-10-20T10:30" } = {}) {
  const lead = { id: "lead-test", stage };
  let leads = [lead];
  let pending: Promise<void> | undefined;
  let currentStartsAt = startsAt;
  const requests: Array<{ url: string; method: string; body: Record<string, unknown> }> = [];
  const statuses: string[] = [];
  const errors: string[] = [];
  const deps = {
    leads,
    selectedLead: lead,
    draggingLeadId: lead.id,
    tourStartsAt: startsAt,
    tourNotes: "Synthetic tour",
    timeZone: "UTC",
    zonedDateTimeLocalToUtc: (value: string) => new Date(`${value}:00Z`),
    setLeads: (value: typeof leads | ((current: typeof leads) => typeof leads)) => { leads = typeof value === "function" ? value(leads) : value; },
    setDraggingLeadId: () => {},
    setPendingAction: () => {},
    setLeadDetailsRefreshKey: () => {},
    setSelectedLeadDetails: () => {},
    setTourStartsAt: (value: string) => { currentStartsAt = value; },
    setTourNotes: () => {},
    showStatus: (value: string) => statuses.push(value),
    showError: (value: string) => errors.push(value),
    startTransition: (action: () => Promise<void>) => { pending = action(); },
    fetch: async (url: string, init: { method: string; body: string }) => {
      const body = JSON.parse(init.body) as Record<string, unknown>;
      requests.push({ url, method: init.method, body });
      return { ok, json: async () => ok ? { lead: { ...lead, stage: body.stage ?? "TOUR_SCHEDULED" }, tour: { id: "tour-test" } } : { error } };
    },
  };
  const executable = stripTypeScriptTypes(section("  function moveDraggedLead(", "  function saveLeadDetails(")
    + section("  function scheduleTour()", "  function mergeDuplicateLead("));
  const api = new Function(...Object.keys(deps), `${executable}\nreturn { updateLeadStage, moveDraggedLead, scheduleTour };`)(...Object.values(deps)) as {
    updateLeadStage: (leadId: string, next: string) => void;
    moveDraggedLead: (next: string) => void;
    scheduleTour: () => void;
  };
  return { api, requests, statuses, errors, settle: () => pending, leads: () => leads, startsAt: () => currentStartsAt };
}

const reminder = "Pipeline stage updated and logged. To add a tour appointment, enter its date and time and choose Schedule tour.";

test("stage disclosure preserves enrollment approval limits and distinguishes calendar appointments", () => {
  assert.match(crm, /They do not create or approve family, child, guardian, or enrollment records\./);
  assert.match(crm, /Changing a stage does not create a calendar appointment\./);
  assert.match(crm, /enter its date and time and choose Schedule tour\./);
  assert.match(source, /<p[^>]*>\{crmPipelineStageDisclosure\}<\/p>/);
});

test("dropdown tour-stage update explains the dated appointment step without creating a tour", async () => {
  assert.match(source, /onValueChange=\{\(stage\) => updateLeadStage\(selectedLead\.id, stage as EnrollmentStage\)\}/);
  const h = harness();
  h.api.updateLeadStage("lead-test", "TOUR_SCHEDULED");
  await h.settle();
  assert.deepEqual(h.statuses, [reminder]);
  assert.deepEqual(h.requests, [{ url: "/api/leads/lead-test", method: "PATCH", body: { stage: "TOUR_SCHEDULED" } }]);
  assert.deepEqual(h.errors, []);
});

test("drag and drop uses the same tour-stage reminder and stage-only request", async () => {
  const h = harness();
  h.api.moveDraggedLead("TOUR_SCHEDULED");
  await h.settle();
  assert.deepEqual(h.statuses, [reminder]);
  assert.deepEqual(h.requests, [{ url: "/api/leads/lead-test", method: "PATCH", body: { stage: "TOUR_SCHEDULED" } }]);
});

test("other stage success and same-stage drag behavior stay unchanged", async () => {
  const h = harness();
  h.api.updateLeadStage("lead-test", "CONTACTED");
  await h.settle();
  assert.deepEqual(h.statuses, ["Pipeline stage updated and logged."]);
  const unchanged = harness({ stage: "TOUR_SCHEDULED" });
  unchanged.api.moveDraggedLead("TOUR_SCHEDULED");
  assert.deepEqual(unchanged.requests, []);
  assert.deepEqual(unchanged.statuses, []);
});

test("failed stage PATCH restores the old stage and never claims success", async () => {
  for (const error of ["Stage denied", ""]) {
    const h = harness({ ok: false, error });
    h.api.updateLeadStage("lead-test", "TOUR_SCHEDULED");
    await h.settle();
    assert.deepEqual(h.leads(), [{ id: "lead-test", stage: "NEW_INQUIRY" }]);
    assert.deepEqual(h.statuses, []);
    assert.deepEqual(h.errors, [error || "Pipeline stage could not be updated."]);
  }
});

test("existing Schedule tour still requires date/time and explicitly creates the dated appointment", async () => {
  assert.match(source, /onClick=\{scheduleTour\}[\s\S]*?disabled=\{isPending \|\| !tourStartsAt\}/);
  const empty = harness({ startsAt: "" });
  empty.api.scheduleTour();
  assert.deepEqual(empty.requests, []);
  const h = harness();
  h.api.scheduleTour();
  await h.settle();
  assert.deepEqual(h.requests, [{ url: "/api/leads/lead-test/tours", method: "POST", body: { startsAt: "2026-10-20T10:30:00.000Z", notes: "Synthetic tour" } }]);
  assert.deepEqual(h.statuses, ["Tour scheduled, pipeline updated, and audit logged."]);
  assert.equal(h.startsAt(), "");
});

test("failed tour creation retains the date and does not show scheduling success", async () => {
  const h = harness({ ok: false, error: "Tour denied" });
  h.api.scheduleTour();
  await h.settle();
  assert.deepEqual(h.statuses, []);
  assert.deepEqual(h.errors, ["Tour denied"]);
  assert.equal(h.startsAt(), "2026-10-20T10:30");
});
