import test from "node:test";
import assert from "node:assert/strict";
import { notificationFixture } from "./helpers/inquiry-notification-fixture.mjs";
const base = { brandName: "Example School", program: "Daycare", locationName: "Example West", parentName: "Synthetic Parent", email: "parent@example.invalid" };
test("distinct inquiries at same location get distinct opaque subjects", async () => {
  const {send, sent} = notificationFixture();
  await send({...base, leadId:"cmw0000000000000000000001"}, ["school@example.invalid"]);
  await send({...base, leadId:"cmw0000000000000000000002"}, ["school@example.invalid"]);
  assert.notEqual(sent[0].subject, sent[1].subject);
  assert.match(sent[0].subject, /\[Inquiry cmw0000000000000000000001\]$/);
  assert.equal(sent[0].subject.includes("Synthetic Parent"), false);
  assert.equal(sent[0].subject.includes("parent@example.invalid"), false);
  assert.deepEqual(sent[0].to, ["central@example.invalid", "school@example.invalid"]);
});
test("retry of same lead keeps stable subject", async () => {
  const {send, sent} = notificationFixture();
  await send({...base,leadId:"cmw0000000000000000000001"});
  await send({...base,leadId:"cmw0000000000000000000001"});
  assert.equal(sent[0].subject,sent[1].subject);
});
test("missing or unsafe reference leaves legacy subject intact", async () => {
  const {send,sent} = notificationFixture();
  for(const leadId of [undefined,"","bad\r\nBcc: attacker@example.invalid","a".repeat(65)]) await send({...base,leadId});
  for(const message of sent) assert.equal(message.subject,"New Example School Inquiry - Daycare - Example West");
});
