import assert from "node:assert/strict";
import test from "node:test";
import { messageEmailBodyWithAttachments } from "../src/lib/message-attachment-notice";
import { buildBeeSuiteEmailHtml } from "../src/lib/communications-kit";

test("message notification lists every attachment and links to authenticated conversation", () => {
  const url = "https://thebeesuite.io/parents?replyToMessageId=fixture-message";
  const text = messageEmailBodyWithAttachments("School update", [{ filename: "HFMD.pdf" }, { filename: "<photo>.jpg" }], url);
  assert.match(text, /Attachments \(2\):\n- HFMD.pdf\n- <photo>.jpg/);
  assert.match(text, /Open the attachments securely/);
  const html = buildBeeSuiteEmailHtml({ title: "Update", body: text });
  assert.ok(html.includes(`href="${url}"`));
  assert.ok(html.includes("&lt;photo&gt;.jpg"));
  assert.ok(!html.includes("/storage/v1/object"));
});

test("attachment-only messages, missing conversation link, and attachment-free copies remain usable", () => {
  assert.match(messageEmailBodyWithAttachments("", [{ filename: "notice\r\n.pdf" }], null), /Sign in to The BEE Suite/);
  assert.equal(messageEmailBodyWithAttachments("Existing body", [], null), "Existing body");
});
