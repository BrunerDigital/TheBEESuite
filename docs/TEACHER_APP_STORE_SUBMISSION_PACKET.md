# App Store Submission Packet - BEE Suite Teacher Portal

Last updated: September 8, 2026

This packet is for the iOS App Store submission whose purpose is to make the classroom teacher portal easier for staff to access on mobile devices.

## Submission Status

Current repository status:

- The teacher App Store entry and login surface is `https://thebeesuite.io/teachers`.
- After teacher sign-in, the app routes to `https://thebeesuite.io/teacher-portal`.
- A dedicated Capacitor iOS project exists at `ios-teacher/App/App.xcodeproj`.
- The parent iOS app remains in `ios/App/App.xcodeproj`; do not reuse its bundle ID for this submission.
- There is still no uploadable `.ipa` in this repository because the final archive must be built and signed from Xcode on macOS.
- The committed teacher icon and launch assets are visually distinct from Parent, reproducible with `npm run mobile:assets:generate`, and checked for no-alpha App Store requirements.
- The native configuration is HTTPS-only, disables WebView inspection/link previews, contains no broad navigation allowlist, and intentionally omits push, Associated Domains, Face ID, microphone, location, contacts, tracking, financial privacy categories, and iPad support.
- Windows Capacitor sync completed on September 8, 2026; the shared `App` scheme is archive-enabled. Final Xcode/device/archive evidence still requires macOS.
- A read-only production query on September 8 confirmed that the planned Teacher review identity does not yet exist as an application user, active grant, Auth identity, or fake-review Staff marker. Its preparation remains a separately authorized identity/access action.

Do not submit until these blockers are resolved:

- Native iOS wrapper is opened in Xcode 26 or later on macOS, assigned to the correct Apple Developer team, tested on a physical iPhone, and archived successfully using the iOS 26 SDK or later.
- Apple Developer Program account and Team ID are confirmed.
- Public privacy policy URL and support URL are live and counsel/owner-approved.
- App Review demo credentials are created, copied into App Store Connect, and rotated after review.
- Production backend is live during review.

## Recommended App Identity

| Field | Value |
| --- | --- |
| App Store name | `BEE Suite Teacher Portal` |
| Device display name | `BEE Teacher` |
| Bundle ID | `com.brunerdigital.thebeesuite.teacher` |
| SKU | `BEE-SUITE-TEACHER-IOS` |
| Initial version | `1.0` |
| Initial build number | `1` |
| Primary language | English (U.S.) |
| Primary category | Education |
| Secondary category | Productivity |
| Price | Free |
| First availability | United States only |
| Copyright | `2026 BrunerDigital` |
| Made for Kids | No |
| Target devices for first release | iPhone only |
| Minimum deployment target | iOS 16.0 or newer |

## Native iOS Target Requirements

Current implementation: a Capacitor iOS shell that launches the production teacher portal route.

Suggested launch URL:

```text
https://thebeesuite.io/teachers
```

Native project paths:

```text
capacitor.config.ts
native/teacher-shell/index.html
native/teacher-shell/offline.html
ios-teacher/App/App.xcodeproj
ios-teacher/App/App/Info.plist
```

Current `Info.plist` purpose strings:

```text
NSCameraUsageDescription = Teachers can take classroom photos for parent-approved media updates and school records.
NSPhotoLibraryUsageDescription = Teachers can choose photos and files for classroom updates, daily reports, and school documentation.
```

Do not request Face ID, location, microphone, contacts, calendar, Bluetooth, tracking, or push permissions for v1 unless the native app actually uses them and the workflow has passed device testing.

## App Store Metadata

### Subtitle

```text
Classroom tools for teachers
```

### Promotional Text

```text
Teachers can manage classroom attendance, daily reports, media updates, incidents, and child context from one secure mobile workspace.
```

### Description

```text
BEE Suite Teacher Portal gives childcare teachers a secure classroom workspace for day-to-day school operations.

Teachers can review assigned classroom rosters, record attendance, prepare parent-ready daily reports, upload classroom media, document incidents, and review child context needed for safe classroom care.

Features may vary by school based on the workflows enabled by your childcare provider.

Key features:
- Access assigned classroom rosters
- Review child context and classroom status
- Record attendance workflows
- Prepare daily reports for parent review
- Upload approved classroom photos and media
- Document incidents for school follow-up
- Review staff profile and kiosk readiness
- Continue with safe offline guidance when connectivity is unavailable

Teacher access is invitation-based. You will only see records linked to the school, classroom, and staff profile your administrator has assigned.
```

### Keywords

```text
childcare,teacher portal,classroom,attendance,daily reports,preschool,daycare,incidents
```

### What's New

```text
Initial iOS release for teacher access to The BEE Suite classroom portal.
```

### Support URL

```text
https://thebeesuite.io/support
```

### Marketing URL

```text
https://thebeesuite.io/
```

### Privacy Policy URL

```text
https://thebeesuite.io/privacy
```

## App Review Information

Create the dedicated fake-data review identity below only after exact authorization. It does not currently exist in production.

```text
Demo account email: app-review-teacher@thebeesuite.io
Demo account password: <temporary review password; do not commit to the repository>
Demo school: Kid City USA - Demo
Demo classroom: fake classroom records only
```

Suggested App Review notes:

```text
BEE Suite Teacher Portal is an invitation-based app for childcare teachers whose school uses The BEE Suite. The demo account is linked to fake classroom, child, and staff records only.

After signing in, open the teacher portal to review assigned classroom roster details, attendance workflows, daily report preparation, media upload, incident documentation, and teacher profile readiness.

The app does not sell digital content, subscriptions, or app features to teachers. Any school billing or parent payment workflows are outside this teacher app.

If any production school feature is unavailable in the demo account, use the sample records already attached to the demo classroom.
```

## Privacy Nutrition Label Draft

Final answers must be reconciled with production vendors and SDKs.

Likely data collected and linked to the user:

- Contact Info: teacher name, email address, phone number, staff profile details.
- User Content: daily report notes, incident notes, uploaded classroom media, support requests.
- Identifiers: internal user ID, staff ID, classroom ID, school ID, session/device identifiers.
- Usage Data: product interaction and page/app usage if analytics are enabled.
- Diagnostics: crash/performance/log data if added to the native build or collected by hosting/logging tools.
- Sensitive Info: child allergies, medical notes, custody/safety context, incidents, attendance, and classroom care records visible to assigned teachers.

Likely data not collected for v1:

- Precise device location.
- Contacts/address book.
- Microphone/audio.
- Advertising ID for tracking.
- Teacher payments or purchase history.

Tracking recommendation:

```text
No tracking, unless a vendor is added that tracks users across apps or websites owned by other companies for advertising or brokered measurement.
```

## Screenshot Plan

Use final TestFlight/native build and fake data only.

| Shot | Screen | Caption draft |
| --- | --- | --- |
| 1 | Teacher classroom workspace | `Classroom context, roster, and daily tasks in one secure portal.` |
| 2 | Roster | `Review assigned children and classroom status.` |
| 3 | Attendance | `Record classroom attendance workflows.` |
| 4 | Daily report | `Prepare parent-ready daily reports with teacher notes.` |
| 5 | Media | `Upload approved classroom photos and updates.` |
| 6 | Incident | `Document incidents for school follow-up.` |
| 7 | Profile/readiness | `Confirm staff profile and classroom setup details.` |

Accepted iPhone screenshot strategy:

- Preferred 6.9-inch portrait dimensions: 1260 x 2736, 1290 x 2796, or 1320 x 2868 pixels.
- Accepted 6.5-inch fallback dimensions: 1284 x 2778 or 1242 x 2688 pixels. Apple uses this set only when a 6.9-inch set is not supplied.
- Upload one to ten PNG or JPEG screenshots without alpha, all captured from the final native build with fake data.
- Do not enable iPad for v1 unless iPad screenshots are prepared.

Exact-size synthetic drafts are under `output/app-store/ios-teacher/screenshots-draft/` with provenance in `output/app-store/screenshot-drafts-manifest.json`. They are 1290 x 2796 RGB/no-alpha planning assets generated from `/device-preview`; they are not native App Store evidence. Replace them with matching screenshots from the signed Release/TestFlight build before submission.

## Age Rating And Audience

- Do not select Made for Kids. The app is an invitation-only workplace tool for adult childcare staff, not an app marketed to children.
- Complete Apple’s current age-rating questionnaire in App Store Connect; do not hardcode an expected rating before Apple calculates it.
- Answer user-generated-content and messaging questions truthfully. Teacher and family messages are private, authenticated, school-scoped, screened before posting, reportable in-product, and subject to administrator access removal.
- Declare sensitive childcare, incident, allergy, medical, custody, and safety context where the questionnaire or privacy inventory asks about it.
- If the final EULA sets a higher minimum age than Apple calculates, use Apple’s higher-rating override.

## Account Deletion And Sign-In

- Parent accounts can initiate deletion from in-app settings. The teacher app does not provide self-service account creation; a school administrator provisions and removes staff access.
- App Review notes should state that teacher access removal is controlled by the employing school and that support is publicly available. Counsel/owner must confirm whether any teacher-specific deletion path is legally required beyond staff access removal and privacy requests.
- Sign in with Apple is not applicable to v1 because the app uses school-issued email/password authentication and offers no third-party or social login. Reassess if any social login is added.

## Payments And In-App Purchase

- The teacher app sells no digital content, subscriptions, features, or services and exposes no teacher checkout flow.
- Mark in-app purchases as not used for this target. Do not add parent tuition language to the teacher listing.
- If any digital teacher feature is sold later, obtain a new App Review/IAP analysis before shipping it.

## Guideline 4.2 And App Completeness

Highest review risk is Guideline 4.2. The committed production `server.url` is necessary for the current server-rendered architecture, so this remains a remote Capacitor/WKWebView product rather than a bundled offline client.

Mitigations already present are role-specific launch/offline UI, native-safe PWA/push suppression, camera/photo purpose strings tied to working classroom workflows, iPhone safe-area and touch behavior, authenticated roster/attendance/daily-report/media/incident value, and a dedicated Teacher identity and visual treatment. Static repository checks do not prove acceptance. Confirm every core flow from TestFlight on a physical iPhone, keep production available throughout review, and describe the operational classroom value accurately. Do not add unused entitlements or superficial native features.

## Export Compliance

- The target uses HTTPS/TLS and standard Apple/platform encryption; no custom cryptographic product was found.
- `ITSAppUsesNonExemptEncryption` is `false` in the committed plist.
- Answer App Store Connect from the final archive and final SDK inventory. The Account Holder must confirm the exemption answer and any required U.S. export documentation.

## Build, Archive, And TestFlight Gate

Repository preparation:

```text
npm ci
npm run db:generate
npm run lint
npm run typecheck
npm test
npm run mobile:assets:generate
npm run ios:teacher:sync
npm run mobile:store:check
```

Mac/Apple evidence still required:

1. Use Node.js 22 or later, Xcode 26 or later, and the iOS 26 SDK or later.
2. Select the Apple Team for `com.brunerdigital.thebeesuite.teacher` without sharing credentials or signing material.
3. Confirm a build number unused for version 1.0, resolve packages, and build the shared `App` scheme in Release.
4. Run the simulator and physical-device matrix in `docs/MOBILE_APP_PHYSICAL_DEVICE_EVIDENCE_PACKET.md`.
5. Archive and run Validate App; record the archive UUID and validation output.
6. Generate the privacy report and reconcile it against the privacy manifest and App Privacy answers.
7. Upload only after exact publishing approval. Wait for processing, resolve every warning, and install the processed TestFlight build on a physical iPhone.
8. Capture accepted-size native screenshots, verify the fake review account, and attach the exact build to the version.
9. App Review submission remains a separate explicit publishing action.

## Reviewer Account Preparation

The repository includes an idempotent teacher preparation script but it is not run automatically because it creates the production Auth identity/password, Prisma application user with the Teacher role, classroom-bound Staff profile, and school access grant.

First run the read-only candidate listing with all Teacher target variables unset:

```text
npm run app-review:teacher:ensure -- --preflight
```

Select only a proven fake-demo target. Set `APP_REVIEW_TEACHER_TENANT_ID`, `APP_REVIEW_TEACHER_CENTER_ID`, `APP_REVIEW_TEACHER_CLASSROOM_ID`, and `APP_REVIEW_TEACHER_SOURCE_STAFF_ID` outside Git/chat, then run the same `--preflight` command again. Record its exact target and fresh `targetFingerprint`; do not authorize or run a mutation from the unfiltered candidate list alone.

The fingerprint also binds the exact review email. Obtain exact authorization covering that email, every listed production change, and the preflighted target. Only then set `APP_REVIEW_TEACHER_TARGET_FINGERPRINT` and `APP_REVIEW_TEACHER_PASSWORD` outside Git/chat and run `npm run app-review:teacher:ensure -- --confirm-teacher-app-review-account`.

Verify the login, Teacher role, demo tenant, demo school, assigned fake classroom, and absence of real child/staff data before copying credentials to App Store Connect. Rotate or disable the account after review.

## Current Official Apple Sources

- App Review Guidelines: https://developer.apple.com/app-store/review/guidelines/
- Screenshot specifications: https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications
- App privacy: https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy/
- Age ratings: https://developer.apple.com/help/app-store-connect/manage-app-information/set-an-app-age-rating/
- Account deletion: https://developer.apple.com/support/offering-account-deletion-in-your-app/
- Upload requirements: https://developer.apple.com/news/upcoming-requirements/
- Upload builds: https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds/
- TestFlight: https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview
