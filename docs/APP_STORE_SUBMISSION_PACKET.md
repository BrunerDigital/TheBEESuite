# App Store Submission Packet - BEE Suite Parent Portal

Last updated: July 7, 2026

This packet is for the first iOS App Store submission whose purpose is to make the parent portal easier for parents and guardians to access.

## Submission Status

Current repository status:

- The product is a Next.js web app with PWA metadata and an install launcher at `https://thebeesuite.io/app`.
- The parent App Store entry and login surface is `https://thebeesuite.io/parents`.
- Role-specific web entry points now exist for `/parents`, `/teachers`, `/directors`, and `/executives`, each with its own manifest metadata.
- Public support and privacy routes now exist at `https://thebeesuite.io/support` and `https://thebeesuite.io/privacy`.
- A Capacitor iOS project now exists at `ios/App/App.xcodeproj` for the parent app.
- There is still no uploadable `.ipa` in this repository because the final archive must be built and signed from Xcode on macOS.
- The existing 1024 icon has an alpha channel, so a no-alpha App Store export was generated at `output/app-store/ios/app-icon-1024-no-alpha.png`.
- The fake App Review parent account `app-review-parent@thebeesuite.io` was created, linked to seeded demo family data, and verified through the live login API on July 7, 2026.

Repository verification completed after the parent-app split:

- `npm test -- tests/phase1-guardrails.test.ts tests/parent-portal-invite-links.test.ts`
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `npm audit --omit=dev`
- `npx cap ls ios`
- Live login API check for `app-review-parent@thebeesuite.io` returned `ok: true` and `nextPath: /parent-portal`.
- Authenticated live fetch of `https://thebeesuite.io/parent-portal` returned `200`.

Do not submit until these blockers are resolved:

- Native iOS wrapper is opened on macOS, assigned to the correct Apple Developer team, tested on iPhone, and archived successfully in Xcode.
- Apple Developer Program account and Team ID are confirmed.
- Public privacy policy URL and support URL are live and counsel/owner-approved.
- App Review demo credentials are copied into App Store Connect and rotated after review.
- Production backend is live during review.

## Recommended App Identity

Use these unless there is already an Apple Developer identifier reserved for this app.

| Field | Value |
| --- | --- |
| App Store name | `BEE Suite Parent Portal` |
| Device display name | `BEE Suite` |
| Bundle ID | `com.brunerdigital.thebeesuite.parent` |
| SKU | `BEE-SUITE-PARENT-IOS` |
| Initial version | `1.0.0` |
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

Future role-specific app identities are reserved in code so later submissions do not reuse the parent app metadata:

| Role app | Bundle ID | SKU | Web launch |
| --- | --- | --- | --- |
| Parent | `com.brunerdigital.thebeesuite.parent` | `BEE-SUITE-PARENT-IOS` | `https://thebeesuite.io/parents` |
| Teacher | `com.brunerdigital.thebeesuite.teacher` | `BEE-SUITE-TEACHER-IOS` | `https://thebeesuite.io/teachers` |
| Director | `com.brunerdigital.thebeesuite.director` | `BEE-SUITE-DIRECTOR-IOS` | `https://thebeesuite.io/directors` |
| Executive | `com.brunerdigital.thebeesuite.executive` | `BEE-SUITE-EXECUTIVE-IOS` | `https://thebeesuite.io/executives` |

Notes:

- Apple says the Bundle ID in App Store Connect must match the Xcode project and cannot be changed after a build is uploaded.
- Apple says the SKU is internal, cannot be changed after the app record is created, and can contain letters, numbers, hyphens, periods, and underscores.
- If the Apple Developer account legal name is not BrunerDigital, use the exact legal developer name from App Store Connect for copyright/support/legal materials.

## Native iOS Target Requirements

Current implementation: a Capacitor iOS shell that launches the production parent portal route.

Suggested launch URL:

```text
https://thebeesuite.io/parents
```

After a parent signs in, the app routes to `https://thebeesuite.io/parent-portal`.

Native project paths:

```text
capacitor.config.ts
native/parent-shell/index.html
native/parent-shell/offline.html
ios/App/App.xcodeproj
ios/App/App/Info.plist
```

Suggested capabilities:

- WKWebView or Capacitor shell pointed at the production parent portal.
- Native loading, offline, and session-expired screens.
- Native bottom navigation or toolbar for Portal, Messages, Billing, Documents, and Settings.
- Face ID / Touch ID app lock for reopening the app.
- Native photo/document picker for message/document uploads.
- Push notifications for school messages, daily reports, documents, incidents, and billing reminders when APNs server support is ready.
- Associated domains if Universal Links are added later.

Suggested bundle capabilities:

- Associated Domains: optional for v1, recommended later.
- Push Notifications: only enable if APNs is implemented and tested.
- Sign in with Apple: not required if the app only uses email/password login and does not offer third-party social login.
- Apple Pay: not required for v1. Stripe checkout for tuition and physical/service payments can remain external/traditional payment handling.

Suggested `Info.plist` purpose strings:

```text
NSCameraUsageDescription = Parents can take photos of requested documents or attach images to messages for their school.
NSPhotoLibraryUsageDescription = Parents can choose photos and files to send to their school through the parent portal.
NSFaceIDUsageDescription = BEE Suite can use Face ID to help protect access to family records on this device.
```

Do not request location, microphone, contacts, calendar, Bluetooth, or tracking permissions for v1 unless the native app actually uses them.

## App Store Metadata

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

Do not duplicate the app name or company name in keywords.

```text
childcare,parent portal,daily reports,tuition,school messages,documents,photos,preschool
```

Character count: 88 bytes.

### What's New

```text
Initial iOS release for parent access to The BEE Suite parent portal.
```

### Support URL

Required before submission:

```text
https://thebeesuite.io/support
```

The route has been added in the app. Confirm the support inbox is active before submission. Apple expects a support URL that lets users reach you about app issues, feedback, and support requests. Include at least:

- Support email, for example `support@thebeesuite.io`
- Support phone number
- Legal/business mailing address if required by local law
- Support hours or expected response time
- Parent instruction to contact their school directly for urgent pickup, safety, billing, or child-record issues

### Marketing URL

Optional:

```text
https://thebeesuite.io/
```

### Privacy Policy URL

Required before submission:

```text
https://thebeesuite.io/privacy
```

The route has been added in the app. This must stay public, reachable without login, and approved before submission. The internal repository currently documents privacy/security posture, but final public privacy policy and terms still require owner/counsel approval.

## App Review Information

Create a dedicated fake-data review account before submission.

```text
Demo account email: app-review-parent@thebeesuite.io
Demo account password: <temporary review password; do not commit to the repository>
Demo school: Kid City USA - Demo
Demo family: Rivera Family
Demo child records: Fake child records only
```

Suggested App Review notes:

```text
BEE Suite Parent Portal is an invitation-based app for parents and guardians whose childcare provider uses The BEE Suite. The demo account is linked to fake family and child records only.

After signing in, open the parent portal to review child updates, daily reports, messages, documents, incident acknowledgements, invoices, payment history, and notification preferences.

Payments shown in the app are for childcare tuition, uniforms, documents, and school services or goods consumed outside the app. The app does not sell digital content, subscriptions, or app features to parents. Payment method entry is handled by Stripe; the app does not store raw card or bank credentials.

If any production school feature is unavailable in the demo account, use the sample records already attached to the demo family.
```

## Privacy Nutrition Label Draft

Final answers must be confirmed against the production app, native SDKs, Vercel analytics, Stripe, Supabase, Twilio/SendGrid, and any crash reporting SDK included in the iOS build.

Likely data collected and linked to the user:

- Contact Info: name, email address, phone number, family/contact details.
- User Content: messages, uploaded documents, photos, message attachments, typed signatures, support requests.
- Financial Info: invoices, balances, payment status, payment method category, Stripe checkout/payment identifiers. Raw card and bank credentials should stay with Stripe.
- Purchase History: tuition, uniform, fee, and payment records if visible in the parent portal.
- Identifiers: internal user ID, guardian ID, family ID, session/device identifiers.
- Usage Data: product interaction and page/app usage if analytics are enabled.
- Diagnostics: crash/performance/log data if added to the native build or collected by hosting/logging tools.
- Health or Sensitive Child Information: allergies, medical notes, incident documents, custody/safety-related details, immunization or requested documents if exposed to parents.

Likely data not collected for v1:

- Precise device location.
- Contacts/address book.
- Microphone/audio.
- Advertising ID for tracking.
- Third-party advertising data.

Tracking:

- Recommended answer: no tracking, unless a third-party SDK is added that tracks users across apps/websites for advertising or measurement.

User-generated content:

- The app has private parent-to-school messaging, photo/file uploads, and document submissions.
- Because content is private and school-controlled, explain the moderation/review model in review notes if needed.
- Confirm App Store age rating questionnaire answers based on the final native feature set.

## Payments And In-App Purchase Position

Use no in-app purchases for the parent portal.

Rationale:

- Parent payments are for childcare tuition, uniforms, documents, fees, or school services/goods consumed outside the app.
- Apple App Review Guideline 3.1.3(e) says apps enabling purchase of physical goods or services consumed outside the app must use purchase methods other than in-app purchase, such as Apple Pay or traditional credit card entry.
- Do not sell BEE Suite SaaS subscriptions, digital content, premium app features, or parent-only digital unlocks inside this parent app unless reviewed separately for Apple's in-app purchase rules.

## Review Risk Notes

Highest risk: Guideline 4.2 Minimum Functionality.

Apple says apps should include features, content, and UI that elevate them beyond a repackaged website, and apps should not primarily be web clippings or collections of links. A simple WKWebView pointed at the website is risky.

Reduce that risk before submission by including:

- Native app navigation, launch, and offline states.
- Native privacy/security affordances such as Face ID app lock.
- Native file/photo upload flow.
- Push notification support if ready.
- A review note explaining this is a secure account-based parent portal with operational school workflows, not marketing content.

Second risk: App Completeness.

Apple expects backend services to be live and demo credentials to work during review. Make sure the reviewer can log in, see fake family records, view documents/messages/billing samples, and complete non-destructive paths.

Third risk: privacy/legal readiness.

The repository's own legal/privacy review says the public privacy policy, terms, parent consent language, payment authorization language, and data processing terms still require owner/counsel approval before broad launch.

## Required Assets

### App Icon

Use:

```text
output/app-store/ios/app-icon-1024-no-alpha.png
```

Verified:

- 1024 x 1024
- PNG
- No alpha channel

Source icon:

```text
public/brand/the-bee-suite/app-icon-yellow.png
```

The source icon is 1024 x 1024 but has an alpha channel, so do not use it directly as the App Store marketing icon unless it is exported without alpha.

### Screenshots

Current screenshots in `screenshots/` are useful references but are not App Store-ready sizes.

Recommended first-release screenshots:

1. Parent dashboard with child summary and next action.
2. Daily report showing meals, nap/activity, and teacher note.
3. Messages with center communication.
4. Documents and forms requiring upload/signature.
5. Billing/invoice view with payment options.
6. Photos/media view with school-approved media.
7. Incident acknowledgement or notification preferences.

Required iPhone screenshot sizes:

- 6.9 inch: use one accepted portrait size such as `1320 x 2868`, `1290 x 2796`, or `1260 x 2736`.
- If 6.9 inch screenshots are not supplied, 6.5 inch screenshots are required, such as `1242 x 2688` or `1284 x 2778`.

If the first release is iPhone-only, do not enable iPad support in Xcode. If iPad is enabled, App Store Connect requires 13 inch iPad screenshots, such as `2064 x 2752` or `2048 x 2732`.

## Age Rating Guidance

Recommended:

- Do not mark the app as Made for Kids.
- Intended audience is parents/guardians and school staff, not child self-service users.
- Complete Apple's age rating questionnaire truthfully based on the final build.
- If Apple treats private parent/school messages and uploads as user-generated content, select the appropriate infrequent/mild option and accept the calculated rating.

## Export Compliance

The app uses standard HTTPS/TLS and authentication. It does not appear to implement custom cryptography.

Recommended App Store Connect direction:

- Declare encryption if asked because HTTPS is used.
- Use the standard exemption path if App Store Connect offers it for apps using only standard encryption, OS-provided encryption, or HTTPS.
- Confirm against the final native build and any SDKs added.

## Account And Build Checklist

1. Enroll or confirm Apple Developer Program membership.
2. Get the Team ID from Apple Developer account membership.
3. Register Bundle ID `com.brunerdigital.thebeesuite.parent`.
4. Open the generated Capacitor iOS target from `ios/App/App.xcodeproj` on macOS.
5. Set the Apple Developer Team, confirm display name, bundle ID, version `1.0`, build `1`, and iPhone-only target.
6. Add App Icon using `output/app-store/ios/app-icon-1024-no-alpha.png`.
7. Add required `Info.plist` permission strings.
8. Build and test on a real iPhone.
9. Create a fake-data demo parent account.
10. Confirm `https://thebeesuite.io/parents`, `https://thebeesuite.io/parent-portal`, support URL, privacy URL, and backend APIs are live.
11. Capture App Store screenshots from the native app/simulator at accepted dimensions.
12. Create the App Store Connect app record using the app identity values above.
13. Upload build with Xcode Organizer or Transporter.
14. Complete App Privacy, Age Rating, Export Compliance, Pricing/Availability, and Review Information.
15. Submit to TestFlight first.
16. Install TestFlight build on at least one iPhone and run parent login, dashboard, messages, document upload, incident acknowledgement, and billing view smoke tests.
17. Submit to App Review only after TestFlight smoke passes.

See `docs/PARENT_IOS_BUILD_RUNBOOK.md` for the Mac/Xcode build handoff.

## Source References

- App Review Guidelines: https://developer.apple.com/app-store/review/guidelines/
- App Store Connect app information fields: https://developer.apple.com/help/app-store-connect/reference/app-information/app-information/
- App Store Connect platform version fields: https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information/
- App Privacy Details: https://developer.apple.com/app-store/app-privacy-details/
- Screenshot specifications: https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/
- App Review preparation: https://developer.apple.com/distribute/app-review/
- Capacitor installation: https://capacitorjs.com/docs/getting-started
- Capacitor iOS setup: https://capacitorjs.com/docs/ios
