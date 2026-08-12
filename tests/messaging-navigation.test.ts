import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { STAFF_MESSAGING_HREF, staffMessagingHref } from "@/lib/messaging-navigation";

test("staff messaging links use the consolidated family workspace", () => {
  assert.equal(STAFF_MESSAGING_HREF, "/family-detail?view=messages");
  assert.equal(
    staffMessagingHref({ q: "Bailey family", familyId: "family-1" }),
    "/family-detail?view=messages&q=Bailey+family&familyId=family-1",
  );
  assert.equal(
    staffMessagingHref({ replyToMessageId: "message-1", subject: "Re: Hello" }, "message-composer"),
    "/family-detail?view=messages&replyToMessageId=message-1&subject=Re%3A+Hello#message-composer",
  );
});

test("the legacy messages route preserves reply and search context while consolidating", () => {
  const page = readFileSync("src/app/[slug]/page.tsx", "utf8");
  assert.match(page, /if \(slug === "messages"\) \{[\s\S]*staffMessagingHref\([\s\S]*resolvedSearchParams/);
  assert.match(page, /firstSearchParam\(resolvedSearchParams\.replyToMessageId\) \? "message-composer" : null/);
});
