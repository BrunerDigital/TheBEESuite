# Mobile App Physical-Device Evidence Packet

Use one copy per release candidate and platform. Use fake review data only. Attach screenshots/log exports separately; do not place passwords, signing keys, provisioning profiles, service-account files, device tokens, or private child/family data in this packet.

## Release identity

| Field | Evidence |
| --- | --- |
| Platform | Apple TestFlight / Google Play internal test |
| App | BEE Suite Parent Portal |
| Bundle/application ID | |
| Marketing version | |
| Build/version code | |
| Git commit | |
| Distribution track and build URL/ID | |
| Tester and test date/time/time zone | |
| Physical device model and OS | |
| Network scenarios | Wi-Fi / cellular / offline / reconnect |
| Fake review account email | Never record the password |

## Build and privacy evidence

- [ ] `npm run mobile:store:check` passed.
- [ ] Clean dependency install and native sync completed from the recorded commit.
- [ ] Store-distributed build installed; this is not a debug install.
- [ ] App ID, version, build, display name, icon, launch screen, and supported devices match the release record.
- [ ] Apple: archive validation passed and Xcode privacy report attached.
- [ ] Android: signed AAB accepted by Play Console and App bundle explorer details attached.
- [ ] Final Apple App Privacy / Google Data safety answers match the exact binary and production vendors.
- [ ] No unapproved permission prompt, push entitlement, deep-link claim, or tracking behavior appeared.

## Exact first physical-device smoke sequence

Record `PASS`, `FAIL`, or `BLOCKED`, evidence link, defect ID, and retest for every row. Stop immediately for wrong-family/child data, wrong-role access, unsafe payment behavior, a crash loop, or sensitive data in logs/notifications.

| # | Action and expected result | Result/evidence |
| --- | --- | --- |
| 1 | Install from TestFlight or Google Play internal testing. Confirm publisher, name, icon, version, and clean first launch. | |
| 2 | Launch online. Parent-only login appears; no other-role entry point or unexpected permission prompt appears. | |
| 3 | Open Privacy and Support before login. Both load, support contact works, and no authentication loop occurs. | |
| 4 | Attempt one invalid login. A safe, recoverable error appears without account enumeration or instability. | |
| 5 | Sign in with the fake linked-parent account. `/parent-portal` shows only the intended fake family and children. | |
| 6 | Background for 30 seconds, resume, and navigate back/forward. Session/navigation remain safe and arbitrary hosts cannot open inside the app. | |
| 7 | Review dashboard, child summary, daily report/media, messages, documents, incident acknowledgement, notification preferences, billing/invoice history, and support. | |
| 8 | Upload one fake image and allowed fake document. Camera/photo prompts appear only when invoked; denial is recoverable; unsupported files fail safely. | |
| 9 | Open a non-destructive Stripe handoff only if the fake account supports it. Cancel and return safely; verify no charge was created. | |
| 10 | Disable network and relaunch. The local connection-required state appears without leaking cached sensitive content. Restore network and recover. | |
| 11 | Exercise password-reset/invitation links in the approved v1 mode. While deep links are deferred, HTTPS browser fallback reaches the correct parent path. | |
| 12 | Change in-app notification preferences and create/read a fake in-app alert. No native push prompt or APNs/FCM delivery claim appears while deferred. | |
| 13 | Open the deletion-request flow. Confirm retention warning and recovery; do not approve deletion or mutate production data for this test. | |
| 14 | Sign out. Back navigation, relaunch, and protected URLs do not reveal authenticated content. | |
| 15 | Reinstall/update from the distribution track and repeat launch/login/logout. Record crash, performance, console, and store diagnostics evidence. | |

## Platform-specific checks

### Apple

- [ ] iPhone-only behavior matches App Store Connect.
- [ ] Camera and photo-library prompts exactly match `Info.plist`.
- [ ] No Face ID, location, microphone, tracking, push, or Associated Domains capability/prompt appears in deferred v1.
- [ ] TestFlight feedback, crash, and energy/memory evidence reviewed.

### Google

- [ ] Play Protect/install status and application ID match the internal release.
- [ ] Back gesture/button, activity recreation, file chooser, browser return, and process death/relaunch are safe.
- [ ] Runtime permissions match the merged Android manifest and Data safety answers.
- [ ] If App Links/FCM are deferred, no verified-link or notification permission claim/prompt appears.

## Signoff

| Decision | Name | Date | Notes/exceptions |
| --- | --- | --- | --- |
| Device QA | | | |
| Privacy/security reconciliation | | | |
| Release owner | | | |
| Final result: GO / NO-GO | | | |

