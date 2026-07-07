# Parent iOS Build Runbook

Last updated: July 7, 2026

This runbook covers the native iOS shell for the first App Store submission: BEE Suite Parent Portal.

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

- macOS with Xcode installed.
- Apple Developer Program access for the BrunerDigital team or the final legal developer account.
- The Apple Team ID that owns `com.brunerdigital.thebeesuite.parent`.
- Node.js and npm installed on the Mac.
- Production routes live:
  - `https://thebeesuite.io/parents`
  - `https://thebeesuite.io/parent-portal`
  - `https://thebeesuite.io/support`
  - `https://thebeesuite.io/privacy`

## Build Steps On Mac

```bash
npm ci
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
8. Use Product > Archive.
9. Upload from Xcode Organizer or Transporter.

## App Review Smoke Test

Use fake data only.

```text
Demo account email: app-review-parent@thebeesuite.io
Demo account password: <temporary review password; do not commit>
Demo school: Kid City USA - Demo
```

If the password is lost or needs to be rotated, set `APP_REVIEW_PARENT_PASSWORD` and run:

```bash
npm run app-review:parent:ensure
```

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
- If `npm run ios:parent:sync` is run on Windows, verify `ios/App/CapApp-SPM/Package.swift` keeps forward slashes in the local `@capacitor/app` path before opening the project on macOS.
- Do not enable Push Notifications in Xcode until APNs server support is implemented and tested.
- Do not enable iPad support for the first release unless iPad screenshots and tablet QA are ready.
