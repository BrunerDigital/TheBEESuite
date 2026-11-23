import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { OnlineRegistrationForm } from "../src/components/online-registration-form";
import * as packet from "../src/lib/registration-packet";
import * as handoff from "../src/lib/registration-handoff";

type Data = Record<string, unknown>;
const generalFields = ["primaryGuardianDriverLicense", "primaryGuardianSocialSecurityNumber", "secondaryGuardianDriverLicense", "secondaryGuardianSocialSecurityNumber"];
const identifierMarker = "synthetic-general-identifier-not-a-real-number";
const compiled = ts.transpileModule(readFileSync("src/app/api/registration/route.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function validRegistration(): Data {
  return {
    centerId: "fixture-school", primaryGuardianName: "Fixture Primary Guardian", primaryGuardianEmail: "PRIMARY@EXAMPLE.TEST", primaryGuardianPhone: "202-555-0101",
    primaryGuardianAddress: "Fixture address", primaryGuardianRelation: "Parent", primaryGuardianEmployer: "Fixture employer",
    secondaryGuardianName: "Fixture Secondary Guardian", secondaryGuardianEmail: "SECONDARY@EXAMPLE.TEST", secondaryGuardianPhone: "202-555-0102", secondaryGuardianRelation: "Parent",
    childFullName: "Fixture Child", childDateOfBirth: "2023-01-01", program: "Preschool", schedule: "Full time", scheduleDays: ["Monday", "Tuesday"], desiredStartDate: "2026-12-01",
    emergencyContacts: "Fixture Emergency Contact", authorizedPickups: "Fixture Pickup Contact", restrictedPickups: "Fixture restricted pickup note",
    policyAcknowledgment: true, eSignatureConsent: true, signatureName: "Fixture Primary Guardian", signatureDate: "2026-11-23",
    mealBenefitApplicationNeeded: true, mealApplicationLastFourSsn: "0000", mealApplicationNoSsn: false,
    mealApplicationSignatureName: "Fixture Primary Guardian", mealApplicationSignatureDate: "2026-11-23",
  };
}

function harness(state: string, options: { existingLead?: boolean; schoolAvailable?: boolean } = {}) {
  const writes: Array<{ model: string; args: Data }> = [], downstream: unknown[] = [], lookups: Data[] = [];
  let loggingOptions: Data = {};
  const capture = (model: string, result: Data = {}) => async (args: Data) => { writes.push({ model, args }); return result; };
  const prisma = {
    center: { findFirst: async (args: Data) => { lookups.push(args); return options.schoolAvailable === false ? null : { id: "fixture-school", name: "Fixture School", state, city: "Fixture City", email: "school@example.test", crmLocationId: "fixture-location", organization: { tenantId: "fixture-tenant" } }; } },
    lead: {
      findFirst: async (args: Data) => { lookups.push(args); return options.existingLead ? { id: "fixture-lead", stage: "ENROLLED", customFields: { reviewedFixtureFlag: true } } : null; },
      create: capture("lead.create", { id: "fixture-lead", stage: "APPLICATION_SUBMITTED" }),
      update: capture("lead.update", { id: "fixture-lead", stage: options.existingLead ? "ENROLLED" : "APPLICATION_SUBMITTED" }),
    },
    form: { upsert: capture("form.upsert", { id: "fixture-form" }) },
    formSubmission: { create: capture("formSubmission.create", { id: "fixture-submission" }) },
    task: { create: capture("task.create") }, note: { create: capture("note.create") },
    notification: { createMany: capture("notification.createMany") }, auditLog: { create: capture("auditLog.create") },
  };
  const enums = Object.fromEntries(["NEW_INQUIRY", "CONTACTED", "TOUR_SCHEDULED", "TOUR_COMPLETED", "APPLICATION_SENT", "APPLICATION_STARTED", "APPLICATION_SUBMITTED", "DOCUMENTS_PENDING", "DEPOSIT_PENDING", "ENROLLED", "WAITLISTED", "LOST_NOT_A_FIT"].map(value => [value, value]));
  const requireStub = (name: string) => {
    if (name === "next/server") return { NextResponse: { json: (body: Data, init?: { status?: number }) => ({ status: init?.status ?? 200, body }) } };
    if (name === "@prisma/client") return { EnrollmentStage: enums, DocumentStatus: { SUBMITTED: "SUBMITTED" }, UserRole: { CENTER_DIRECTOR: "CENTER_DIRECTOR", ASSISTANT_DIRECTOR: "ASSISTANT_DIRECTOR", BILLING_ADMIN: "BILLING_ADMIN" } };
    if (name === "@/lib/registration-packet") return packet;
    if (name === "@/lib/registration-handoff") return handoff;
    if (name === "@/lib/prisma") return { prisma };
    if (name === "@/lib/location-users") return { getCenterLeadershipUsers: async (args: unknown) => { downstream.push(args); return [{ id: "fixture-director" }]; } };
    if (name === "@/lib/integrations") return { uniqueEmails: (values: string[]) => [...new Set(values.filter(Boolean))], sendEmail: async (args: unknown) => { downstream.push(args); return { configured: false, attempted: false, reason: "fixture" }; } };
    if (name === "@/lib/integration-deliveries") return { recordEmailDeliveryAttempt: async (args: unknown) => { downstream.push(args); return null; } };
    if (name === "@/lib/request-response-logging") return {
      logOperationalError: () => assert.fail("The synthetic registration must not enter an unexpected error/logging path"),
      withApiLogging: (_method: string, handler: unknown, options: Data = {}) => { loggingOptions = options; return handler; },
    };
    throw new Error(`Unexpected registration dependency: ${name}`);
  };
  const route = { exports: {} as { POST: (request: Request) => Promise<{ status: number; body: Data }> } };
  // All database/mail/logging I/O is replaced. No real Prisma client or provider is loaded.
  new Function("require", "module", "exports", "process", compiled)(requireStub, route, route.exports, { env: { INQUIRY_NOTIFICATION_EMAILS: "notifications@example.test" } });
  return {
    writes, downstream, lookups, loggingOptions,
    request: (body: Data) => route.exports.POST(new Request("https://example.test/api/registration", {
      method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "192.0.2.25" }, body: JSON.stringify(body),
    })),
  };
}

for (const state of ["FL", "IN"]) {
  test(`${state}: the blank public form and public schema omit general guardian identifiers`, () => {
    const markup = renderToStaticMarkup(createElement(OnlineRegistrationForm, {
      centers: [{ id: "fixture-school", name: "Fixture School", crmLocationId: null, city: "Fixture City", state }], initialCenterId: "fixture-school",
    }));
    const fields = packet.kidCityRegistrationPacketSchema(state === "FL").sections.flatMap(section => section.fields.map(field => field.key));
    for (const key of generalFields) {
      assert.equal(markup.includes(`name="${key}"`), false, `No public input for ${key}`);
      assert.equal(fields.some(field => field === key), false, `No public schema field for ${key}`);
    }
    for (const key of ["primaryGuardianName", "secondaryGuardianName", "authorizedPickups", "eSignatureConsent", "mealApplicationLastFourSsn"]) assert.equal(markup.includes(`name="${key}"`), true, `Preserve ${key}`);
    assert.match(markup, /Submit registration packet/);
    const mealInput = markup.match(/<input\b[^>]*\bname="mealApplicationLastFourSsn"[^>]*>/)?.[0] ?? "";
    assert.equal(/\bmaxLength="4"/i.test(mealInput), true, "Preserve the meal input's four-digit limit");
  });

  for (const existingLead of [false, true]) test(`${state}: valid ${existingLead ? "returning" : "new"} registration discards cached identifier fields before writes or downstream calls`, async () => {
    const h = harness(state, { existingLead });
    const body = validRegistration();
    for (const key of generalFields) body[key] = identifierMarker;
    // Unsupported cached field spellings and nesting must not become an exception channel.
    Object.assign(body, { primaryGuardianSsn: identifierMarker, secondaryGuardianSSN: identifierMarker, primaryGuardianDriverLicenseNumber: identifierMarker, secondaryGuardianDriversLicense: identifierMarker,
      primaryGuardian: { socialSecurityNumber: identifierMarker, driverLicense: identifierMarker }, allowGuardianIdentifiers: true });
    const response = await h.request(body);
    assert.equal(response.status, 201);
    assert.equal(response.body.ok, true);
    assert.equal(JSON.stringify({ writes: h.writes, downstream: h.downstream, lookups: h.lookups }).includes(identifierMarker), false, "No general identifier value may reach persistence or downstream processing");
    const submission = h.writes.find(write => write.model === "formSubmission.create")!.args.data as Data;
    const data = submission.data as Data;
    for (const key of generalFields) assert.equal(Object.hasOwn(data, key), false, `Do not retain ${key}`);
    assert.equal(data.primaryGuardianEmail === "primary@example.test", true);
    assert.equal(data.secondaryGuardianEmail === "secondary@example.test", true);
    assert.equal(data.authorizedPickups === body.authorizedPickups && data.restrictedPickups === body.restrictedPickups, true);
    assert.equal(data.policyAcknowledgment === true && data.eSignatureConsent === true, true);
    assert.equal(data.mealApplicationLastFourSsn === "0000" && data.mealBenefitApplicationNeeded === true, true, "Keep the separate optional last-four workflow");
    assert.equal(data.registrationPacketScope, state === "FL" ? "florida" : "school");
    assert.equal(h.loggingOptions.omitRequestBody, true, "Omit even malformed or cached request bodies from registration logging");
    const leadWrite = h.writes.find(write => write.model === (existingLead ? "lead.update" : "lead.create"))!.args.data as Data;
    assert.equal(leadWrite.stage, existingLead ? "ENROLLED" : "APPLICATION_SUBMITTED");
    if (existingLead) assert.equal((leadWrite.customFields as Data).reviewedFixtureFlag, true);
    const leadLookup = h.lookups[1].where as Data;
    assert.equal(leadLookup.centerId, "fixture-school");
  });

  test(`${state}: invalid full-length content cannot be retained through the meal last-four field`, async () => {
    const h = harness(state);
    const response = await h.request({ ...validRegistration(), mealApplicationLastFourSsn: identifierMarker });
    assert.equal(response.status, 400);
    assert.equal(h.writes.length, 0); assert.equal(h.downstream.length, 0);
  });

  test(`${state}: submission projection independently strips the old supported general fields`, () => {
    const oldPacket = validRegistration();
    for (const key of generalFields) oldPacket[key] = identifierMarker;
    const submitted = packet.registrationPacketSubmissionFields(oldPacket as packet.RegistrationPacketPayload, state === "FL");
    for (const key of generalFields) assert.equal(Object.hasOwn(submitted, key), false);
    assert.equal(JSON.stringify(submitted).includes(identifierMarker), false);
    assert.equal(submitted.mealApplicationLastFourSsn === "0000", true);
  });

  test(`${state}: meal assistance and its last-four field remain optional`, async () => {
    for (const noSsn of [false, true]) {
      const h = harness(state);
      const response = await h.request({ ...validRegistration(), mealBenefitApplicationNeeded: noSsn, mealApplicationLastFourSsn: "", mealApplicationNoSsn: noSsn });
      assert.equal(response.status, 201);
      const submission = h.writes.find(write => write.model === "formSubmission.create")!.args.data as Data;
      assert.equal((submission.data as Data).mealApplicationNoSsn, noSsn);
    }
  });

  test(`${state}: consent and unavailable-school guards remain effective`, async () => {
    const missingConsent = harness(state);
    assert.equal((await missingConsent.request({ ...validRegistration(), policyAcknowledgment: false })).status, 400);
    assert.equal(missingConsent.writes.length, 0);
    const unavailable = harness(state, { schoolAvailable: false });
    assert.equal((await unavailable.request(validRegistration())).status, 404);
    assert.equal(unavailable.writes.length, 0); assert.equal(unavailable.downstream.length, 0);
  });
}
