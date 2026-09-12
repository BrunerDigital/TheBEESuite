# Native messaging privacy reconciliation — September 12, 2026

## Current state recorded before changes

- Clean isolated branch `work/ios-privacy-message-inventory-20260912`, based on current main `9e6f84366932edfa20e44018f057c17945a2b1e6`.
- Parent and Teacher source manifests declare Other User Content and Photos or Videos, but omit Emails or Text Messages. The shared messaging API persists subject/body, sender, recipient/family and thread identifiers (`src/app/api/communications/messages/route.ts`; `Message` in `prisma/schema.prisma`).
- The existing 18 focused static/native tests pass despite that omission. Static checks search category strings and broad boolean patterns; the compiled-resource check only proves the manifest file exists.
- Apple's current [App Privacy Details guidance](https://developer.apple.com/app-store/app-privacy-details/) explicitly includes private in-app messages and WebView collection. Both apps need a separate Emails or Text Messages declaration, linked to the user, for App Functionality, not tracking. This corrects an inventory; it does not add data collection or permissions.
- Latest historical unsigned main evidence: [run 34671392809](https://github.com/BrunerDigital/TheBEESuite/actions/runs/34671392809), source `7e36706cd4526c3f656c109ab23b696f0db86a32`. Both roles passed seven checks on Xcode 26.6 / iOS 26.5 / iPhone 17. This is not evidence for the forthcoming correction.
- Signing, archives, uploads, authenticated native flows, physical-device testing and store-ready screenshots were **not performed** in that workflow. Public cold/terminated-relaunch screenshots are not App Store screenshots or background/session-continuity evidence.

## Scoped correction and verification

Add only the missing messaging category; preserve other categories and role-specific financial distinctions. Replace broad privacy regexes with per-dictionary semantic checks and negative fixtures. Reconcile compiled manifests against reviewed source for both SDKs. Update both submission packets, Connect worksheets and privacy-report ordering in the Mac runbooks. Run fresh unsigned Parent and Teacher jobs after the reviewed changes.

Verification results and exact reviewed commit will be added after execution. No Apple account, signing, provider, upload, submission or production-data action is authorized by this documentation change.

## Local verification

- The strengthened check first failed on the original manifest, identifying the missing Emails or Text Messages type. After adding only that category, all **30 focused native/privacy tests** pass, including both roles, duplicate/missing categories, per-dictionary boolean/purpose validation, ambiguous/malformed XML, unexpected tracking/reasons, and compiled/source mismatches.
- The shared checker reuses the XML/plist libraries already installed for the direct Capacitor CLI dependency; no dependency or lockfile change. Static and compiled checks validate the reviewed 17 Parent / 14 Teacher categories, preserving the three Parent-only financial categories.
- Both role-specific Capacitor sync commands passed with no tracked native drift except the intended manifest entries. Static store checks, role assets, HTTPS launch paths and generated shells pass. No entitlements, bundle IDs, permissions, Team, version/build or signing changes.
- Independent review caught Vercel's excluded Parent native directory. Narrow exceptions now include only the Parent privacy manifest for build-time tests; private environment files and the Parent Xcode project remain excluded. Both manifests are exercised without skipping the negative cases. The ignore rules were evaluated, not merely searched.
- Initial full production gate passed **2,046 tests**, Prisma/lint/types and optimized Next.js build. One existing unrelated test-fixture unused-variable warning remains; no rules were weakened. Log: `output/wave8-vercel-build.log`. A final gate incorporating the separately merged Parent home-fit release is required before this PR releases.
- Fresh unsigned macOS compilation/public-launch evidence for the correction is pending. No signed/archive/device/TestFlight/App Review readiness is implied.
- Final integrated gate passed after incorporating PR #360: **2,051 tests**, Prisma generation, lint, typecheck and optimized Next.js build. Log: `output/wave8-vercel-build-final.log`. Independent final review found no remaining local blocker. Protected checks, both fresh macOS jobs and exact release verification remain required.
# Final release evidence (September 12, 2026)

- PR #361 merged at 16:30:47 UTC; production commit `04a0526d96daddb87c1d91daae7a4304e35cb474`.
- Production `dpl_CqPJK6sRXuooarTPCzRJQ9jaxucS` is Ready at `the-bee-suite-p04pia5ix-brunerdigital.vercel.app`, with all five canonical aliases. Build finished 16:33:15 UTC with no build errors. Health at 16:36:06 UTC: healthy/database connected. Post-release error/fatal and 5xx log queries returned no entries.
- Guarded synthetic Parent/Teacher production run completed 16:36:06 UTC: 20 navigation cases, 2 read-only teacher profile cases, 2 report-control cases, 4 document checks, 8 parent layouts, 4 home checks, 52 fit cases, 6 teacher shortcut cases, and unsent-message history cancellation passed. Two login and 40 session-heartbeat requests; zero product writes, blocked requests, HTTP failures, or page errors. Fresh fake-graph proof at 16:34:12 UTC. Evidence: `output/playwright/app-review-production-after-pr361/results.json` (ignored local fake-data artifact).
- Native CI run `34704773920`: Parent and Teacher each 7/7 checks; device and simulator Release builds passed. Exact compiled PR merge source `35390b12c7585451fd0034fdf946e044856d7847` has parents `e414dc3d59385ea9dccec6da82d1eacd8f1ede61` and candidate `4e1b74748c89b91252c4e255dce30202a8e60e82`. Xcode 26.6 (17F113), both SDKs 26.5, iPhone 17/iOS 26.5 simulator. Source-equal privacy inventories: Parent 17 categories, Teacher 14, private messaging declared and tracking false in both device/simulator products.
- Both public cold and terminated-relaunch captures passed. Root visually checked Parent cold and Teacher relaunch; independent review checked all four captures. These are public-login launch evidence, not authenticated native-session or Store screenshot evidence.
- Not performed: signing, signed archives, TestFlight upload, authenticated native flows, physical-device testing, or App Store submission. Final owner/legal privacy answers and exact publishing approvals remain separate gates.
