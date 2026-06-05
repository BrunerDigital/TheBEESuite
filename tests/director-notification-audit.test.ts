import assert from "node:assert/strict";
import { test } from "node:test";
import {
  resolveDirectorNotificationAuditRow,
  summarizeDirectorNotificationAudit,
} from "@/lib/director-notification-audit";

const baseCenter = {
  id: "center_1",
  name: "Kid City USA - Sarasota",
  crmLocationId: "FL | Sarasota",
  locationId: "Kid City USA - Sarasota",
};

test("director notification audit uses a valid center email first", () => {
  const row = resolveDirectorNotificationAuditRow({
    ...baseCenter,
    email: " Sarasota@KidCityUSA.com ",
    userAccessGrants: [
      {
        isActive: true,
        role: "CENTER_DIRECTOR",
        user: { email: "director@kidcityusa.com", isActive: true },
      },
    ],
  });

  assert.deepEqual(row.recipients, ["sarasota@kidcityusa.com"]);
  assert.deepEqual(row.fallbackEmails, ["director@kidcityusa.com"]);
  assert.equal(row.ready, true);
  assert.equal(row.centerEmailValid, true);
});

test("director notification audit falls back to active director grants", () => {
  const row = resolveDirectorNotificationAuditRow({
    ...baseCenter,
    email: "",
    userAccessGrants: [
      {
        isActive: true,
        role: "CENTER_DIRECTOR",
        user: { email: "director@kidcityusa.com", isActive: true },
      },
      {
        isActive: true,
        role: "TEACHER",
        user: { email: "teacher@kidcityusa.com", isActive: true },
      },
      {
        isActive: false,
        role: "BILLING_ADMIN",
        user: { email: "billing@kidcityusa.com", isActive: true },
      },
    ],
  });

  assert.deepEqual(row.recipients, ["director@kidcityusa.com"]);
  assert.deepEqual(row.warnings, ["using_director_fallback"]);
  assert.equal(row.ready, true);
});

test("director notification audit falls back to staff profiles when grants are absent", () => {
  const row = resolveDirectorNotificationAuditRow({
    ...baseCenter,
    email: "not-an-email",
    staff: [
      {
        user: {
          email: "assistant@kidcityusa.com",
          isActive: true,
          role: "ASSISTANT_DIRECTOR",
        },
      },
    ],
  });

  assert.deepEqual(row.recipients, ["assistant@kidcityusa.com"]);
  assert.deepEqual(row.warnings, ["center_email_invalid", "using_director_fallback"]);
  assert.equal(row.ready, true);
});

test("director notification audit marks locations missing without recipients", () => {
  const row = resolveDirectorNotificationAuditRow({
    ...baseCenter,
    email: "",
    userAccessGrants: [],
    staff: [],
  });

  assert.deepEqual(row.recipients, []);
  assert.deepEqual(row.warnings, ["missing_notification_recipient"]);
  assert.equal(row.ready, false);
});

test("director notification audit summary counts rollout readiness", () => {
  const rows = [
    resolveDirectorNotificationAuditRow({
      ...baseCenter,
      id: "ready_center",
      email: "sarasota@kidcityusa.com",
      userAccessGrants: [
        {
          isActive: true,
          role: "CENTER_DIRECTOR",
          user: { email: "sarasota@kidcityusa.com", isActive: true },
        },
      ],
    }),
    resolveDirectorNotificationAuditRow({
      ...baseCenter,
      id: "missing_center",
      email: "",
      userAccessGrants: [],
      staff: [],
    }),
  ];

  assert.deepEqual(summarizeDirectorNotificationAudit(rows), {
    activeSchools: 2,
    ready: 1,
    missing: 1,
    centerEmailValid: 1,
    fallbackAvailable: 1,
    missingRows: [rows[1]],
  });
});
