import assert from "node:assert/strict";
import test from "node:test";
import { buildManualEmailCopy } from "@/lib/manual-email-copy";

test("manual email copy includes recipients, subject, and body", () => {
  assert.deepEqual(
    buildManualEmailCopy({
      to: ["parent@example.com", "billing@example.com"],
      subject: " Secure parent setup ",
      body: " Hi Taylor,\n\nPlease use this setup link. ",
    }),
    {
      to: ["parent@example.com", "billing@example.com"],
      subject: "Secure parent setup",
      body: "Hi Taylor,\n\nPlease use this setup link.",
      clipboardText: "To: parent@example.com, billing@example.com\nSubject: Secure parent setup\n\nHi Taylor,\n\nPlease use this setup link.",
    },
  );
});
