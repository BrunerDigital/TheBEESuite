# App Store Submission Packet - BEE Suite Teacher Portal

Last updated: July 28, 2026

This packet is for the iOS App Store submission whose purpose is to make the classroom teacher portal easier for staff to access on mobile devices.

## Submission Status

Current repository status:

- The teacher App Store entry and login surface is `https://thebeesuite.io/teachers`.
- After teacher sign-in, the app routes to `https://thebeesuite.io/teacher-portal`.
- A dedicated Capacitor iOS project exists at `ios-teacher/App/App.xcodeproj`.
- The parent iOS app remains in `ios/App/App.xcodeproj`; do not reuse its bundle ID for this submission.
- There is still no uploadable `.ipa` in this repository because the final archive must be built and signed from Xcode on macOS.
- App icon and splash assets are present in the teacher iOS asset catalog and are checked for no-alpha App Store requirements.

Do not submit until these blockers are resolved:

- Native iOS wrapper is opened on macOS, assigned to the correct Apple Developer team, tested on iPhone, and archived successfully in Xcode.
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

Create a dedicated fake-data review account before submission.

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

- Preferred: 6.9 inch portrait screenshots.
- Fallback: 6.5 inch portrait screenshots.
- Do not enable iPad for v1 unless iPad screenshots are prepared.
