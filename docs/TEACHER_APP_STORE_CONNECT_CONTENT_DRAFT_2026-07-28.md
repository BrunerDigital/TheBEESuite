# App Store Connect Content Draft - BEE Suite Teacher Portal

Draft date: July 28, 2026  
Status: Draft for Product, Legal, QA, and Release Manager review before App Store Connect entry.

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
