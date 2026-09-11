# Parent iOS Build Runbook

Last updated: September 11, 2026

This runbook covers the native iOS shell for the first App Store submission: BEE Suite Parent Portal.

For repeatable unsigned GitHub/macOS builds and the single remaining human-action checklist, see [iOS native verification and final handoff](IOS_NATIVE_VERIFICATION_AND_HANDOFF.md). Unsigned simulator evidence does not replace the signing, archive, physical-device or TestFlight steps below.

## Native Project

| Field | Value |
| --- | --- |
| Xcode project | `ios/App/App.xcodeproj` |
| Capacitor config | `capacitor.config.ts` |
| Bundle ID | `com.brunerdigital.thebeesuite.parent` |
| App Store name | `BEE Suite Parent Portal` |
| Device display name | `BEE Suite` |
| Version | `1.0` |
| Build | `1` |
| Minimum iOS | `16.0` |
| Target devices | iPhone only |
| Launch URL | `https://thebeesuite.io/parents` |

## Prerequisites

- macOS with Xcode 26 or later and the iOS 26 SDK or later. Apple has required this upload toolchain since April 28, 2026.
- Apple Developer Program access for the BrunerDigital team or the final legal developer account.
- The Apple Team ID that owns `com.brunerdigital.thebeesuite.parent`.
- Node.js 24.x and npm installed on the Mac.
- Production routes live:
  - `https://thebeesuite.io/parents`
  - `https://thebeesuite.io/parent-portal`
  - `https://thebeesuite.io/support`
  - `https://thebeesuite.io/privacy`

## Build Steps On Mac

```bash
npm ci
npm run mobile:assets:generate
npm run mobile:store:check
npm run ios:parent:sync
npm run ios:parent:open
```

In Xcode:

1. Select the `App` target.
2. Set Signing & Capabilities Team to the Apple Developer team.
3. Confirm Bundle Identifier is `com.brunerdigital.thebeesuite.parent`.
4. Confirm Version is `1.0` and Build is `1`.
5. Confirm iPhone-only support.
6. Select a real iPhone or iOS simulator and run the app.
7. Smoke test parent login, parent dashboard, messages, documents, billing, and password reset.
8. Set the run destination to `Any iOS Device (arm64)` and select Release configuration.
9. Use **Product > Archive**.
10. In Organizer, select the archive and run **Validate App**. Resolve every signing, entitlement, icon, privacy, or bundle error.
11. Stop for exact upload approval. Only after approval, use **Distribute App > App Store Connect > Upload** and keep symbol upload enabled unless the release owner documents otherwise.
12. Record the archive UUID, version, build, Git commit, signing team, upload time, and processing result.

## Privacy Report And TestFlight

1. In Xcode Organizer, select the exact uploaded archive and generate/export its privacy report using the privacy-report action available in the installed Xcode version.
2. Inventory the app target and every embedded Capacitor/native SDK. Reconcile accessed API reasons and collected-data categories against `PrivacyInfo.xcprivacy`, production vendors, the public Privacy Policy, and App Store Connect App Privacy answers.
3. Stop if the report contains an undeclared SDK, tracking domain, accessed API, permission, or data category. Fix the binary/manifest or disclosures and upload a new build number.
4. Wait for App Store Connect processing and export-compliance questions to finish. Do not select the build for review yet.
5. Add only approved internal TestFlight testers and install from TestFlight on a physical supported iPhone; an Xcode debug install is not release evidence.
6. Complete `docs/MOBILE_APP_PHYSICAL_DEVICE_EVIDENCE_PACKET.md`, attach TestFlight/crash evidence, and close every blocker before external testing or App Review.

## App Review Smoke Test

Use fake data only.

```text
Demo account email: app-review-parent@thebeesuite.io
Demo account password: <temporary review password; do not commit>
Demo school: Kid City USA - Demo
```

If the password is lost or needs to be rotated, run the read-only candidate listing first:

```bash
npm run app-review:parent:ensure -- --preflight
```

The authorized September 9, 2026 run provisioned and production-login verified Murphy Family as the exact review target. For any future password rotation, repair, or reassignment, select the exact fake-demo target, set `APP_REVIEW_PARENT_TENANT_ID`, `APP_REVIEW_PARENT_CENTER_ID`, `APP_REVIEW_PARENT_FAMILY_ID`, and `APP_REVIEW_PARENT_FAMILY_EXTERNAL_ID`, and repeat `--preflight` to obtain the current fingerprint bound to the exact review email, synthetic center, and complete reviewer-visible family graph. After exact authorization for that email and the identity, Guardian/family assignment, access grant, password change, stale-session revocation, and stale-push-subscription deactivation, set the fingerprint as `APP_REVIEW_PARENT_TARGET_FINGERPRINT`, set `APP_REVIEW_PARENT_PASSWORD` outside Git/chat, and run `npm run app-review:parent:ensure -- --confirm-parent-app-review-account`. The command stages local access inactive and activates it only after Auth and exact-scope revalidation succeed; rerun the fresh preflight after any failure. The reserved account displays no data if its markers, sole family link, sole grant, center, or reachable fake-data graph later drift. During review, uploads stay in dedicated demo storage, messages remain portal-only, and real email/SMS/push, payments, password, profile-photo, parent-setup, pickup-PIN, and tuition-cycle changes are disabled.

Minimum reviewer-visible flows:

- Parent login from the app launch screen.
- Parent dashboard loads after sign-in.
- Child summary or daily report visible.
- Messages visible.
- Documents visible.
- Billing/invoice view visible.
- Password reset path returns to the parent app login.
- Support and privacy pages are public.

## Notes

- The iOS project is a Capacitor shell pointed at the production parent route. To reduce App Review Guideline 4.2 risk, keep the native launch/offline states, iPhone-only configuration, camera/photo purpose strings, and clear review notes in the submission packet.
- The Capacitor wrapper normalizes generated Swift package paths after sync so Windows and macOS produce a portable local `@capacitor/app` dependency path.
- Do not enable Push Notifications in Xcode until APNs server support is implemented and tested.
- Do not enable Associated Domains or publish an AASA file until the Apple Team ID and exact path allowlist are approved. HTTPS browser fallback remains the supported v1 behavior.
- Do not enable iPad support for the first release unless iPad screenshots and tablet QA are ready.
