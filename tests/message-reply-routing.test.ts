import assert from "node:assert/strict";
import test from "node:test";
import {
  appendInAppMessageReplyInstructions,
  buildAbsoluteMessageReplyUrl,
  buildMessageReplyPath,
  replySubject,
} from "@/lib/message-reply-routing";

test("replySubject preserves existing reply subjects", () => {
  assert.equal(replySubject("Tuition question"), "Re: Tuition question");
  assert.equal(replySubject("RE: Tuition question"), "RE: Tuition question");
  assert.equal(replySubject(""), "Re: Portal message");
});

test("message reply paths target parent and staff in-app threads", () => {
  assert.equal(
    buildMessageReplyPath({
      audience: "parent",
      replyToMessageId: "message-1",
      familyId: "family-1",
      subject: "Classroom photo",
    }),
    "/parent-portal?replyToMessageId=message-1&subject=Re%3A+Classroom+photo&familyId=family-1#messages",
  );
  assert.equal(
    buildMessageReplyPath({
      audience: "staff",
      replyToMessageId: "message-2",
      staffId: "teacher-1",
      subject: "Schedule",
    }),
    "/messages?replyToMessageId=message-2&subject=Re%3A+Schedule&targetMode=staff&staffId=teacher-1#message-composer",
  );
});

test("message reply email copy points users back to Bee Suite", () => {
  const url = buildAbsoluteMessageReplyUrl({
    appBaseUrl: "https://thebeesuite.io/",
    audience: "staff",
    replyToMessageId: "message-1",
    familyId: "family-1",
    subject: "Hello",
  });

  assert.equal(url, "https://thebeesuite.io/messages?replyToMessageId=message-1&subject=Re%3A+Hello&targetMode=family&familyId=family-1#message-composer");
  assert.match(appendInAppMessageReplyInstructions("Body", url), /Reply in The Bee Suite:/);
  assert.match(appendInAppMessageReplyInstructions("Body", url), /Email replies are not attached/);
});
