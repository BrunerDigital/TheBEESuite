import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

test("every SendGrid sender is covered by IntegrationDelivery auditing", () => {
  const sourceFiles = (directory: string): string[] => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.[cm]?[jt]sx?$/.test(entry.name) ? [path] : [];
  });
  const files = [...sourceFiles("src"), ...sourceFiles("scripts")].filter((file) => readFileSync(file, "utf8").includes("sendEmail("));
  const allowlisted: Record<string, string> = {
    "src/lib/integrations.ts": "low-level provider implementation",
    "src/lib/inquiry-integrations.ts": "caller records inquiry_notification in src/app/api/inquiries/route.ts",
    "src/lib/integration-deliveries.ts": "retry dispatcher owns the existing delivery record",
    "scripts/send-autopay-reauthorization-email-wave.ts": "precreates and updates its campaign delivery record around each send",
    "scripts/retry-granbury-parent-invite-timeout.ts": "claims and updates an existing delivery record",
  };
  const missing = files.filter((file) => {
    const normalized = file.replaceAll("\\", "/");
    if (allowlisted[normalized]) return false;
    return !readFileSync(file, "utf8").includes("recordEmailDeliveryAttempt");
  });
  assert.deepEqual(missing, [], `Unaudited SendGrid senders: ${missing.join(", ")}`);
  assert.match(readFileSync("src/app/api/inquiries/route.ts", "utf8"), /provider:\s*["']sendgrid["']/);
});
