import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(path, "utf8");
}

const shell = source("src/components/app-shell.tsx");
const table = source("src/components/ui/table.tsx");
const teacher = source("src/components/teacher-mobile-workspace.tsx");
const kiosk = source("src/components/kiosk-check-in.tsx");
const parentWorkspace = source("src/components/parent-portal-workspace.tsx");
const globalCss = source("src/app/globals.css");
const previewQa = source("scripts/qa-device-preview.ts");
const responsiveQa = source("scripts/qa-responsive.ts");
const alert = source("src/components/ui/alert.tsx");
const parentSetup = source("src/components/parent-portal-setup-form.tsx");
const registration = source("src/components/online-registration-form.tsx");
const resources = source("src/app/resources/page.tsx");
const login = source("src/components/login-form.tsx");
const dashboard = source("src/components/dashboard.tsx");
const agencyWorkspace = source("src/components/agency-subsidy-workspace.tsx");
const agencyControls = source("src/components/agency-reconciliation-controls.tsx");
const terminal = source("src/components/stripe-terminal-payment.tsx");
const terminalWorkspace = source("src/components/director-payment-terminal-workspace.tsx");
const executive = source("src/components/executive-admin-console.tsx");
const billing = source("src/components/billing-workbench.tsx");
const livePage = source("src/app/[slug]/page.tsx");
const messageStyles = source("src/components/message-conversation.module.css");

test("global search exposes complete keyboard combobox state on desktop and mobile", () => {
  assert.match(shell, /aria-activedescendant=\{searchOpen && activeSearchIndex >= 0/);
  assert.match(shell, /id=\{`global-search-option-\$\{index\}`\}/);
  assert.match(shell, /id=\{`mobile-global-search-option-\$\{index\}`\}/);
  assert.match(shell, /aria-selected=\{activeSearchIndex === index\}/);
  assert.match(shell, /event\.key === "ArrowDown" \|\| event\.key === "ArrowUp"/);
  assert.match(shell, /event\.key === "Escape"/);
  assert.match(shell, /event\.key === "Home" \|\| event\.key === "End"/);
  assert.match(shell, /activeSearchIndex < resultCount/);
  assert.match(shell, /onOpenChange=\{\(open\) => \{[\s\S]*?setActiveSearchIndex\(-1\)/);
  assert.match(shell, /role="status">Searching families, billing, leads, and child records…/);
  assert.match(shell, /const controller = new AbortController\(\)[\s\S]*global-search[\s\S]*signal: controller\.signal/);
  assert.match(shell, /window\.clearTimeout\(handle\);[\s\S]*controller\.abort\(\)/);
});

test("shared responsive tables are keyboard-scrollable with a visible focus indicator", () => {
  assert.match(table, /useState\(true\)/);
  assert.match(table, /container\.scrollWidth > container\.clientWidth \+ 1/);
  assert.match(table, /tabIndex=\{isHorizontallyScrollable \? 0 : undefined\}/);
  assert.match(table, /new ResizeObserver\(update\)/);
  assert.match(table, /focus-visible:outline-primary/);
});

test("teacher rosters never hide children after the twelfth row", () => {
  assert.match(teacher, /classroom\.children\.map\(\(child\) =>/);
  assert.doesNotMatch(teacher, /classroom\.children\.slice\(0,\s*12\)/);
});

test("kiosk mode controls expose their selected state", () => {
  assert.match(kiosk, /aria-pressed=\{activeKioskMode === "family"\}/);
  assert.match(kiosk, /aria-pressed=\{activeKioskMode === "staff"\}/);
  assert.match(kiosk, /aria-pressed=\{credentialMode === "pin"\}/);
  assert.match(kiosk, /aria-pressed=\{credentialMode === "qr"\}/);
});

test("kiosk lookup outcomes move focus to visible feedback and result content", () => {
  assert.match(kiosk, /feedbackRef = useRef<HTMLDivElement \| null>\(null\)/);
  assert.match(kiosk, /resultPanelRef = useRef<HTMLDivElement \| null>\(null\)/);
  assert.match(kiosk, /target\.focus\(\{ preventScroll: true \}\)/);
  assert.match(kiosk, /prefers-reduced-motion: reduce/);
  assert.match(kiosk, /if \(error \|\| status\) return;[\s\S]*resultPanelRef\.current/);
  assert.match(kiosk, /<Card ref=\{resultPanelRef\} tabIndex=\{-1\}[\s\S]*?<CardTitle as="h2">[\s\S]*staffLookup\.staff\.name[\s\S]*lookup\.family\.name/);
});

test("teacher shortcuts stay in flow without covering enlarged forms and kiosk navigation uses links", () => {
  const shortcuts = teacher.match(/<nav aria-label="Teacher task shortcuts"[^>]*>/)?.[0];
  assert.ok(shortcuts);
  assert.doesNotMatch(shortcuts, /sticky|fixed/);
  assert.match(teacher, /grid grid-cols-2 gap-2 sm:grid-cols-3/);
  assert.match(teacher, /min-h-11 w-full justify-start whitespace-normal/);
  assert.doesNotMatch(teacher, /window\.location\.assign\(kioskAccess\.kioskPath\)/);
  assert.ok((teacher.match(/render=\{<Link href=\{kioskAccess\.kioskPath\} \/>\}/g) ?? []).length >= 2);
});

test("the responsive preview matrix includes the parent billing settings screen", () => {
  assert.match(previewQa, /id: "parent-billing", path: "\/device-preview\?view=parent&screen=family&section=billing"/);
});

test("family accent text and focus rings use a contrast-safe ink token", () => {
  assert.match(globalCss, /--family-accent-ink: oklch\(0\.46 0\.115 72\)/);
  assert.match(globalCss, /--ring: var\(--family-accent-ink\)/);
  assert.match(globalCss, /\.bee-app-frame\[data-module="family"\] \.text-primary/);
});

test("mobile messages remove the visual header without removing the page heading", () => {
  assert.match(parentWorkspace, /activeView === "messages" \? "max-sm:hidden"/);
  assert.match(parentWorkspace, /<h1 className="sr-only sm:hidden">\{activeViewCopy\.title\}<\/h1>/);
  assert.doesNotMatch(parentWorkspace, /activeView === "messages" \? "max-sm:sr-only"/);
  assert.match(parentWorkspace, /role="img" aria-label="Private family conversation"/);
  assert.match(messageStyles, /\.parentWorkspace\s*\{[^}]*height: auto/);
  assert.match(messageStyles, /\.parentTimeline\s*\{[^}]*min-height: 12rem;[^}]*flex: none/);
  assert.doesNotMatch(messageStyles, /parentWorkspace[\s\S]{0,250}28rem/);
});

test("public responsive QA rejects redirects, blank main content, and headingless pages", () => {
  assert.doesNotMatch(responsiveQa, /"\/parent-portal\/setup"/);
  assert.doesNotMatch(responsiveQa, /"\/check-in"/);
  assert.match(responsiveQa, /metrics\.finalPathname === route/);
  assert.match(responsiveQa, /metrics\.hasVisibleMain/);
  assert.match(responsiveQa, /metrics\.visibleHeadingCount > 0/);
  assert.match(responsiveQa, /main\?\.innerText/);
  assert.match(responsiveQa, /serviceWorkers: "block"/);
  assert.match(responsiveQa, /"\/_vercel\/insights\/script\.js"/);
  assert.match(responsiveQa, /"\/_vercel\/speed-insights\/script\.js"/);
  assert.doesNotMatch(responsiveQa, /document\.body\.textContent/);
});

test("non-destructive notices announce politely while destructive feedback stays assertive", () => {
  assert.match(alert, /role=\{role \?\? \(variant === "destructive" \? "alert" : "status"\)\}/);
  assert.match(kiosk, /role="status" aria-live="polite"/);
  assert.match(kiosk, /role="alert"[\s\S]*variant="destructive"/);
});

test("parent setup constrains communication preferences and always exposes a page heading", () => {
  assert.match(parentSetup, /guardianCommunicationOptions\.map/);
  assert.match(parentSetup, /name="preferredCommunication"/);
  assert.doesNotMatch(parentSetup, /placeholder="Email, text message, or portal"/);
  assert.match(parentSetup, /<CardTitle as="h1">Parent Portal Setup<\/CardTitle>/);
});

test("registration retains input on network failure and links server errors to fields", () => {
  assert.match(registration, /RegistrationErrorsContext/);
  assert.match(registration, /"aria-invalid": error \? true : undefined/);
  assert.match(registration, /"aria-describedby": error \? `\$\{id\}-error` : undefined/);
  assert.match(registration, /resultSummaryRef\.current\?\.focus\(\{ preventScroll: true \}\)/);
  assert.match(registration, /prefers-reduced-motion: reduce/);
  assert.match(registration, /catch \{[\s\S]*Your information remains in the form/);
  assert.match(registration, /autoComplete=\{autoComplete \?\? "off"\}/);
  assert.match(registration, /primaryGuardianEmail[^\n]*autoComplete="email"/);
  assert.match(registration, /primaryGuardianSocialSecurityNumber[^\n]*type="password"[^\n]*maxLength=\{11\}/);
});

test("public resources expose every guide through a categorized keyboard-friendly index", () => {
  assert.match(resources, /aria-label="Resource guide index"/);
  assert.match(resources, /guideIndexGroups\.map/);
  assert.match(resources, /group\.guides\.map/);
  assert.match(resources, /min-h-11/);
  assert.match(resources, /\{guides\.map\(\(guide\) =>/);
  assert.doesNotMatch(resources, /guides\.slice\(/);
});

test("mobile sign-in presents the form before role switching and respects safe areas", () => {
  assert.match(login, /min-h-dvh/);
  assert.match(login, /env\(safe-area-inset-top\)/);
  assert.match(login, /env\(safe-area-inset-bottom\)/);
  assert.match(login, /aria-label="Choose a role-specific sign-in page" className="order-2/);
  assert.match(login, /<form className="order-1[^\"]*sm:order-2"/);
});

test("dashboard graphics provide text equivalents and truthful progress values", () => {
  assert.match(dashboard, /aria-valuetext=\{`\$\{metrics\.fteSubmittedSchools\} of \$\{metrics\.schoolComparisons\.length\} schools submitted`\}/);
  assert.match(dashboard, /aria-valuetext=\{`\$\{metrics\.fteMissingSchools\} of \$\{metrics\.schoolComparisons\.length\} schools missing`\}/);
  assert.ok((dashboard.match(/<figure/g) ?? []).length >= 4);
  assert.ok((dashboard.match(/<figcaption/g) ?? []).length >= 4);
  assert.ok((dashboard.match(/<table className="sr-only">/g) ?? []).length >= 4);
  assert.doesNotMatch(dashboard, /width: `\$\{Math\.min\(100, live\.actionItems\.length \* 8\)\}%`/);
});

test("agency forms use school-local dates and avoid nested horizontal scrollers", () => {
  assert.match(agencyWorkspace, /selectedTimeZone/);
  assert.match(agencyWorkspace, /agencyDateDefault\(selectedTimeZone/);
  assert.match(agencyControls, /agencyDateDefault\(timeZone/);
  assert.doesNotMatch(agencyWorkspace, /overflow-x-auto[^\n]*[\s\S]{0,120}<Table/);
  assert.doesNotMatch(agencyControls, /overflow-x-auto[^\n]*[\s\S]{0,120}<Table/);
  assert.doesNotMatch(agencyWorkspace, /className="grid grid-cols-2/);
  assert.doesNotMatch(agencyControls, /className="grid grid-cols-2/);
});

test("terminal workflow blocks ambiguous retries and announces real progress", () => {
  assert.match(terminal, /TerminalPaymentStatus = [^;]*"review"/);
  assert.match(terminal, /onStatusChange\?\.\(status\)/);
  assert.match(terminal, /do not retry this charge until the original attempt is reconciled/i);
  assert.match(terminal, /status !== "review"/);
  assert.match(terminal, /role="status" aria-live="polite"/);
  assert.match(terminal, /role="alert" variant="destructive"/);
  assert.match(terminalWorkspace, /aria-current=\{active \? "step" : undefined\}/);
  assert.match(terminalWorkspace, /onStatusChange=\{setTerminalStatus\}/);
});

test("administrative directories and teacher rosters do not silently omit records", () => {
  assert.doesNotMatch(executive, /sort\(\(a, b\) => a\.email\.localeCompare\(b\.email\)\)\.slice\(0, 75\)/);
  assert.match(executive, /Showing \{visibleBulkRows\.length\} of \{bulkRows\.length\} parsed rows/);
  assert.match(executive, /Search accounts/);
  assert.match(executive, /Unsaved \$\{label\} changes will be discarded/);
  assert.match(executive, /beforeunload/);
  assert.doesNotMatch(livePage, /orderBy: \[\{ isActive: "desc" \}, \{ email: "asc" \}\],[\s\S]{0,80}take: 150/);
  assert.doesNotMatch(livePage, /where: childWhereForTeacher,[\s\S]{0,100}take: 120/);
  assert.doesNotMatch(livePage, /where: teacherChildWhere,[\s\S]{0,100}take: 120/);
});

test("billing mutations surface interrupted requests with a reconciliation-safe message", () => {
  assert.match(billing, /function runBillingTransition\(action: \(\) => Promise<void>\)/);
  assert.match(billing, /Review the current account and Stripe activity, if applicable, before trying the action again/);
  assert.equal((billing.match(/runBillingTransition\(async \(\) =>/g) ?? []).length, 10);
  assert.match(billing, /beforeunload/);
  assert.match(billing, /This billing workspace has unsaved input/);
  assert.match(billing, /setLastSavedTuitionDraftSignature\(assignmentTuitionDraftSignature\)/);
  assert.match(billing, /setLastSavedChildContextDraftSignature\(assignmentChildContextDraftSignature\)/);
  assert.match(billing, /assignmentTuitionDraftSignature !== \(lastSavedTuitionDraftSignature \?\? persistedTuitionDraftSignature\)/);
  assert.match(billing, /assignmentChildContextDraftSignature !== \(lastSavedChildContextDraftSignature \?\? persistedChildContextDraftSignature\)/);
});
