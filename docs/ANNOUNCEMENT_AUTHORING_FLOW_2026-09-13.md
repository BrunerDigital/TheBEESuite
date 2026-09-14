# School announcement authoring — September 13, 2026

## Current truth before editing

Inspected current main `12612f539a6287e1332683202e9a74a13a3358d9`; privacy PR #375 is independent and under protected CI. The Announcements page renders a large header, four counts, a six-column newest-100 queue and a generic multi-record form. It promises scheduling/staff audiences although no scheduler is wired here; the generic form sends `expiresAt` while announcement persistence reads `sendAt`. Existing raw-ID editing writes arbitrary status without optimistic concurrency. Saving is not guarded against unknown outcomes. The Parent query treats active/sent/published as visible without validating audience JSON. The email endpoint currently queries all school families, including withdrawn families, and truncates recipients. None of these source findings required real sends or production data inspection.

## Implementation scope

Provide a compact dedicated editor, explicit saved draft and parent-portal publishing, full saved-history navigation, scoped row selection, dirty/pending/unknown-result recovery and exact canonical receipts. Preserve existing school, audience and historical timestamps unless an explicit supported transition requires change. Recheck current identity separately from selected-school authority inside an atomic record/audit transaction; fail closed on stale or ambiguous state. Do not imply that publishing dispatches email/SMS/push or schedules delivery. Keep email as a distinct safety boundary; never send real messages during verification. No migration or historical record rewrite.

Pre-change printable browser review: `output/pdf/BEE_Suite_Current_Mobile_UI_2026-09-13_PR374.pdf`, 14 fake-data production captures at 7:35–7:40 PM America/New_York. All pages were rendered and inspected. It is browser, not native/device/App Store evidence. Earlier packets remain recoverable.

## Completed implementation

The landing screen shows saved notices first; the editor opens only for New/Edit (or an empty collection). Phone users no longer scroll through an unused blank form. Expandable message bodies, clear Draft/Published/legacy-state labels, explicit school selection, full saved-history paging and enlarged-text wrapping replace the wide queue and misleading scheduled-delivery promise. Read-only users see the saved list without disabled authoring clutter. Global notices have no Edit action for school-only viewers. The generic operations form links to the dedicated editor instead of bypassing its contract.

Draft creation uses a stable UUID-derived ID plus atomic creator audit. Updates compare the complete saved record in a Serializable transaction and never move schools or overwrite audience/status/time implicitly. Publish is a separate confirmed transition for an unchanged saved whole-school parent draft. Published text edits require confirmation. No-op/whitespace-only saves do not write or add audit noise. Validation focuses and identifies the first invalid field. Dirty navigation can be canceled; pending edits lock; lost/malformed responses retain entries and offer an exact authorized saved-version check. A confirmed server refresh supersedes optimistic rows.

The parent display now fails closed for targeted/staff/unknown audience JSON instead of treating every sent/published record as school-wide. Existing recognized parent labels and null legacy whole-school audience are preserved. The separate older-than-eight Parent announcement history gap remains technical follow-up, not a claimed completed feature.

Email is a distinct Review → Confirm → Check status workflow. The preview uses only current families with an enrolled child in the exact school classroom/tenant, excludes reserved App Review addresses, and binds saved text, school/sender, actor and recipients to a fingerprint. More than 1,000 families or addresses rejects explicitly before any send; no silent truncation or automatic batches. Recipient addresses are private; the shared provider sends one personalization per address.

A unique per-announcement IntegrationDelivery plus audit is reserved before provider access. Only the exact actor/request/fingerprint can replay the same receipt; another request gets a conflict and must read status. Accepted, crashed and uncertain attempts cannot send again. Existing legacy attempts also hold the record. Both selection and atomic claim in the generic retry service exclude announcement email; the old records are preserved, not mutated. The new send path never changes portal publication state or time. Status says queued/unconfirmed/follow-up, never that every recipient received a batch email. Dirty authoring does not prevent a read-only email status check.

## Local evidence

Focused workflow, delivery, tenant, reserved-identity, auditing and existing guardrail tests: **125 passed**, `output/wave23-focused-final.log`. Actual components inside the shared application shell passed **27 cases per engine**: create/save/publish, first-invalid focus, pending lock, dirty cancel, lost response/recovery, duplicate prevention, exact-role global-row actions, email preview/uncertain read-only status while retaining another draft, plus 320/390/768/1280 widths at 100%/200% root text for saved/read-only lists and the editor. No external API or provider request was allowed.

- Chromium: `output/playwright/announcement-workflow-chromium-2026-09-14T00-15-49-313Z/results.json`.
- WebKit: `output/playwright/announcement-workflow-webkit-2026-09-14T00-15-59-183Z/results.json`.
- Native/store static gate: `output/wave23-mobile-store-check.log` passed. No native project source changed.

Earlier evidence is retained: the browser found long unwrapped buttons at 200% and a short tablet input; both were fixed. The first full gate found a legacy source assertion for the replaced email implementation. It was replaced with the new pre-reservation filter/count contract and a real fake-provider test proving both reserved review addresses are excluded before dispatch, including an all-reserved zero-send case. The security assertion was not removed. Independent read-only reviews also found and verified fixes for stale replay attribution, no-op saves, global-row affordances and dirty-draft status recovery.

Final `npm run vercel-build` passed: Prisma generation, lint (zero errors; one existing unrelated `_row` warning), TypeScript, **2,347 tests**, and optimized Next.js production build. Log: `output/wave23-vercel-build-final.log`. Protected PR/deployment and production results will be appended after completion. Local intercepted writes are not authenticated management production proof. No real announcement was authored, published or emailed during this verification; no identity, migration, financial, provider or store action occurred.

## Delivery recovery runbook

For a held/uncertain email, open the saved announcement and choose **Check email status**. This is read-only and preserves any authoring draft. Do not recreate the announcement merely to bypass its held attempt. Authorized support must compare the exact IntegrationDelivery ID, school, confirmation fingerprint, recorded provider ID if available and provider events before proposing any separately authorized resend. An individual delivery webhook is not proof for all recipients. Missing provider acceptance evidence stays uncertain; do not reset status or delete history. Oversized audiences need a separately reviewed delivery plan. No automated announcement retry or production cleanup is authorized by this code release.
