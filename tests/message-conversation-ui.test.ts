import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const inbox = readFileSync("src/components/message-conversation-inbox.tsx", "utf8");
const composer = readFileSync("src/components/message-reply-panel.tsx", "utf8");
const messagesPage = readFileSync("src/components/live-ops-pages.tsx", "utf8");
const routePage = readFileSync("src/app/[slug]/page.tsx", "utf8");
const parentPortal = readFileSync("src/components/parent-portal-workspace.tsx", "utf8");
const conversationStyles = readFileSync("src/components/message-conversation.module.css", "utf8");
const familyIntake = readFileSync("src/components/family-student-intake-form.tsx", "utf8");

test("conversation timestamps use the school time zone during server and client rendering", () => {
  assert.match(inbox, /useSchoolTimeZone/);
  assert.match(routePage, /centerTimeZoneById/);
  assert.match(routePage, /centerTimeZoneById = new Map\(centers\.map\(\(center\) => \[center\.id, readCenterLocationTimeZone\(center\)\]\)\)/);
  assert.match(routePage, /timeZone: messageCenterId \? centerTimeZoneById\.get\(messageCenterId\)/);
  assert.match(routePage, /message\.threadKey\?\.startsWith\("internal:"\)/);
  assert.match(routePage, /centerTimeZoneById\.has\(internalCenterId\)/);
  assert.match(inbox, /thread\.timeZone \|\| defaultTimeZone/);
  assert.match(inbox, /selectedThread\?\.timeZone \|\| defaultTimeZone/);
  assert.match(inbox, /zonedDateKey\(date, timeZone\)[\s\S]*zonedDateKey\(now, timeZone\)/);
  assert.match(inbox, /Intl\.DateTimeFormat\("en-US"[\s\S]*timeZone/);
});

test("family intake contact and PIN controls preserve native input events", () => {
  assert.match(familyIntake, /name="guardianEmail"[\s\S]*onInput=.*setGuardianEmail/);
  assert.match(familyIntake, /name="guardianPhone"[\s\S]*onInput=.*setGuardianPhone/);
  assert.match(familyIntake, /name="checkInPin"[\s\S]*onInput=.*setCheckInPin/);
});

test("director messaging uses a searchable, accessible conversation inbox", () => {
  assert.match(inbox, /aria-label="Family conversation list"/);
  assert.match(inbox, /Search family conversations/);
  assert.match(inbox, /initialSearchQuery/);
  assert.match(inbox, /window\.history\.replaceState/);
  assert.match(inbox, /updateBrowserMessagingParam\("familyId", thread\.familyId \?\? ""\)/);
  assert.match(inbox, /aria-pressed=\{isSelected\}/);
  assert.match(inbox, /data-message-origin=\{message\.isFromFamily \? "family" : "school"\}/);
  assert.match(inbox, /Messages with \$\{selectedThread\.familyName\}/);
  assert.match(messagesPage, /<MessageConversationInbox/);
  assert.match(inbox, /styles\.staffShell/);
  assert.match(inbox, /Family conversation/);
  assert.match(inbox, /Staff conversation/);
  assert.match(conversationStyles, /\.bubbleSchool/);
  assert.match(conversationStyles, /backdrop-filter: blur\(22px\)/);
  assert.match(conversationStyles, /overscroll-behavior: contain/);
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

test("director inbox keeps school-scoped threads visible after a family has no current enrollment", () => {
  assert.match(routePage, /const messageFamilyScopeWhere:[\s\S]*?teacherMessageScope[\s\S]*?familyScopeWhere[\s\S]*?: visibleFamilyWhere\(visibleCenterIds\)/);
  assert.match(routePage, /buildVisibleMessageWhere\(\{[\s\S]*?familyScopeWhere: messageFamilyScopeWhere/);
  assert.match(routePage, /prisma\.family\.findMany\(\{[\s\S]*?where: familyScopeWhere/);
});

test("parent portal presents messaging as one responsive school conversation", () => {
  assert.match(parentPortal, /styles\.parentWorkspace/);
  assert.match(parentPortal, /Messages with \$\{centerName \?\? "your school"\}/);
  assert.match(parentPortal, /data-message-origin=\{isFromFamily \? "family" : "school"\}/);
  assert.match(parentPortal, /messages\s*\.slice\(0, 20\)\s*\.reverse\(\)/);
  assert.match(parentPortal, /Only your family and school can see this conversation\./);
  assert.match(parentPortal, /router\.refresh\(\)/);
  assert.match(parentPortal, /ref=\{messageTimelineRef\}/);
  assert.match(parentPortal, /className=\{styles\.parentComposerRow\}/);
  assert.match(parentPortal, /aria-label=\{isPending \? "Sending message" : "Send message"\}/);
  assert.match(parentPortal, /htmlFor="portal-message-attachments"/);
  assert.match(parentPortal, /aria-label="Attach photos or files"/);
  assert.match(parentPortal, /style=\{\{ width: 1, height: 1,/);
  assert.match(conversationStyles, /height: max\(28rem, calc\(100dvh/);
  assert.match(conversationStyles, /position: sticky/);
  assert.match(conversationStyles, /min-height: 2\.75rem/);
  assert.match(conversationStyles, /field-sizing: content/);
  assert.doesNotMatch(parentPortal, /id="recent-messages"/);
});

test("parent message direction comes from the family-scoped server query", () => {
  assert.match(routePage, /prisma\.message\.findMany\(\{[\s\S]*?where: \{ familyId \}/);
  assert.match(routePage, /sender: \{ select: \{ name: true, role: true \} \}/);
  assert.match(routePage, /isFromFamily: message\.sender\?\.role === UserRole\.PARENT_GUARDIAN/);
  assert.match(routePage, /centerName=\{parentPortalCenterName \? formatCenterName\(parentPortalCenterName\) : null\}/);
});
