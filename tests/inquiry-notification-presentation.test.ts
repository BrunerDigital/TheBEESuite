import assert from "node:assert/strict";
import test from "node:test";
import { inquiryFixture } from "./helpers/inquiry-route-fixture.mjs";
import { notificationFixture } from "./helpers/inquiry-notification-fixture.mjs";

const base = {
  brandName: "Example Learning Center", program: "Daycare", parentName: "Synthetic Parent",
  email: "parent@example.invalid", phone: "2025550100", leadId: "lead_fixture",
  centerId: "center_fixture", tenantId: "tenant_fixture", locationId: "center_fixture",
};

test("fixed-center notifications use the school name and resolved metadata without changing routing", async () => {
  const fixture = notificationFixture();
  const payload = { ...base, locationName: "Example Learning Center - Centennial",
    resolvedCenterName: "Example Learning Center - Centennial", publicLocationId: "",
    resolvedLocationId: "Example Learning Center - CO | Centennial", city: "", state: "",
    resolvedCity: "Centennial", resolvedState: "CO" };
  const before = structuredClone(payload);
  const result = await fixture.send(payload, ["school@example.invalid"]);
  const message = fixture.sent[0];
  assert.equal(message.subject, "New Example Learning Center Inquiry - Daycare - Example Learning Center - Centennial [Inquiry lead_fixture]");
  assert.match(message.text, /Public Location ID: Example Learning Center - CO \| Centennial/);
  assert.match(message.text, /City\/State: Centennial, CO/);
  assert.match(message.text, /Location ID: center_fixture/);
  assert.match(message.text, /BEE Suite Lead ID: lead_fixture/);
  assert.deepEqual(message.to, ["central@example.invalid", "school@example.invalid"]);
  assert.deepEqual(message.customArgs, { leadId: "lead_fixture", centerId: "center_fixture", locationId: "center_fixture" });
  assert.equal(message.tenantId, "tenant_fixture");
  assert.deepEqual(message.categories, ["inquiry_notification"]);
  assert.equal(message.disableClickTracking, true);
  assert.equal(result.locationRecipients, 1);
  assert.deepEqual(payload, before, "Formatting does not rewrite the saved inquiry payload");
});

test("notifications retain submitted public metadata when present and prefer the resolved school name", async () => {
  const fixture = notificationFixture();
  await fixture.send({ ...base, locationName: "Outdated label", resolvedCenterName: "Verified school",
    publicLocationId: "public-submitted", resolvedLocationId: "public-resolved",
    city: "Submitted City", state: "FL", resolvedCity: "Resolved City", resolvedState: "CO" }, ["school@example.invalid"]);
  assert.equal(fixture.sent[0].subject, "New Example Learning Center Inquiry - Daycare - Verified school [Inquiry lead_fixture]");
  assert.match(fixture.sent[0].text, /Public Location ID: public-submitted/);
  assert.match(fixture.sent[0].text, /City\/State: Submitted City, FL/);
});

test("legacy payloads use readable names and mark genuinely missing metadata explicitly", async () => {
  const fixture = notificationFixture();
  await fixture.send({ ...base, locationName: " Legacy school ", publicLocationId: "  ", city: "", state: "" }, ["school@example.invalid"]);
  const message = fixture.sent[0];
  assert.equal(message.subject, "New Example Learning Center Inquiry - Daycare - Legacy school [Inquiry lead_fixture]");
  assert.match(message.text, /Public Location ID: Not provided/);
  assert.match(message.text, /City\/State: Not provided/);
  assert.doesNotMatch(message.text, /undefined|City\/State: ,/);
});

test("identifier fallbacks and partial geography remain useful without stray commas", async () => {
  const fixture = notificationFixture();
  await fixture.send({ ...base, state: "CO" }, ["school@example.invalid"]);
  assert.match(fixture.sent[0].subject, / - center_fixture \[Inquiry lead_fixture\]$/);
  assert.match(fixture.sent[0].text, /City\/State: CO\n/);
  await fixture.send({ ...base, locationId: "", city: "Centennial" }, ["school@example.invalid"]);
  assert.match(fixture.sent[1].subject, / - center_fixture \[Inquiry lead_fixture\]$/);
  assert.match(fixture.sent[1].text, /City\/State: Centennial\n/);
});

test("intake snapshots resolved geography for notification and retry while preserving submitted evidence", async () => {
  const fixture = inquiryFixture({ genericTrial: true });
  const center = fixture.centers.find((row) => row.id === "center_trial_fixture")!;
  Object.assign(center, { city: "Centennial", state: "CO", locationId: "Example - CO | Centennial" });
  const response = await fixture.post({ centerId: center.id, locationId: center.id,
    locationName: center.name, brandName: "Example Learning Center" });
  assert.equal(response.status, 201);
  const lead = fixture.effects.leads[0] as unknown as { centerId: string; customFields: Record<string, unknown> };
  assert.equal(lead.centerId, center.id);
  assert.equal(lead.customFields.city, "");
  assert.equal(lead.customFields.state, "");
  assert.equal(lead.customFields.publicLocationId, "");
  const delivery = fixture.effects.deliveries.find((row) => (row as unknown as { provider: string }).provider === "sendgrid")!;
  const payload = delivery.payload as unknown as Record<string, unknown>;
  assert.equal(payload.resolvedCity, "Centennial");
  assert.equal(payload.resolvedState, "CO");
  assert.equal(payload.resolvedLocationId, "Example - CO | Centennial");
  assert.deepEqual(payload.locationRecipients, ["fixture@example.invalid"]);
  const notification = notificationFixture();
  await notification.send(payload, payload.locationRecipients);
  assert.match(notification.sent[0].text, /City\/State: Centennial, CO/);
  assert.equal(fixture.effects.leads.length, 1);
  assert.equal(fixture.effects.deliveries.length, 2);
  assert.equal(fixture.effects.unexpectedNetwork, 0);
});
