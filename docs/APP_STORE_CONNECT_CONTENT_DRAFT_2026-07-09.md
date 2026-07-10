# App Store Connect Content Draft - BEE Suite Parent Portal

Draft date: July 9, 2026  
Status: Draft for Product, Legal, QA, and Release Manager review before App Store Connect entry.

## App Information

| Field | Draft value |
| --- | --- |
| App Store name | `BEE Suite Parent Portal` |
| Device display name | `BEE Suite` |
| Bundle ID | `com.brunerdigital.thebeesuite.parent` |
| SKU | `BEE-SUITE-PARENT-IOS` |
| Primary language | English (U.S.) |
| Primary category | Education |
| Secondary category | Productivity |
| Price | Free |
| Availability | United States |
| Made for Kids | No |
| Target devices | iPhone only for v1 |
| Minimum iOS | iOS 16.0 |
| Version | `1.0.0` |
| Initial build | `1` |
| Copyright | `2026 BrunerDigital` or exact Apple Developer legal name |

## Version Information

### Subtitle

```text
Childcare updates in one app
```

### Promotional Text

```text
Parents can view child updates, school messages, documents, invoices, payments, photos, incident acknowledgements, and family requests from one secure portal.
```

### Description

```text
BEE Suite Parent Portal gives families a secure way to stay connected with their childcare center.

Parents and guardians can view child updates, classroom notes, shared photos, school messages, announcements, documents, incident acknowledgements, open invoices, payment history, and family requests from one mobile app.

Features may vary by school based on the workflows enabled by your childcare provider.

Key features:
- View linked children and family details
- Review daily reports, activities, meals, naps, and supplies
- See school-approved photos and media
- Message the center
- Review announcements and reminders
- Upload or sign requested documents
- Acknowledge incident reports
- Review balances, invoices, and payments
- Manage notification preferences when enabled
- Request emergency contact or authorized pickup updates for school review

Parent access is invitation-based. You will only see family and child records linked to the guardian email your school has on file.
```

### Keywords

```text
childcare,parent portal,daily reports,tuition,school messages,documents,photos,preschool
```

### What's New

```text
Initial iOS release for parent access to The BEE Suite parent portal.
```

### Support URL

```text
https://thebeesuite.io/support
```

Before submission, confirm this page includes:

- Support email.
- Support hours or response expectation.
- Urgent school-contact guidance.
- Privacy and account deletion request path.
- Sensitive-data handling guidance.

### Marketing URL

```text
https://thebeesuite.io/
```

### Privacy Policy URL

```text
https://thebeesuite.io/privacy
```

Before submission, counsel must approve the public policy.

## Review Information

### Demo Account

Do not commit the password.

```text
Email: app-review-parent@thebeesuite.io
Password: <temporary App Review password stored outside git>
Demo school: Kid City USA - Demo or equivalent fake-data center
Demo family: fake family records only
```

### App Review Notes

```text
BEE Suite Parent Portal is an invitation-based app for parents and guardians whose childcare provider uses The BEE Suite. The demo account is linked to fake family and child records only.

After signing in, open the parent portal to review child updates, daily reports, messages, documents, incident acknowledgements, invoices, payment history, and notification preferences.

Payments shown in the app are for childcare tuition, fees, school goods, or services consumed outside the app. The app does not sell digital content, subscriptions, or app features to parents. Payment method entry is handled by Stripe; the app does not store raw card or bank credentials.

Users can initiate account deletion in the app from Parent Portal > Settings > Privacy and Account > Request account deletion. Some childcare, safety, licensing, billing, payment, or audit records may need to be retained by the school or The BEE Suite where required by law or school policy.

If any production school feature is unavailable in the demo account, use the sample records already attached to the demo family.
```

Use the account deletion paragraph after the updated build and database migration are deployed and verified.

## Screenshot Plan

Use final TestFlight/native build and fake data only.

| Shot | Screen | Caption draft |
| --- | --- | --- |
| 1 | Parent dashboard | `Your child's day, messages, documents, and billing in one secure portal.` |
| 2 | Daily report | `Review meals, naps, activities, supplies, and teacher notes.` |
| 3 | Messages | `Stay connected with your childcare center.` |
| 4 | Documents | `Upload, review, and sign requested school documents.` |
| 5 | Billing | `View invoices, balances, payment history, and checkout links when enabled.` |
| 6 | Photos/media | `See school-approved photos and classroom moments.` |
| 7 | Incident/preferences | `Acknowledge important records and manage notification preferences.` |

Accepted iPhone screenshot strategy:

- Preferred: 6.9 inch portrait screenshots.
- Fallback: 6.5 inch portrait screenshots.
- Do not enable iPad for v1 unless iPad screenshots are prepared.

## Preview Video Storyboard

Length target: 25-30 seconds.

| Time | Visual |
| --- | --- |
| 0-3s | Launch app and sign in to a fake parent account. |
| 3-7s | Dashboard shows linked child and today's summary. |
| 7-12s | Daily report shows meals, nap, activity, and note. |
| 12-16s | Parent reads and replies to a school message. |
| 16-20s | Parent reviews a document or incident acknowledgement. |
| 20-24s | Parent views invoice/payment status. |
| 24-30s | Settings/support/privacy screen closes the story. |

## Feature and Marketing Assets

Prepare:

- App Store icon: `output/app-store/ios/app-icon-1024-no-alpha.png`
- Website App Store badge section.
- Parent launch email.
- Director launch handout.
- Support FAQ screenshots.
- Social/announcement graphic after approval.

Do not use real child photos or real family names in public marketing.

## Age Rating Worksheet

Final answers must be entered based on the actual uploaded build.

Recommended posture:

- Made for Kids: No.
- Intended audience: adults, parents, guardians, school staff, and authorized operational users.
- Child accounts: No child self-service accounts for v1.
- User-generated content: Private parent/school messages, uploads, photos, and documents exist. Answer according to Apple's questionnaire and explain private school-controlled context if asked.
- Unrestricted web access: No, if the app is constrained to The BEE Suite routes and does not expose general browsing.
- Gambling, contests, alcohol, tobacco, drugs, sexual content, violence: No, unless content uploaded by users requires a different answer.
- Medical/treatment advice: No. The app may display school records but does not provide medical advice.

## Privacy Nutrition Label Worksheet

Final answers must be reconciled with production vendors and SDKs.

| Apple data type | Likely collected | Linked to user | Purpose |
| --- | --- | --- | --- |
| Contact Info | Yes | Yes | Account, communication, school records, support |
| User Content | Yes | Yes | Messages, uploads, documents, photos, signatures, support |
| Financial Info | Yes | Yes | Invoices, balances, payment status, payment provider identifiers |
| Purchase History | Yes if billing enabled | Yes | Tuition/fee/payment records |
| Identifiers | Yes | Yes | User IDs, guardian IDs, family IDs, session/device identifiers |
| Usage Data | Yes if analytics/logging enabled | Yes or pseudonymous depending vendor setup | Product operation, reliability, analytics |
| Diagnostics | Yes | Yes or pseudonymous depending vendor setup | Crash/error reports, operational logs, performance, support, security |
| Sensitive Info | Yes where schools enable medical, allergy, custody, incident, immunization, or safety records | Yes | Childcare operations and school records |
| Location | No precise device location found | No | Do not collect for v1 |
| Contacts | No address book access found | No | Do not collect for v1 |
| Browsing History | No general browsing history found | No | Do not collect for v1 |
| Search History | No | No | Do not collect for v1 |
| Advertising Data | No | No | Do not collect for v1 |

Tracking recommendation:

```text
No tracking, unless a vendor is added that tracks users across apps or websites owned by other companies for advertising or brokered measurement.
```

Privacy manifest status:

```text
An app-level PrivacyInfo.xcprivacy file is included in the iOS target resources. It declares tracking as false, no tracking domains, and conservative collection categories for contact info, identifiers, user content, financial/payment records, sensitive childcare records, product interaction, crash data, and performance data. Generate the Xcode privacy report from the final archive and reconcile it with App Store Connect before submission.
```

## Permission Strings

Current iOS plist contains:

```text
NSCameraUsageDescription = Parents can take photos of requested documents or attach images to messages for their school.
NSPhotoLibraryUsageDescription = Parents can choose photos and files to send to their school through the parent portal.
```

Required decision:

- Keep camera/photo only if upload paths actually use them in the native app.
- Face ID has been removed from v1 metadata because no implemented biometric lock was found.
- Do not add microphone, location, contacts, tracking, or push prompts for v1 unless the feature is complete and tested.

## Export Compliance Draft

Expected posture:

- The app uses HTTPS/TLS and standard platform encryption.
- No custom cryptography was found in the audit.
- Complete App Store Connect encryption questions based on the final build.
- If eligible for exemption, add the correct `ITSAppUsesNonExemptEncryption` value to Info.plist.

## In-App Purchase and Payments Draft

Expected answer:

- No in-app purchases for v1.
- Parent payments are for childcare tuition, fees, school goods, or services consumed outside the app.
- Payment method entry is handled by Stripe.
- The app does not sell digital content, app features, or SaaS upgrades to parents.

Review notes should include this explanation.
