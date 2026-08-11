import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const liveOps = source("src/components/live-ops-pages.tsx");
const conversationInbox = source("src/components/message-conversation-inbox.tsx");

test("payment form alerts link only when the notification contains a URL", () => {
  assert.match(liveOps, /function PaymentFormDestination[\s\S]*const href = notificationBodyUrl\(body\)/);
  assert.match(liveOps, /if \(!href\)[\s\S]*Payment form link unavailable/);
  assert.match(liveOps, /href=\{href\}[\s\S]*Open payment form/);
  assert.equal((liveOps.match(/<PaymentFormDestination body=/g) ?? []).length, 2);
  assert.doesNotMatch(liveOps, /href=\{notificationBodyUrl\([^}]+\) \?\? undefined\}/);
});

test("message attachments render a link for a signed URL and plain unavailable content otherwise", () => {
  for (const componentSource of [liveOps, conversationInbox]) {
    assert.match(componentSource, /attachment\.downloadUrl \? \([\s\S]*href=\{attachment\.downloadUrl\}/);
    assert.match(componentSource, /\) : \([\s\S]*<span key=\{attachment\.id\}[\s\S]*Attachment unavailable/);
    assert.doesNotMatch(componentSource, /href=\{attachment\.downloadUrl \?\? undefined\}/);
    assert.doesNotMatch(componentSource, /aria-disabled=\{!attachment\.downloadUrl\}/);
  }
});

test("the audited components contain no nullable undefined href fallback", () => {
  assert.doesNotMatch(liveOps, /href=\{[^}\n]+\?\? undefined\}/);
  assert.doesNotMatch(conversationInbox, /href=\{[^}\n]+\?\? undefined\}/);
});
