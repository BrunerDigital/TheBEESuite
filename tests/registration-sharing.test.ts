import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildRegistrationLeadCustomFields,
  buildRegistrationLeadSuggestion,
  buildRegistrationShareEmail,
  buildRegistrationShareUrl,
  MAX_REGISTRATION_SHARE_RECIPIENTS,
  parseRegistrationShareRecipients,
  registrationInvitationFromLeadCustomFields,
  stageAfterRegistrationShare,
} from "@/lib/registration-sharing";

test("registration share URL stays locked to the requested school", () => {
  assert.equal(
    buildRegistrationShareUrl("https://thebeesuite.io/", "center/kokomo west"),
    "https://thebeesuite.io/registration?centerId=center%2Fkokomo%20west",
  );
});

test("registration share recipient parsing accepts common separators and deduplicates", () => {
  assert.deepEqual(
    parseRegistrationShareRecipients("Parent@Example.com, guardian@example.com\nparent@example.com; third@example.com"),
    {
      emails: ["parent@example.com", "guardian@example.com", "third@example.com"],
      invalidEmails: [],
    },
  );
});

test("registration share recipient parsing reports invalid addresses", () => {
  assert.deepEqual(parseRegistrationShareRecipients(["valid@example.com", "not-an-email"]), {
    emails: ["valid@example.com"],
    invalidEmails: ["not-an-email"],
  });
  assert.equal(MAX_REGISTRATION_SHARE_RECIPIENTS, 20);
});

test("registration share email identifies the school and preserves the review boundary", () => {
  const message = buildRegistrationShareEmail({
    schoolLabel: "NC | Canton",
    registrationUrl: "https://thebeesuite.io/registration?centerId=canton",
    senderName: "Center Director",
    brandName: "Miss Honey's Learning Center",
  });

  assert.match(message.subject, /NC \| Canton/);
  assert.match(message.text, /school-specific form/);
  assert.match(message.text, /director dashboard/);
  assert.match(message.text, /does not confirm enrollment/);
  assert.match(message.text, /Miss Honey's Learning Center/);
});

test("CRM registration delivery advances only early stages and records lead invitation state", () => {
  assert.equal(stageAfterRegistrationShare("NEW_INQUIRY"), "APPLICATION_SENT");
  assert.equal(stageAfterRegistrationShare("TOUR_COMPLETED"), "APPLICATION_SENT");
  assert.equal(stageAfterRegistrationShare("APPLICATION_STARTED"), "APPLICATION_STARTED");
  assert.equal(stageAfterRegistrationShare("APPLICATION_SUBMITTED"), "APPLICATION_SUBMITTED");
  assert.equal(stageAfterRegistrationShare("ENROLLED"), "ENROLLED");

  const fields = buildRegistrationLeadCustomFields({ ownerName: "Director" }, {
    status: "sent",
    attemptedAt: "2026-07-27T12:00:00.000Z",
    sentAt: "2026-07-27T12:00:00.000Z",
    registrationUrl: "https://thebeesuite.io/registration?centerId=school-1",
    sentByUserId: "director-1",
    recipientCount: 1,
  });

  assert.equal(fields.ownerName, "Director");
  assert.deepEqual(registrationInvitationFromLeadCustomFields(fields), {
    status: "sent",
    sentAt: "2026-07-27T12:00:00.000Z",
    attemptedAt: "2026-07-27T12:00:00.000Z",
    registrationUrl: "https://thebeesuite.io/registration?centerId=school-1",
  });
});

test("AI lead suggestions offer the school-specific registration form when appropriate", () => {
  const suggestion = buildRegistrationLeadSuggestion({
    familyName: "Bee Family",
    childName: "Avery",
    program: "Preschool",
    schoolLabel: "FL | Orlando",
    registrationUrl: "https://thebeesuite.io/registration?centerId=orlando",
    stage: "TOUR_COMPLETED",
    brandName: "Miss Honey's Learning Center",
  });

  assert.equal(suggestion?.label, "Send registration form");
  assert.match(suggestion?.body ?? "", /centerId=orlando/);
  assert.match(suggestion?.body ?? "", /does not confirm enrollment/);
  assert.match(suggestion?.body ?? "", /Miss Honey's Learning Center/);

  const reminder = buildRegistrationLeadSuggestion({
    familyName: "Bee Family",
    schoolLabel: "FL | Orlando",
    registrationUrl: "https://thebeesuite.io/registration?centerId=orlando",
    stage: "APPLICATION_SENT",
    brandName: "Miss Honey's Learning Center",
    customFields: {
      registrationInvitation: {
        status: "sent",
        sentAt: "2026-07-27T12:00:00.000Z",
      },
    },
  });
  assert.equal(reminder?.label, "Registration reminder");

  assert.equal(buildRegistrationLeadSuggestion({
    familyName: "Bee Family",
    schoolLabel: "FL | Orlando",
    registrationUrl: "https://thebeesuite.io/registration?centerId=orlando",
    stage: "APPLICATION_SUBMITTED",
    contextPrompt: "send registration form",
    brandName: "Miss Honey's Learning Center",
  }), null);
});

test("AI can consider registration before a tour only when staff explicitly asks for it", () => {
  assert.equal(buildRegistrationLeadSuggestion({
    familyName: "Bee Family",
    schoolLabel: "FL | Orlando",
    registrationUrl: "https://thebeesuite.io/registration?centerId=orlando",
    stage: "CONTACTED",
    brandName: "Miss Honey's Learning Center",
  }), null);

  assert.equal(buildRegistrationLeadSuggestion({
    familyName: "Bee Family",
    schoolLabel: "FL | Orlando",
    registrationUrl: "https://thebeesuite.io/registration?centerId=orlando",
    stage: "CONTACTED",
    contextPrompt: "Please include the registration form",
    brandName: "Miss Honey's Learning Center",
  })?.label, "Send registration form");
});
