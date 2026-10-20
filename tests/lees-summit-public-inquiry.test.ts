import assert from "node:assert/strict";
import test from "node:test";
import { effectiveWorkspaceRole, resolveWorkspaceState } from "../src/lib/workspace-selection";
import { canManageOperations } from "../src/lib/auth";
import { canInviteGuardianToPortal } from "../src/lib/portal-guardrails";
import { UserRole } from "@prisma/client";
import { readFileSync } from "node:fs";
import { inquiryFixture } from "./helpers/inquiry-route-fixture.mjs";
import { isRestoredPublicInquiryCenter, leesSummitInquiryRestoration as binding } from "../src/lib/public-inquiry-restoration";
import { isEligiblePublicInquiryCenter } from "../src/lib/inquiry-routing";
import { isActivePublicSchoolCandidate, isActiveSchoolFinanceOperationsCandidate } from "../src/lib/active-school-locations";

const closed = {
  id: binding.centerId, name: binding.name, status: "closed", crmLocationId: binding.publicLocationId,
  locationId: "MO | Lees Summit", email: binding.notificationEmail,
  organization: { tenantId: "synthetic_tenant", tenant: { slug: binding.tenantSlug } },
};

test("restoration requires explicit enablement, exact identity, tenant, mailbox and identifiers", () => {
  assert.equal(isRestoredPublicInquiryCenter(closed, true), true);
  assert.equal(isRestoredPublicInquiryCenter(closed, false), false);
  for (const changed of [
    { ...closed, id: "another_closed_school" }, { ...closed, name: "Other school" },
    { ...closed, organization: { tenantId: "other_tenant", tenant: { slug: "other-brand" } } },
    { ...closed, email: "unverified@example.invalid" },
    { ...closed, crmLocationId: "unknown", locationId: "unknown" },
  ]) assert.equal(isRestoredPublicInquiryCenter(changed, true), false);
  assert.equal(closed.status, "closed");
  assert.equal(isEligiblePublicInquiryCenter(closed, true), false, "Ordinary inquiry policy remains closed");
  assert.equal(isActivePublicSchoolCandidate(closed), false);
  assert.equal(isActiveSchoolFinanceOperationsCandidate(closed), false);
  const workspace = resolveWorkspaceState({ role: UserRole.BRAND_ADMIN,
    authorizedCenters: [{ id: closed.id, name: closed.name, detail: "Synthetic school", status: closed.status }],
    requestedSelection: `center:${closed.id}` });
  const role = effectiveWorkspaceRole(UserRole.BRAND_ADMIN, workspace);
  assert.equal(role, UserRole.READ_ONLY_AUDITOR);
  assert.equal(canManageOperations({ role }), false);
  assert.equal(canInviteGuardianToPortal({ canManageOperations: canManageOperations({ role }),
    hasCenterAccess: true, guardianEmail: "synthetic@example.invalid", targetTenantId: "synthetic_tenant" }).ok, false,
    "Public inquiry restoration cannot enable invitations from the closed history workspace");
});

test("full handler accepts only the enabled, verified binding without school mutations", async () => {
  for (const form of [false, true]) {
    const fixture = inquiryFixture({ restored: true, restorationEnabled: true });
    const result = await fixture.post({ locationId: binding.publicLocationId }, { form });
    assert.equal(result.status, 201);
    assert.equal(fixture.effects.leads[0].centerId, binding.centerId);
    assert.equal(fixture.centers.find((center: { id: string }) => center.id === binding.centerId)?.status, "closed");
    assert.deepEqual(fixture.effects.deliveries[1].payload.locationRecipients, [binding.notificationEmail]);
    assert.equal(fixture.effects.notificationLookups, 1, "Center mailbox only; no grant/staff fallback");
    assert.equal(fixture.effects.unexpectedNetwork, 0);
  }
});

test("disabled, wrong tenant/mailbox and conflicting selectors fail before all writes or sends", async () => {
  for (const options of [
    { restored: true },
    { restored: true, restorationEnabled: true, restorationTenant: "another-brand" },
    { restored: true, restorationEnabled: true, restorationEmail: "unverified@example.invalid" },
  ]) {
    const fixture = inquiryFixture(options);
    assert.equal((await fixture.post({ centerId: binding.centerId })).status, 400);
    assert.equal(fixture.effects.writes, 0);
    assert.equal(fixture.effects.notificationLookups, 0);
    assert.equal(fixture.effects.emails, 0);
  }
  for (const fields of [
    { centerId: "center_douglas_fixture", locationId: binding.publicLocationId },
    { centerId: binding.centerId, locationId: "Kid City USA - FL | Altamonte - Douglas" },
  ]) {
    const fixture = inquiryFixture({ restored: true, restorationEnabled: true });
    assert.equal((await fixture.post(fields)).status, 400);
    assert.equal(fixture.effects.writes, 0);
  }
});

test("inquiry catalog and fixed-center availability agree with the enabled verified intake", async () => {
  for (const enabled of [false, true]) {
    const fixture = inquiryFixture({ restored: true, restorationEnabled: enabled });
    const catalog = await fixture.get("?purpose=inquiry&centerId=" + binding.centerId);
    assert.equal(catalog.body.inquiryCenterEligible, enabled);
    assert.equal(catalog.body.locations.some((row: { name: string }) => row.name === binding.name), enabled);
    assert.equal(fixture.effects.writes, 0);
  }
  const wrongTenant = inquiryFixture({ restored: true, restorationEnabled: true, restorationTenant: "other-brand" });
  const result = await wrongTenant.get("?purpose=inquiry&centerId=" + binding.centerId);
  assert.equal(result.body.inquiryCenterEligible, false);
  assert.equal(result.body.locations.some((row: { name: string }) => row.name === binding.name), false);
});

test("unrelated closed schools and non-inquiry operations retain their existing closed guards", async () => {
  const fixture = inquiryFixture({ restored: true, restorationEnabled: true });
  fixture.centers.push({ ...fixture.centers[2], ...closed, id: "another_closed_school", name: "Another closed school", crmLocationId: "Kid City USA - MO | Another", locationId: "MO | Another" });
  assert.equal((await fixture.post({ locationId: "Kid City USA - MO | Another" })).status, 400);
  assert.equal(fixture.effects.writes, 0);
  // These handlers must not consume the public-only exception. Their pre-existing
  // status guards stay in force; no test invokes registration or a provider.
  for (const path of [
    "src/app/api/registration/route.ts", "src/app/api/registration/share/route.ts",
    "src/app/api/kiosk/check/route.ts", "src/app/api/kiosk/lookup/route.ts", "src/app/api/kiosk/staff/route.ts",
    "src/app/api/cron/tuition-billing/route.ts", "src/app/api/cron/fte-reminders/route.ts",
    "src/app/api/cron/tuition-payment-reminders/route.ts", "src/lib/workspace-selection.ts",
  ]) {
    const source = readFileSync(path, "utf8");
    assert.doesNotMatch(source, /public-inquiry-restoration|INQUIRY_LEES_SUMMIT_ENABLED/);
    assert.match(source, /closed|status: "active"/, path);
  }
});

test("static frontend and directory use the same exact restoration identifier", () => {
  const directory = JSON.parse(readFileSync("public/kidcity-locations.json", "utf8"));
  assert.equal(directory.locations.filter((row: { crmLocationId: string }) => row.crmLocationId === binding.publicLocationId).length, 1);
  const html = readFileSync("wordpress-avada/kidcity-inquiry-form-bee-suite.html", "utf8");
  assert.ok(html.includes(`value="${binding.publicLocationId}"`));
});


test("routing audit uses the same exact binding and cannot use staff recipient fallbacks", async () => {
  for (const [enabled, tenant, expected] of [[false, binding.tenantSlug, true], [true, binding.tenantSlug, false], [true, "other-brand", true]] as const) {
    const fixture = inquiryFixture({ restored: true, restorationEnabled: enabled, restorationTenant: tenant });
    const result = await fixture.audit();
    assert.equal(result.status, 200);
    assert.equal(result.body.missingCenter.some((row: { publicLocationId: string }) => row.publicLocationId === binding.publicLocationId), expected);
    assert.equal(fixture.effects.notificationLookups, 0);
    assert.equal(fixture.effects.writes, 0);
  }
});


for (const field of ["crmLocationId", "locationId"] as const) {
  test(`conflicting persisted ${field} rejects catalog eligibility and POST despite the other expected identifier`, async () => {
    const fixture = inquiryFixture({ restored: true, restorationEnabled: true });
    const center = fixture.centers.find((row: { id: string }) => row.id === binding.centerId)!;
    center[field] = "Kid City USA - FL | Altamonte - Douglas";
    assert.equal(isRestoredPublicInquiryCenter({ ...closed, [field]: center[field] }, true), false);
    const catalog = await fixture.get("?purpose=inquiry&centerId=" + binding.centerId);
    assert.equal(catalog.body.inquiryCenterEligible, false);
    assert.equal(catalog.body.locations.some((row: { name: string }) => row.name === binding.name), false);
    assert.equal((await fixture.post({ centerId: binding.centerId })).status, 400);
    assert.equal(fixture.effects.writes, 0);
    assert.equal(fixture.effects.notificationLookups, 0);
    assert.equal(fixture.effects.emails, 0);
    const audit = await fixture.audit();
    assert.equal(audit.body.missingCenter.some((row: { publicLocationId: string }) => row.publicLocationId === binding.publicLocationId), true);
  });
}

test("empty identifiers require at least one expected stored identifier in catalog and POST", async () => {
  for (const [crmLocationId, locationId, expected] of [
    [binding.publicLocationId, null, true],
    ["", "MO | Lees Summit", true],
    [binding.publicLocationId, "  ", true],
    [null, null, false],
    ["", "  ", false],
    [binding.publicLocationId, "MO | Lees Summit", true],
  ] as const) {
    const fixture = inquiryFixture({ restored: true, restorationEnabled: true });
    const center = fixture.centers.find((row: { id: string }) => row.id === binding.centerId)!;
    center.crmLocationId = crmLocationId;
    center.locationId = locationId;
    assert.equal(isRestoredPublicInquiryCenter({ ...closed, crmLocationId, locationId }, true), expected);
    const catalog = await fixture.get("?purpose=inquiry&centerId=" + binding.centerId);
    assert.equal(catalog.body.inquiryCenterEligible, expected);
    assert.equal(catalog.body.locations.some((row: { name: string }) => row.name === binding.name), expected);
    assert.equal((await fixture.post({ centerId: binding.centerId })).status, expected ? 201 : 400);
    assert.equal(center.status, "closed");
    if (!expected) assert.equal(fixture.effects.writes, 0);
  }
});
