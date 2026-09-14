# Parent announcement history — September 13, 2026

## Current truth before editing

The announcement-authoring release candidate is commit `72d84cecd96181e46eef9fd33093e47c7aff853c`, PR #376 under protected checks. Its parent audience correction is retained. The Parent Home query still selects only eight published/active/sent announcements, and the earlier-notices disclosure only expands those loaded rows; no continuation exists. A ninth older announcement is unreachable. The latest-card count can imply the capped subset is complete.

This follow-up adds a bounded, read-only history reader and continuation in the existing collapsed disclosure. Reuse the existing current-family/single-school/tenant proof from Parent Updates, require fully scoped cursor anchors, preserve reserved App Review suppression, payment-continuity privacy and authorized staff previews, and return a safe four-field announcement projection. Keep school/global scope and fail-closed audience filtering identical for initial and later pages. Preserve content, IDs, dates, publications and delivery history; no migration, announcement write or message send is authorized or required.

Implementation begins while PR #376 checks run; these changes are a separate next commit, not an amendment to that immutable release candidate. Production verification and full validation must be recorded separately before claiming completion.

## Implemented follow-up

Parent Home and its new read-only GET now share a RepeatableRead current-family/guardian/tenant/single-school proof. The initial eight safe notices and each next page use identical school/global, published-state and exact parent-audience predicates. Scoped timestamp/ID anchors, explicit null-date ordering, eight-plus-one queries and a four-field projection replace the inaccessible capped history. Missing, moved, targeted, draft or foreign cursors fail closed rather than restarting. Reserved App Review users never read announcement records, and payment-continuity users receive no school content. Authorized staff preview remains separate and cannot use guardian history.

Home remains compact. Earlier titles/dates are in a closed disclosure, with each body opened individually and eight more notices loaded only on request. The count explicitly says **loaded**, not a false total. Unavailable data is not reported as an empty school history. Retry preserves loaded notices and the exact cursor. Correlation, complete DTO/date validation and cross-page ordering reject malformed or wrong-family replies. Family/server refresh aborts and discards stale requests. Loading is synchronously locked while an accessible busy control retains keyboard focus; first-new and final-page focus move only when the user has not moved elsewhere. Text and controls wrap at narrow widths and 200% root text; full bodies retain line breaks.

Actual route mocks traverse 101 fake notices including equal dates and null dates, distinguish eight/nine rows, and exercise scoped forbidden states, current-family/tenant/role failures, reviewer suppression with zero announcement reads, malformed inputs and sanitized database failure. Initial focused suite: 20 passed. Shared application-shell browser tests cover 320/390/768/1280 widths at 100%/200%, 17-notice continuation, focus and final-page recovery, five bad-response variants with same-cursor retry, stale family/server snapshots, no focus theft, initial-load retry and disabled reviewer/demo/staff-preview history. All requests use local fake fixtures; no backend or provider is reachable.

The first full gate correctly rejected test-fixture memoization derived from a mutable URLSearchParams object. The fixture now captures the initial flag in stable React state; no lint/compiler setting was weakened. Final gate, fresh two-engine hashes and production results follow only after they pass.

## Final local release gate

`npm run vercel-build` passed: Prisma 6.19.3 generation, lint (zero errors; one pre-existing unrelated `_row` warning), TypeScript, **2,352 tests**, and optimized Next.js 16.3.4 build. Log: `output/wave24-vercel-build-final.log`. Final focused history/recovery/payment-continuity suite: **36 passed**, `output/wave24-focused-final.log`. `npm run mobile:store:check` passed for both apps, including synchronized generated shell assets, identities, HTTPS/offline, privacy declarations and no-alpha icons/splashes; native source unchanged.

The final real-shell run passed **20 cases per engine**, 31 intercepted fake GETs each, zero writes, external requests or client errors, with unchanged source hashes:

- Chromium: `output/playwright/parent-announcement-history-chromium-2026-09-14T00-37-35-418Z/results.json`.
- WebKit: `output/playwright/parent-announcement-history-webkit-2026-09-14T00-37-45-185Z/results.json`.

Fresh collapsed Home and expanded-history captures are in those folders; root visually inspected 390px default text and 320px enlarged text evidence. These are browser fake-data fixtures, not App Store screenshots or physical-device/Dynamic Type evidence. Earlier failed browser/gate evidence remains preserved in task output.

Protected production verification will use the existing reserved fake graph with a separate exact-query, same-origin, one-shot announcement GET permission and a pre-screenshot zero-announcement-row guard. The offline checker passed **57 safety assertions** with no network/database access. It will test empty correlated reviewer success, malformed/unknown cursor denials and teacher-role denial without enumerating real notices or another family. Populated and cross-family cases remain local actual-route proof; no live notice creation or email is needed.
