import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveInquiryLocationNotificationEmails } from "@/lib/inquiry-notifications";

test("inquiry notification routing sends to the matched center school email first", () => {
  const recipients = resolveInquiryLocationNotificationEmails({
    centerEmail: " HollyHill@KidCityUSA.com ",
    userAccessGrantEmails: ["director@kidcityusa.com"],
    staffProfileEmails: ["assistant@kidcityusa.com"],
  });

  assert.deepEqual(recipients, ["hollyhill@kidcityusa.com"]);
});

test("inquiry notification routing falls back to center-scoped Kid City leadership emails", () => {
  const recipients = resolveInquiryLocationNotificationEmails({
    centerEmail: "",
    userAccessGrantEmails: [
      "director@kidcityusa.com",
      "not-a-school-user@example.com",
      "assistant@kidcityusa.com",
      "director@kidcityusa.com",
    ],
    staffProfileEmails: ["billing@kidcityusa.com"],
  });

  assert.deepEqual(recipients, ["director@kidcityusa.com", "assistant@kidcityusa.com"]);
});

test("inquiry notification routing uses staff profile fallback only when grants are absent", () => {
  const recipients = resolveInquiryLocationNotificationEmails({
    centerEmail: "not-an-email",
    userAccessGrantEmails: [],
    staffProfileEmails: ["assistant@kidcityusa.com", "teacher@example.com"],
  });

  assert.deepEqual(recipients, ["assistant@kidcityusa.com"]);
});
