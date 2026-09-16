# BEE Suite Parent and Teacher Completion Handoff

Date: September 16, 2026
Baseline: `origin/main` / `b5ce3a8693ee0d474778fa649e011bb74e981ef5`

This handoff records what was revalidated during the completion pass and the remaining actions that require Apple, physical-device, provider, legal, school, or business access.

## Revalidated technical baseline

- `npm test`: 2,483 passed, 0 failed.
- `npm run vercel-build`: passed, including Prisma generation, lint, typecheck, tests, and Next production build.
- `npm run mobile:store:check`: passed for parent and teacher iOS configuration.
- `npm run ios:parent:sync`: passed.
- `npm run ios:teacher:sync`: passed.
- Fresh unsigned macOS native verification on current `eac132a7b56f65b0c08ab9fa8603a4aa670b84c9`: parent and teacher jobs passed. Evidence: [GitHub Actions run 35136238134](https://github.com/BrunerDigital/TheBEESuite/actions/runs/35136238134).
- Clean current-baseline validation on `b5ce3a8693ee0d474778fa649e011bb74e981ef5`: `npm test` passed with 2,483 tests and `npm run vercel-build` passed through Prisma generation, lint, typecheck, tests, and Next production build.
- Public production routes `/parents`, `/teachers`, `/support`, `/privacy`, `/terms`, `/eula`, and `/mobile-apps`: HTTP 200.
- Parent portal live authentication and Holly Hill test-family flow: verified.
- Current production health: database connected.

## Still required before a full launch claim

### Parent and teacher web

- Complete credentialed teacher production smoke testing with a real assigned classroom.
- Complete two-school and two-family isolation evidence for parent, teacher, director, billing, executive, regional, and auditor roles.
- Reconcile each launch school’s families, children, guardians, pickups, classrooms, staff, schedules, documents, tuition, balances, and permissions.
- Complete provider and business gates for invitations, communications, billing, payments, payouts, backups, monitoring, and support ownership.

### Parent and teacher iOS

- Use a Mac with current Xcode and the Apple Developer team that owns both bundle IDs.
- Select the correct signing team and confirm unused version/build numbers.
- Archive and validate both apps in Release configuration.
- Review the exact binary privacy reports and App Store Connect privacy answers.
- Upload to TestFlight.
- Install each processed build on a physical supported iPhone.
- Test authenticated parent/teacher workflows, uploads, background/resume, offline/reconnect, logout, reinstall, and update behavior.
- Capture final fake-data screenshots and complete the physical-device evidence packet.
- Complete App Store metadata, reviewer information, support/privacy links, export compliance, and final App Review approval.

## External gate matrix

Use this matrix as the stop/go record. A gate is not complete from a source check alone; attach the named evidence before changing its status to **PASS**.

| Gate | Owner | Required evidence | Stop condition |
| --- | --- | --- | --- |
| Apple signing and archive | Apple release owner | Xcode Release archives for both bundle IDs, successful validation, version/build numbers, and signing-team evidence | Any signing, entitlement, archive, or validation error; do not upload |
| TestFlight and physical devices | Apple release owner + QA owner | Processed TestFlight builds installed on supported iPhones; parent and teacher evidence packet with login, logout, background/resume, upload, reconnect, reinstall, and update results | Any crash, wrong-role access, stale session, broken upload, or unrecovered offline state |
| Teacher production access | School director + QA owner | Assigned test teacher account, exact school/classroom, authenticated production screenshots or trace, and denied cross-classroom/cross-school checks | Missing safe credentials, ambiguous assignment, or any unauthorized record access |
| Parent/family access | School director + QA owner | Exact Holly Hill Bruner-family scope, authenticated parent trace, and denied unrelated-family/child/document/message checks | Shared or ambiguous family identity, or any unrelated-family visibility |
| Provider delivery | Operations owner | Redacted SendGrid/Twilio/payment/monitoring configuration evidence, approved non-family test results, delivery/failure/retry outcomes, and named responders | Provider identity, webhook, suppression, retry, or ownership evidence missing |
| Billing and payout activation | Finance owner + school approver | School-specific pricing, tax/receipt, connected-account, reconciliation, refund/dispute, and payout approval packet | Any unresolved ledger mismatch or missing separate activation approval |
| Legal and store content | Legal/business owner | Approved Terms, Privacy, EULA, account deletion, media/communications consent, App Store privacy answers, export compliance, support URL, and reviewer notes | Any unapproved disclosure, policy, or store metadata |
| School rollout | Director + business approver | School-specific readiness report, module-by-module GO/NO-GO, training/support owner, rollback window, and cutover approval | Do not activate invitations, kiosk/PIN, billing, payments, ProCare retirement, or mobile distribution without its own GO |

### Handoff return packet

Return these items to close the external gates: two processed TestFlight build links, physical-device evidence packet, teacher production smoke trace, two-school isolation trace, redacted provider delivery results, school-specific billing/reconciliation approval, legal/store approval packet, and signed rollout GO/NO-GO decisions. Do not send passwords, secret keys, bank details, or verification codes in chat.

## Intentionally deferred unless separately approved

- Android native applications.
- Native APNs/FCM push notifications.
- Universal Links and Android App Links.
- Custom-domain lifecycle.
- Support impersonation.
- Terminal equipment store and broad marketing publishing.

No production billing, payment, invitation, message, provider, store, or destructive cleanup action was performed as part of this handoff.
