# App Store Connect Content Draft - BEE Suite Teacher Portal

Verified draft date: September 8, 2026
Status: Technically reconciled draft. Product/legal approval and App Store Connect entry remain human publishing gates.

## App Information

| Field | Draft value |
| --- | --- |
| App Store name | `BEE Suite Teacher Portal` |
| Device display name | `BEE Teacher` |
| Bundle ID | `com.brunerdigital.thebeesuite.teacher` |
| SKU | `BEE-SUITE-TEACHER-IOS` |
| Primary language | English (U.S.) |
| Primary category | Education |
| Secondary category | Productivity |
| Price | Free |
| Availability | United States |
| Made for Kids | No |
| Target devices | iPhone only for v1 |
| Minimum iOS | iOS 16.0 |
| Version | `1.0` |
| Initial build | `1` |
| Copyright | `2026 BrunerDigital` or exact Apple Developer legal name |

## Version Information

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

## Review Information

### Demo Account

Do not commit the password.

```text
Email: app-review-teacher@thebeesuite.io
Password: <temporary App Review password stored outside git>
Demo school: Kid City USA - Demo or equivalent fake-data center
Demo classroom: fake classroom records only
```

### App Review Notes

```text
BEE Suite Teacher Portal is an invitation-based app for childcare teachers whose school uses The BEE Suite. The demo account is linked to fake classroom, child, and staff records only.

After signing in, open the teacher portal to review assigned classroom roster details, attendance workflows, daily report preparation, media upload, incident documentation, and teacher profile readiness.

The app does not sell digital content, subscriptions, or app features to teachers. Any school billing or parent payment workflows are outside this teacher app.

If any production school feature is unavailable in the demo account, use the sample records already attached to the demo classroom.
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

Accepted iPhone portrait sizes for the final native set are 1260 x 2736, 1290 x 2796, or 1320 x 2868 pixels for 6.9-inch displays. If no 6.9-inch set is supplied, Apple accepts 1284 x 2778 or 1242 x 2688 for the required 6.5-inch fallback. Upload one to ten no-alpha PNG/JPEG images from the processed native build using fake data. Exact-size synthetic composition drafts are under `output/app-store/ios-teacher/screenshots-draft/`; their manifest explicitly marks them as non-native drafts. Replace them with matching signed Release/TestFlight captures before submission.

## Privacy Nutrition Label Worksheet

Final answers must be reconciled with production vendors and SDKs.

| Apple data type | Likely collected | Linked to user | Purpose |
| --- | --- | --- | --- |
| Contact Info | Yes | Yes | Account, staff profile, support |
| User Content | Yes | Yes | Daily reports, incident notes, uploads, classroom media, support |
| Identifiers | Yes | Yes | User IDs, staff IDs, classroom IDs, school IDs, session/device identifiers |
| Usage Data | Yes if analytics/logging enabled | Yes or pseudonymous depending vendor setup | Product operation, reliability, analytics |
| Diagnostics | Yes | Yes or pseudonymous depending vendor setup | Crash/error reports, operational logs, performance, support, security |
| Sensitive Info | Yes where schools enable child medical, allergy, custody, incident, attendance, or safety records | Yes | Childcare operations and school records |
| Financial Info | No for teacher v1 | No | Do not collect for teacher v1 |
| Purchase History | No for teacher v1 | No | Do not collect for teacher v1 |
| Location | No precise device location found | No | Do not collect for v1 |
| Contacts | No address book access found | No | Do not collect for v1 |
| Advertising Data | No | No | Do not collect for v1 |

Tracking recommendation:

```text
No tracking, unless a vendor is added that tracks users across apps or websites owned by other companies for advertising or brokered measurement.
```

## Permission Strings

Current teacher iOS plist contains:

```text
NSCameraUsageDescription = Teachers can take classroom photos for parent-approved media updates and school records.
NSPhotoLibraryUsageDescription = Teachers can choose photos and files for classroom updates, daily reports, and school documentation.
```

## Export Compliance Draft

Expected posture:

- The app uses HTTPS/TLS and standard platform encryption.
- No custom cryptography was found in the audit.
- Complete App Store Connect encryption questions based on the final build.
- If eligible for exemption, `ITSAppUsesNonExemptEncryption=false` is present in Info.plist.

## Age Rating Draft

- Made for Kids: No.
- Audience: authorized adult childcare staff.
- Complete the current App Store Connect questionnaire, including messaging/user-generated content and sensitive childcare context, and use Apple’s calculated rating.
- Do not assert 4+ or another final rating in metadata before the questionnaire is completed.

## Account And Login Answers

- Account creation: no self-service teacher registration; access is issued by the school.
- Account/access removal: school administrators can deactivate teacher access; public privacy/support channels remain available. Owner/counsel must confirm the final employee-record retention response.
- Sign in with Apple: not applicable while email/password is the only login and no third-party/social login is offered.
- Reviewer credentials: required because the app is account-based. Create the exact fake-data account only after approval with `npm run app-review:teacher:ensure`; never put its password in Git.

## Payments And IAP

- In-app purchases: none.
- Digital content/features sold in app: none.
- Parent tuition or school billing is outside this Teacher target and must not appear in its listing or screenshots.

## Guideline 4.2 And Completeness Note

The app uses an intentional production `server.url` for the server-rendered teacher workspace, so Apple may scrutinize it as a remote WebView shell. The final TestFlight build must demonstrate working classroom roster, attendance, daily-report, media, incident, profile, native launch/offline, safe-area, and camera/photo flows. Repository checks alone are not acceptance evidence.

## Human Completion Fields

Before selecting a build for review, record:

- Apple Team and legal seller name.
- Unique version/build selected.
- Archive validation result and archive UUID.
- Privacy report reconciliation.
- Processed TestFlight build and physical-iPhone smoke result.
- Final accepted-size screenshot set.
- Working fake-data reviewer credentials and review contact.
- App Privacy publication, age-rating result, export-compliance answer, and owner/counsel approval.

Actual upload, TestFlight distribution, and App Review submission are separate publishing actions requiring exact approval.
