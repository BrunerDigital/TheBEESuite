# Invoice calendar-date consistency — September 13, 2026

## Verified baseline before changes

Clean isolated branch `work/invoice-calendar-date-consistency-20260913` starts at protected PR #371 main `a942b997c4dd6b32b05c42f6064e2b28a7d322a2`. Primary dirty checkout and unrelated work are preserved. PR #371 is deploying; its separate final production verification is pending.

Actual Billing component screenshots from the preceding office QA show a September 14 date input beside a September 13 invoice label in a US browser. The invoice editor uses the UTC calendar day (`toISOString().slice(0, 10)`), while these labels format the stored midnight using browser/school timezone. Historical midnight and newer noon UTC values must both preserve their invoice calendar day.

Read-only audit identified 13 timezone-dependent display sites: four Billing workbench labels, three Parent summaries/history labels, printable invoice, payment-method link, office invoice table, kiosk summary, receivables oldest-due summary, and global-search invoice detail. Receivables print already preserves the calendar day and will use the same helper for parity. Operational Calendar invoice entries already use all-day UTC semantics; leave those unchanged.

## Scope and validation contract

Use one pure calendar-date display formatter for all 14 sites. Do not change persisted dates, parsers, due/overdue comparisons, balances, invoice edits, payment history, authorization, recipient scope or provider behavior. Actual payment, ledger, report and generated-at timestamps retain their existing timezone rules. Preserve kiosk's compact month/day label and existing absent-date fallbacks.

Add behavioral timezone/DST/leap/year/invalid-input tests and source wiring guards. Exercise real office, parent, secure-link, receivables and print components with exclusively local fake data and no backend/provider requests. Run focused and full production gates, protected release, exact deployment/alias/health/log verification and guarded fake-account regression. Management-role production authentication remains unavailable; do not call local component proof an authenticated office production test.

## Implemented and locally verified

`formatInvoiceDueDate` fixes the UTC calendar day for all 14 direct display/print sites. Existing event formatters and invoice input/parser/storage behavior are unchanged. Five new regression tests cover historical midnight/noon values, Date objects, six independent process timezones, DST/year/leap boundaries, explicit offsets, fallbacks, kiosk compact format, source immutability, every direct consumer and unchanged event timestamps. The focused suite passed 22 tests; independent review passed a 37-test subset and found no release blockers.

Final Chromium and WebKit each passed 65 cases: five real component views (office invoice editing, Parent Home, Parent Payments, secure payment-link form and receivables), four browser timezones, date-only/midnight/noon values and additional 320px/200% text cases. Tests verify original invoice versus unsaved date draft, Parent/receivables screen-to-print parity and stable hashes for all selected product sources. Every API, non-GET and off-origin request is blocked; none occurred. Browser exceptions: zero. Parent fixtures are preview-only and all data is synthetic.

Evidence: `output/playwright/invoice-calendar-date-chromium-2026-09-13T22-27-56-082Z` and `output/playwright/invoice-calendar-date-webkit-2026-09-13T22-28-07-492Z`; logs `output/wave19-calendar-release-{chromium,webkit}.log`. Root visually reviewed ordinary/enlarged dates and payment-link contrast using the real dark page background. Four generated Letter PDFs were parsed, rendered and visually inspected: one page each, 612 × 792pt, all contain September 14. Intermediate print-viewport and incomplete fixture-background runs remain historical, not final visual evidence.

These five fixture views are not a complete Next.js hydration or authenticated-production test. Kiosk, global-search, office invoice-table and workbench payment-review labels additionally rely on shared-helper behavior, exact source wiring and reviewed minimal diffs. No claim is made that those authenticated flows were exercised with real accounts.

Typecheck and static Parent/Teacher store readiness passed. The first full build stopped at Windows Prisma DLL replacement because the guarded production checker was still holding the client; no process was killed and no gate was skipped. After that checker exited successfully, the entire production gate passed: Prisma generation, lint (zero errors and one existing unrelated warning), TypeScript, all 2,191 tests and optimized Next.js build (`output/wave19-vercel-build-final.log`). Initial child-process test loader incompatibility was corrected to use this repository's CommonJS/tsx convention; failed evidence is retained.

The task-owned production checker now has an optional invoice-calendar mode: after fresh reserved graph proof, it reads only the existing fake family's bounded invoice history in the same tenant, independently derives UTC date labels, and checks four phone/text sizes plus available read-only print views. Its request allowlist is unchanged; all 49 offline safety checks pass. It will run only after this candidate's exact production commit is Ready. No live financial or identity mutation is authorized or needed. Protected-release evidence follows after completion.
