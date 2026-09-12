import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const parent = readFileSync("src/components/parent-portal-workspace.tsx", "utf8");
const quality = readFileSync("src/app/product-ui.css", "utf8");

test("expanded parent day details preserve label and icon space at 200 percent text", () => {
  assert.match(parent, /className="min-w-0 flex-1 group-open:hidden">View day details/);
  assert.match(parent, /className="hidden min-w-0 flex-1 group-open:inline">Hide day details/);
  assert.match(parent, /Plus className="size-4 shrink-0 group-open:hidden"/);
  assert.match(parent, /Minus className="hidden size-4 shrink-0 group-open:block"/);
  assert.doesNotMatch(parent, /group-open:rotate-45/);
  assert.match(parent, /className="hidden min-w-0 flex-1 group-open:inline">Hide full announcement/);
  assert.match(readFileSync("scripts/qa-mobile-features.ts", "utf8"), /screen === "home" \? "view=parent&screen=home&scenario=single-review"/);
});

test("the full authenticated toolbar fits small phones with 44px icon targets", () => {
  assert.match(quality, /\.app-header button\[data-size\^="icon"\]\s*\{[^}]*width: 44px;[^}]*min-width: 44px;[^}]*height: 44px;[^}]*min-height: 44px/);
  const shell = readFileSync("src/components/app-shell.tsx", "utf8");
  assert.match(shell, /aria-label="Search The BEE Suite \(preview\)" className="lg:hidden" disabled/);
  assert.match(shell, /aria-label="Notifications \(preview\)" disabled/);
  assert.match(readFileSync("scripts/qa-mobile-features.ts", "utf8"), /:is\(main,\.app-header\) :is\(button/);
});

test("enlarged bottom navigation reflows into readable touch-sized rows", () => {
  assert.match(quality, /\[data-role="PARENT_GUARDIAN"\] \.app-bottom-navigation > div\s*\{[^}]*display: flex;[^}]*flex-wrap: wrap/);
  assert.match(quality, /\[data-role="PARENT_GUARDIAN"\] \.app-bottom-navigation > div > :is\(a, button\)\s*\{[^}]*flex: 1 0 44px;[^}]*min-width: max-content/);
  assert.match(quality, /\.app-bottom-navigation > div > :is\(a, button\)\s*\{[^}]*min-height: 48px/);
  assert.match(readFileSync("scripts/qa-mobile-features.ts", "utf8"), /\.app-bottom-navigation :is\(a,button\)/);
});

test("parent document spacing preserves readable fields instead of scaling nested padding", () => {
  const css = readFileSync("src/app/parent-mobile-home.css", "utf8");
  assert.match(css, /\[data-parent-document-body\]\s*\{\s*padding-inline: 12px/);
  assert.match(css, /\[data-parent-document-consent\]\s*\{\s*min-height: 44px/);
  assert.match(parent, /<fieldset data-parent-document-form disabled=\{isPending\}/);
  assert.match(parent, /parentFamilySectionTitles\[activeFamilySection\]/);
  assert.match(parent, /buttonVariants\(\{ variant: "outline", size: "sm" \}\)\} max-lg:hidden/);
});

test("mobile feature buttons wrap without resizing icon-only controls", () => {
  assert.match(readFileSync("src/components/ui/button.tsx", "utf8"), /data-size=\{size\}/);
  assert.match(quality, /\[data-slot="button"\]:not\(\[data-size\^="icon"\]\)\s*\{[^}]*max-width: 100%;[^}]*height: auto;[^}]*white-space: normal/);
});

test("nested feature grids and selectors can shrink with enlarged text", () => {
  assert.match(quality, /:is\(\.parent-portal-workspace, \.teacher-mobile-workspace\) \.grid > \*\s*\{\s*min-width: 0/);
  assert.match(quality, /\[data-slot="select-value"\]\s*\{[^}]*min-width: 0;[^}]*flex-wrap: wrap/);
  assert.match(quality, /\.parent-record-summary\s*\{[^}]*grid-template-columns: auto minmax\(0, 1fr\)/);
  assert.match(quality, /\.parent-record-summary > :last-child\s*\{[^}]*max-width: 100%;[^}]*flex-wrap: wrap/);
});

test("message composition reserves space for the send control and attachment tray", () => {
  const css = readFileSync("src/components/message-conversation.module.css", "utf8");
  for (const name of ["parentComposerRow", "parentMessageInput", "parentAttachmentTray"]) {
    assert.match(css, new RegExp(`\\.${name}\\s*\\{[^}]*min-width: 0`, "s"));
  }
  assert.match(css, /\.parentTimeline\s*\{[^}]*min-height: 12rem;[^}]*flex: none/);
  assert.match(css, /\.parentWorkspace\s*\{[^}]*height: auto;[^}]*min-height: 0/);
  assert.match(css, /width: calc\(100% \+ 2 \* var\(--bee-parent-page-gutter, 0\.75rem\)\)/);
  assert.match(css, /margin-inline: calc\(-1 \* var\(--bee-parent-page-gutter, 0\.75rem\)\)/);
  assert.match(readFileSync("src/app/parent-mobile-home.css", "utf8"), /--bee-parent-page-gutter: 12px/);
});

test("every available family document can be revealed with keyboard continuation", () => {
  assert.match(parent, /displayDocuments\.slice\(0, visibleDocumentCount\)/);
  assert.doesNotMatch(parent, /documents\.slice\(0, 5\)/);
  assert.match(parent, /setVisibleDocumentCount\(\(count\) => count \+ 5\)/);
  assert.match(parent, /\[visibleDocumentCount\]\?\.focus\(\)/);
  assert.match(parent, /Showing \$\{Math\.min\(visibleDocumentCount, displayDocuments\.length\)\} of \$\{displayDocuments\.length\} loaded documents/);
});

test("empty updates have one explanation and report anchors remain unique", () => {
  assert.match(parent, /selectedUpdateDay && !selectedUpdateDay\.totalItems/);
  assert.match(parent, /role="group" className="divide-y" aria-label="Updates for the selected date"/);
  assert.match(parent, /reportIndex === 0 \? "daily-reports" : `daily-report-\$\{report\.id\}`/);
  assert.match(parent, /No documents requested/);
  assert.match(parent, /document\.expiresAt \? ` · expires/);
});

test("short phone viewports retain usable form space below enlarged shell controls", () => {
  assert.match(quality, /@media \(max-height: 640px\) and \(max-width: 1023px\)[^}]*\.app-header\s*\{\s*position: relative/);
  assert.match(quality, /scroll-margin-block: calc\(var\(--bee-app-header-height, 4\.75rem\) \+ 1rem\) 8rem/);
  assert.match(readFileSync("src/components/app-shell.tsx", "utf8"), /sm:pb-\[calc\(7rem\+env\(safe-area-inset-bottom\)\)\] lg:pb-6/);
});

test("feature QA exercises real forms but refuses production or data writes", () => {
  const qa = readFileSync("scripts/qa-mobile-features.ts", "utf8");
  assert.match(qa, /assertNonProductionBaseUrl\(argument/);
  assert.match(qa, /request\.method\(\) !== "GET"/);
  assert.match(qa, /url\.pathname\.startsWith\("\/api\/"\)/);
  assert.match(qa, /assert\.ok\(results\.length > 0/);
  assert.match(qa, /Unsupported screen/);
  assert.match(qa, /Unsupported width/);
});

test("help uses a dismissible viewport-constrained popover with a visible close action", () => {
  const info = readFileSync("src/components/ui/info-tip.tsx", "utf8");
  assert.match(info, /Popover\.Positioner side=\{side\} align=\{align\} sideOffset=\{6\} collisionPadding=\{12\}/);
  assert.match(info, /max-h-\(--available-height\)/);
  assert.match(info, /collisionAvoidance=\{\{ side: "shift", align: "shift" \}\}/);
  assert.match(info, /Popover\.Close aria-label="Close information"/);
  assert.doesNotMatch(info, /<details|role="note"/);
  assert.match(readFileSync("scripts/qa-mobile-features.ts", "utf8"), /Help restores keyboard focus/);
});
