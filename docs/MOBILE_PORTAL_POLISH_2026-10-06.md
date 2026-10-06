# Parent and teacher mobile portal polish

## Inspected state

The shared checkout contained unrelated creative, CRM, and import work. This
change was developed separately from origin/main at dd152d8a. Teacher sign-in
already used the teacher portal, but arrived at Today with classroom tasks
collapsed. Attendance depended on the child selected elsewhere in the roster.
Some phone fields used smaller text, and teacher profile values were truncated.

## Behavior

- Default teacher login and legacy dashboard arrival open the classroom roster,
  including attendance actions. Explicit task fragments and query context stay
  intact; Today remains available from navigation.
- Attendance exposes the existing shared, guarded child picker. Switching uses
  the same draft protection and current-roster validation as other individual
  tasks. No role, school, data, or API-write behavior changes.
- Parent and teacher phone fields use at least 16px text and respect enlarged
  text. Teacher profile values wrap on mobile.
- The responsive audit accepts additional phone widths and landscape heights,
  records the height, and checks phone input text size.

## Verification

Focused routing, child-selection, teacher navigation, and guardrail tests passed
(69 tests). Chromium baseline checks passed for all 11 portal screens at 320px
and at 568x320 landscape, at normal and 200% text. The existing home density
matrix passed 48 scenarios. Follow-up browser audits cover Chromium 390px light
and WebKit 320px dark plus 844x390 landscape; screenshots and reports are stored
under output/playwright in this worktree. All three follow-up matrices passed
(66 screen/text-size cases); both navigation engines passed four cases each,
and the child-picker fixture passed 42 cases with zero product writes.
Navigation checks exercise default
roster arrival, saved collapse preferences, keyboard focus, URL history, and
query preservation. Fixture checks use fake children and intercepted requests;
preview checks block API calls and external writes.

The complete production gate passed: lint, typecheck, 2,627 tests, and Next build.
Canonical production health was connected before release. The existing teacher
review account passed all three viewport sizes and concurrent authenticated
requests before release. Available parent review/synthetic credentials were
rejected, so authenticated parent verification remains unavailable; fixture
coverage passed. No account or credential was changed to bypass that gap.

These checks exercise web components in browser engines. A signed native iPhone
binary and physical-device keyboard behavior require separate device testing.

## Release dependency gate

Cloud validation detected GHSA-wq5f-xc86-pv6w in the existing Sharp 0.35.4
dependency. The scoped update to Sharp 0.35.5 and its platform binaries clears
the production audit. A local PNG resize/WebP conversion smoke check passed.
The complete gate is repeated for this dependency update before release.

## Short viewport follow-up

The next audit reproduced inaccessible controls at 390x320 with 200% text:
the fixed-height shell left too little content space, and recipient options
could be clipped. Parent and teacher shells now use document scrolling below
441px viewport height. Taller phone screens retain their existing shell layout.
Both workspaces schedule the existing active-focus-only reveal helper; fields
that fall outside the usable area are centered without refocusing or changing
drafts. The shared select now supplies the Base UI List container and makes
that list scroll inside a bounded flex popup.

The feature audit now checks focused-field hit testing, popup vertical bounds,
and keyboard access to the last overflowing option. It also opens document
panels revealed by pagination. Final Chromium 320px portrait and WebKit 390x320
dark matrices passed all 44 screen/text-size cases with zero API requests,
product writes, or client exceptions. Teacher picker fixture checks passed 42
cases (four intercepted synthetic writes, zero product writes); task navigation
passed four cases. A focused unit test protects short-screen centering and the
rule that a later interaction must never have its focus stolen.

Existing unsigned parent and teacher iOS simulator verification passed in
Actions run 37486178642. It covers cold launch and relaunch to sign-in, not
authenticated portal forms or a physical iPhone keyboard. Authenticated parent
QA remains unavailable with the existing credentials; no identity was changed.
