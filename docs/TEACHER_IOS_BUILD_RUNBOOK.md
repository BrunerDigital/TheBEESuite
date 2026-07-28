# Teacher iOS Build Runbook

Last updated: July 28, 2026

This runbook covers the native iOS shell for the teacher-facing App Store submission: BEE Suite Teacher Portal.

## Native Project

| Field | Value |
| --- | --- |
| Xcode project | `ios-teacher/App/App.xcodeproj` |
| Capacitor role command | `node scripts/run-capacitor-app.mjs teacher ...` |
| Bundle ID | `com.brunerdigital.thebeesuite.teacher` |
| App Store name | `BEE Suite Teacher Portal` |
| Device display name | `BEE Teacher` |
| Version | `1.0` |
| Build | `1` |
| Minimum iOS | `16.0` |
| Target devices | iPhone only |
| Launch URL | `https://thebeesuite.io/teachers` |

## Prerequisites

- macOS with a current supported Xcode installation.
- Apple Developer Program access for the BrunerDigital team or the final legal developer account.
- The Apple Team ID that owns `com.brunerdigital.thebeesuite.teacher`.
- Node.js and npm installed on the Mac.
- Production routes live:
  - `https://thebeesuite.io/teachers`
  - `https://thebeesuite.io/teacher-portal`
  - `https://thebeesuite.io/support`
  - `https://thebeesuite.io/privacy`

## Build Steps On Mac

```bash
npm ci
npm run mobile:store:check
npm run ios:teacher:sync
npm run ios:teacher:open
```

In Xcode:

1. Select the `App` target in `ios-teacher/App/App.xcodeproj`.
2. Set Signing & Capabilities Team to the Apple Developer team.
3. Confirm Bundle Identifier is `com.brunerdigital.thebeesuite.teacher`.
4. Confirm Version is `1.0` and Build is `1`.
5. Confirm iPhone-only support.
6. Select a real iPhone or iOS simulator and run the app.
7. Smoke test teacher login, roster, attendance, daily reports, media upload, incident documentation, and sign out.
8. Set the run destination to `Any iOS Device (arm64)` and select Release configuration.
9. Use **Product > Archive**.
10. In Organizer, select the archive and run **Validate App**. Resolve every signing, entitlement, icon, privacy, or bundle error.
11. Use **Distribute App > App Store Connect > Upload**. Keep symbol upload enabled unless the release owner documents otherwise.
12. Record the archive UUID, version, build, Git commit, signing team, upload time, and processing result.

## Privacy Report And TestFlight

1. Generate/export the Xcode privacy report from the exact uploaded archive.
2. Reconcile the report with `ios-teacher/App/App/PrivacyInfo.xcprivacy`, production vendors, public Privacy Policy, and App Store Connect App Privacy answers.
3. Stop if the report contains an undeclared SDK, tracking domain, accessed API, permission, or data category.
4. Wait for App Store Connect processing and export-compliance questions to finish. Do not select the build for review yet.
5. Install the processed build from TestFlight on a physical supported iPhone.
6. Complete `docs/MOBILE_APP_PHYSICAL_DEVICE_EVIDENCE_PACKET.md` for the teacher app before App Review.

## App Review Smoke Test

Use fake data only.

```text
Demo account email: app-review-teacher@thebeesuite.io
Demo account password: <temporary review password; do not commit>
Demo school: Kid City USA - Demo
Demo classroom: fake classroom records only
```

Minimum reviewer-visible flows:

- Teacher login from the app launch screen.
- Teacher classroom workspace loads after sign-in.
- Roster and ratio-safe classroom context visible.
- Attendance action can be reviewed with fake records.
- Daily report draft can be created for fake children.
- Classroom media upload opens camera/photo permission only when invoked.
- Incident documentation path is visible with fake records.
- Support and privacy pages are public.
- Sign out returns to protected login state.

## Notes

- The iOS project is a Capacitor shell pointed at the production teacher route.
- Do not enable Push Notifications until APNs server support is implemented and tested.
- Do not enable Associated Domains or publish an AASA file until the Apple Team ID and exact path allowlist are approved.
- Do not enable iPad support for the first release unless iPad screenshots and tablet QA are ready.
