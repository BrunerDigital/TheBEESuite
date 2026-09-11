# iOS native verification and final handoff

Status established September 11, 2026. Parent and Teacher are the only intended v1 native apps. This record separates unsigned compilation from signed/device/store readiness.

## Current-state evidence before this change

- Production commit `d7ec168cc7d35e8bfff043b81cabac6762f2f059` was Ready on canonical aliases; the preceding mobile UI release passed 1,912 tests, 364 browser checks and 31 authenticated fake-account cases. This is historical baseline evidence, not evidence of a later deployment.
- Both native projects, Release schemes, role-specific assets, privacy manifests and HTTPS shells were present. Static readiness passed previously. No Xcode compilation or simulator launch had been recorded.
- This Windows host has no Xcode and no connected Mac project/SSH target. The repository permits GitHub Actions and GitHub provides a standard `macos-26` runner with Xcode. No new provider, signing identity or paid larger runner is being configured.
- The shared checkout is dirty and behind origin/main; implementation uses a new isolated branch from current main. Unrelated files, draft PR #311 and concurrent worktrees are preserved.

## Repeatable unsigned verification

In GitHub, open **Actions > iOS native verification > Run workflow** and select the exact reviewed branch or main. Native-source and dependency PRs also run this automatically. The two jobs run independently, without repository secrets, Apple credentials or stored checkout credentials.

On a Mac, use a clean checkout of the approved commit:

```bash
npm ci
node scripts/verify-ios-native.mjs parent
node scripts/verify-ios-native.mjs teacher
```

Each run detects and records Xcode/iOS SDK versions, syncs the correct Capacitor app, verifies native source did not drift, builds Release for `iphoneos` and `iphonesimulator` with signing disabled, and checks the actual compiled bundle ID, iPhone-only setting, minimum iOS, privacy manifest, HTTPS configuration and offline resources. It creates its own simulator, installs the compiled Release app, checks cold launch/relaunch survival, saves public unauthenticated screenshots and deletes only that isolated simulator.

First-run evidence with Xcode 26.6/iOS 26.5 proved all four unsigned compilations and compiled-resource checks. The new teacher simulator exceeded the initial five-minute boot budget while Apple's CoreLocation data migration was still running; the parent completed boot in 4m47s before the superseding run cancelled it. The verifier now starts isolated boot before compilation and permits a bounded 12-minute boot-status wait. It still requires actual install, launch survival and screenshot capture; a timeout remains a failure, never a skipped/passed app test.

GitHub retains `report.json`, build/sync logs and public launch screenshots for 14 days. Download artifacts from the exact successful run and visually inspect both screenshots per app. Do not upload reviewer credentials, auth state, real-family screenshots, entire app containers, private keys or full workspaces as artifacts. A passing process-survival check is not proof that authentication or every UI workflow worked.

Launch verification checks the exact PID returned by `simctl launch` using non-mutating signal 0, then uses Apple's Vision text recognition to require the matching public sign-in heading in the native screenshot. Failure screenshots are saved before liveness checks. The verifier has one shared 45-minute deadline; the 60-minute Actions job reserves time for setup, isolated-simulator cleanup and artifact upload rather than adding independent command timeouts indefinitely.

Record the Git SHA, workflow run URL, Xcode/SDK/runtime, compile results and screenshot review in the protected PR closeout. Until that evidence exists, compilation and simulator launch remain **unverified**. CI never archives, signs, uploads, invites testers or submits either app.

## Remaining human-only critical path

1. **Brenden — Mac/Xcode access.** On the Mac install/open Xcode 26 or later with the iOS 26 SDK or later and Node 24. Clone this repository through GitHub and check out the approved native-validation commit. Open the Mac checkout in Codex to let it execute the remaining Mac work, or provide only a preconfigured SSH host alias/username/address after enabling Remote Login. Do not send passwords, verification codes, private keys or certificates. Evidence: `xcodebuild -version`, `xcrun --sdk iphoneos --show-sdk-version` and the checked-out Git SHA. Codex can resume immediately with access.
2. **Brenden/Apple Account Holder — local signing.** Open `ios/App/App.xcodeproj`, then `ios-teacher/App/App.xcodeproj`. For each **App target > Signing & Capabilities**, select the existing team that owns the exact bundle ID below; confirm version/build and iPhone-only support. Do not create/change certificates, provider identity or agreements through this workflow. Evidence: Xcode resolves the correct signing team/profile for both targets without errors. Codex can resume immediately after local signing is resolved.
3. **Brenden with a physical iPhone — device validation.** Run the approved fake-data workflows in `MOBILE_APP_PHYSICAL_DEVICE_EVIDENCE_PACKET.md`: login/logout, session return, keyboard/safe areas, camera/photo/file selection, interrupted upload, offline/reconnect and external handoffs. Use a non-charging test path; never send real messages or change real records. Record device/iOS/build and evidence. Codex can address reproducible failures immediately; physical behavior cannot be certified by CI screenshots.
4. **Brenden/Account Holder, with counsel where needed — final disclosures and archive.** Reconcile the exact Release archive privacy report with each app's submission packet; confirm current age-rating, account-deletion, content-moderation, export-compliance, support and privacy answers. Enter temporary review credentials directly into App Store Connect's private review-information fields, never into Git/chat. Archive both approved targets and run Validate App. Evidence: valid signed archives, matching privacy/disclosure inventory and validation results. Codex can resume metadata and evidence preparation once the selections are confirmed.
5. **Brenden — exact publishing approval, then device evidence.** Separately authorize upload of the exact parent/teacher version/build/archive to App Store Connect. After processing, install the approved build through TestFlight, finish release-device checks and capture final fake-data native screenshots. Then separately authorize App Review submission for each app; release approval is also separate. Evidence: processed build IDs, TestFlight/device record and final screenshots; submission/release receipts only after each authorized action. Codex can resume immediately after each gate.

| App | Native project | Bundle ID | Launch path |
| --- | --- | --- | --- |
| Parent | `ios/App/App.xcodeproj` | `com.brunerdigital.thebeesuite.parent` | `/parents` |
| Teacher | `ios-teacher/App/App.xcodeproj` | `com.brunerdigital.thebeesuite.teacher` | `/teachers` |

Unsigned CI success means **native compilation and public simulator launch verified** only. It does not mean signing ready, archive ready, TestFlight verified, final screenshots ready, physical-device tested or App Store ready. The existing Parent/Teacher runbooks and submission packets remain authoritative for per-app details.

## Verified external guidance

- Apple requires Xcode 26 or later with iOS 26 SDK or later for uploads since April 28, 2026: https://developer.apple.com/news/upcoming-requirements/?id=04282026a
- GitHub runner availability and image inventory: https://github.com/actions/runner-images and https://github.com/actions/runner-images/blob/main/images/macos/macos-26-arm64-Readme.md
