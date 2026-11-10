import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";

// Exercise the real notification function with an in-memory mail transport.
// No provider credentials, database connection, or network is used.
export function notificationFixture() {
  const sent = [];
  const source = readFileSync("src/lib/inquiry-integrations.ts", "utf8")
    .replace(/^import[\s\S]*?;\r?\n/gm, "")
    .replace(/\bexport\s+/g, "");
  const dependencies = {
    process: { env: { INQUIRY_NOTIFICATION_EMAILS: "central@example.invalid" } },
    externalProviderEmails: (emails) => emails,
    sendEmail: async (message) => {
      sent.push(message);
      return { ok: true, configured: true, id: "synthetic_message", effectiveRecipientCount: message.to.length };
    },
  };
  const send = Function(...Object.keys(dependencies),
    stripTypeScriptTypes(source, { mode: "transform" }) + "\nreturn sendInquiryNotificationEmail;")(...Object.values(dependencies));
  return { send, sent };
}
