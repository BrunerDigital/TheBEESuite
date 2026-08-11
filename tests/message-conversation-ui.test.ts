import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const inbox = readFileSync("src/components/message-conversation-inbox.tsx", "utf8");
const composer = readFileSync("src/components/message-reply-panel.tsx", "utf8");
const messagesPage = readFileSync("src/components/live-ops-pages.tsx", "utf8");
const routePage = readFileSync("src/app/[slug]/page.tsx", "utf8");
const parentPortal = readFileSync("src/components/parent-portal-workspace.tsx", "utf8");
const conversationStyles = readFileSync("src/components/message-conversation.module.css", "utf8");

test("director messaging uses a searchable, accessible conversation inbox", () => {
  assert.match(inbox, /aria-label="Family conversation list"/);
  assert.match(inbox, /Search family conversations/);
  assert.match(inbox, /aria-pressed=\{isSelected\}/);
  assert.match(inbox, /data-message-origin=\{message\.isFromFamily \? "family" : "school"\}/);
  assert.match(inbox, /Messages with \$\{selectedThread\.familyName\}/);
  assert.match(messagesPage, /<MessageConversationInbox/);
  assert.match(inbox, /styles\.staffShell/);
  assert.match(inbox, /Family conversation/);
  assert.match(inbox, /Staff conversation/);
  assert.match(conversationStyles, /\.bubbleSchool/);
  assert.match(conversationStyles, /backdrop-filter: blur\(22px\)/);
});

test("selected family threads offer an in-context reply without bypassing the guarded send route", () => {
  assert.match(inbox, /variant="conversation"/);
  assert.match(inbox, /replyToMessageId:/);
  assert.match(inbox, /familyId: selectedThread\.familyId/);
  assert.match(composer, /fetch\("\/api\/communications\/messages"/);
  assert.match(composer, /Your reply stays in this family conversation/);
  assert.match(composer, /Email copy/);
  assert.match(composer, /In-app notification/);
});

test("conversation direction is derived from role data inside the existing scoped message query", () => {
  assert.match(routePage, /const \[messages, families, templates/);
  assert.match(routePage, /where: messageWhere/);
  assert.match(routePage, /sender:[\s\S]*?role: true/);
  assert.match(routePage, /message\.sender\?\.role === UserRole\.PARENT_GUARDIAN/);
  assert.match(routePage, /message\.sender\?\.role === UserRole\.AUTHORIZED_PICKUP/);
});

test("parent portal presents messaging as one responsive school conversation", () => {
  assert.match(parentPortal, /styles\.parentWorkspace/);
  assert.match(parentPortal, /Messages with \$\{centerName \?\? "your school"\}/);
  assert.match(parentPortal, /data-message-origin=\{isFromFamily \? "family" : "school"\}/);
  assert.match(parentPortal, /messages\s*\.slice\(0, 20\)\s*\.reverse\(\)/);
  assert.match(parentPortal, /Only your family and school can see this conversation\./);
  assert.match(parentPortal, /router\.refresh\(\)/);
  assert.doesNotMatch(parentPortal, /id="recent-messages"/);
});

test("parent message direction comes from the family-scoped server query", () => {
  assert.match(routePage, /prisma\.message\.findMany\(\{[\s\S]*?where: \{ familyId \}/);
  assert.match(routePage, /sender: \{ select: \{ name: true, role: true \} \}/);
  assert.match(routePage, /isFromFamily: message\.sender\?\.role === UserRole\.PARENT_GUARDIAN/);
  assert.match(routePage, /centerName=\{parentPortalCenterName \? formatCenterName\(parentPortalCenterName\) : null\}/);
});
