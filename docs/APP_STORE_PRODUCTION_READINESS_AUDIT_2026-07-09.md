# App Store Production Readiness Audit - The BEE Suite

Audit date: July 9, 2026  
Scope: BEE Suite Parent Portal iOS App Store submission, production SaaS readiness, childcare privacy/security posture, and release operations after successful live production testing at Kid City USA - Kokomo.

## Executive Decision

The BEE Suite is functioning in a real childcare production environment, but it is not ready to submit to Apple today. It is ready to enter a focused App Store hardening sprint.

The blockers are not core product viability. They are release-governance items Apple and enterprise childcare buyers will expect: final legal documents, in-app account deletion, App Privacy answers, signed TestFlight build, App Store assets, live security evidence, durable rate limiting, crash monitoring, and final payment/storage verification.

## Implementation Progress - July 9, 2026

The first in-repository App Store hardening pass completed these items:

- Added an authenticated parent portal account deletion request flow under `Parent Portal > Profile Settings > Privacy and Account Deletion`.
- Added durable `DataDeletionRequest` persistence with RLS-enabled migration, audit logging, director notifications, duplicate-open-request protection, and 30-day target response tracking.
- Added public `/terms` and `/eula` routes and cross-linked them from `/privacy` and `/support`.
- Added a shared `RateLimitBucket` persistence table and switched sensitive account/payment/privacy routes to database-backed rate limiting with in-memory fallback.
- Added privacy-safe client crash/error reporting for browser/WebView runtime errors, unhandled promise rejections, and React error boundaries through `/api/system/client-error-reports`, backed by an RLS-enabled `ClientErrorReport` table and production readiness check.
- Added `ios/App/App/PrivacyInfo.xcprivacy` to the iOS target resources with no tracking domains and conservative data collection declarations for contact info, identifiers, user content, financial info, sensitive childcare records, usage data, and diagnostics.
- Removed the unused Face ID permission string from iOS metadata.
- Added `ITSAppUsesNonExemptEncryption=false` for the standard-encryption exemption path, pending final App Store Connect confirmation.
- Verified `npx prisma validate`, `npx prisma generate --no-engine`, `npm run lint`, `npm run typecheck`, `npm test`, `npm audit --omit=dev`, and `npm run build`.

Revised in-repo readiness after this pass:

| Area | Score | Decision |
| --- | ---: | --- |
| Overall production readiness | 82/100 | Major App Store code blockers reduced; external sign-offs remain |
| App Store submission readiness | 71/100 | Still blocked by legal approval, signed TestFlight build, screenshots, App Privacy, and live service evidence |
| Security readiness | 85/100 | Durable limiter, deletion audit path, and privacy-safe client diagnostics added; live Supabase/Stripe evidence still required |
| Legal/compliance readiness | 58/100 | Routes and drafts exist; counsel/owner approval still required |

## Production Readiness Score

| Area | Score | Decision |
| --- | ---: | --- |
| Overall production readiness | 72/100 | Strong pilot maturity, incomplete release governance |
| App Store submission readiness | 58/100 | Blocked until P0 items are complete |
| Security readiness | 76/100 | Good architecture, missing live evidence and a few hardening controls |
| Legal/compliance readiness | 45/100 | Drafts exist or are created here, but owner/counsel approval is not complete |
| QA readiness | 67/100 | Functional testing exists, but release-candidate device, role, payment, offline, and accessibility evidence is incomplete |
| Operational readiness | 78/100 | Live support patterns exist, but App Store and enterprise support SLAs need finalization |

## Evidence Reviewed

Local repository artifacts reviewed:

- `package.json`, `capacitor.config.ts`, `next.config.ts`
- `ios/App/App/Info.plist`
- `ios/App/App/Base.lproj/LaunchScreen.storyboard`
- `ios/App/App.xcodeproj/project.pbxproj`
- `docs/APP_STORE_SUBMISSION_PACKET.md`
- `docs/PARENT_IOS_BUILD_RUNBOOK.md`
- `docs/LEGAL_PRIVACY_SECURITY_REVIEW_2026-06-09.md`
- `docs/SECURITY_PRIVACY_OPERATIONS.md`
- `docs/DEPLOYMENT.md`
- `docs/STRIPE_CONNECT.md`
- `src/lib/auth.ts`
- `src/lib/rbac.ts`
- `src/lib/rate-limit.ts`
- `src/lib/request-response-logging.ts`
- `src/lib/supabase-auth.ts`
- `src/lib/supabase-storage.ts`
- Selected API routes for auth, billing, payments, cron, Twilio inbound, push integration, admin operations, and reporting
- Supabase, Prisma, and storage migrations under `prisma/migrations` and `supabase/migrations`

External requirements reviewed on July 9, 2026:

- Apple App Review Guidelines
- Apple App Privacy Details
- Apple account deletion guidance
- Apple age rating guidance
- Apple encryption/export compliance guidance
- Apple user privacy and data use guidance
- FTC COPPA rule materials
- FERPA guidance from the U.S. Student Privacy Policy Office
- Supabase API security and production security documentation
- Stripe go-live and security guidance

## Hard Stop Gates Before Apple Submission

These are release blockers. Do not submit the app to App Review until all P0 gates are closed.

| Gate | Priority | Owner | Estimated effort | Status |
| --- | --- | --- | --- | --- |
| Final owner/counsel approval of public Privacy Policy, Terms, EULA, deletion workflow, payment disclosures, COPPA/FERPA language, and DPA/service-provider terms | P0 | Product, Legal | 3-7 business days plus counsel queue | External approval required |
| Publish or update public `/privacy`, `/terms`, `/eula`, `/support`, and account/data deletion instructions | P0 | Engineering, Product | 1-2 days after approval | Implemented in repo; deploy and legal approval required |
| Add in-app account deletion request initiation for parent accounts | P0 | Engineering | 1-3 days | Implemented in repo; migration/deploy/QA required |
| Complete App Privacy Nutrition Label inventory against actual production SDKs, vendors, logs, analytics, Stripe, Supabase, SendGrid, Twilio, and any crash SDK | P0 | Product, Security | 1-2 days | Missing |
| Build signed iOS archive on macOS, set Apple Team ID, upload to TestFlight, and run TestFlight smoke | P0 | iOS, Release | 1-2 days | Missing |
| Capture App Store screenshots from the native build at accepted iPhone sizes and prepare preview video plan | P0 | Product, Design, QA | 1-2 days | Missing |
| Verify App Review demo account on the final production build with fake child/family/payment data | P0 | QA, Release | 0.5-1 day | Partial |
| Run live Supabase advisor/security review and prove RLS/grants/storage policies for all production tables and buckets | P0 | Security, Backend | 1-2 days | Missing evidence |
| Replace in-memory rate limiting for sensitive endpoints with durable shared rate limiting | P0 | Backend, Security | 1-3 days | Implemented for account/payment/privacy routes; migrate/deploy required |
| Add production crash/error monitoring for web and native shell | P0 | Engineering, SRE | 1-2 days | Web/React runtime reporting implemented in repo; native shell crash evidence and alert routing still required |
| Verify Stripe live-mode checkout, Connect, webhooks, disputes/refunds, receipts, and school payment disclosures | P0 | Payments, QA, Legal | 1-3 days | Partial |
| Decide Face ID: implement a real native app lock or remove `NSFaceIDUsageDescription` before submission | P0 | iOS, Product | 0.5-2 days | Resolved in repo by removing unused declaration |
| Complete export compliance decision and add the correct `ITSAppUsesNonExemptEncryption` value if the exemption applies | P0 | Release, Security | 0.5 day | Plist set for exemption path; App Store Connect answer still required |

## Apple Requirements Audit

| Requirement | Current finding | Release decision | Priority |
| --- | --- | --- | --- |
| App Review completeness | Existing submission packet is strong. Final signed build, live backend, working demo account, and complete metadata still need confirmation. | Submit only after TestFlight smoke passes and review credentials are verified. | P0 |
| Guideline 4.2 minimum functionality | Current iOS target is a Capacitor shell pointed at the production parent portal. Apple can reject thin web wrappers. | Add or verify native-value features: launch/offline handling, polished native shell, device testing, possibly biometric lock or native upload affordances. Review notes must explain secure account-based workflows. | P0 |
| Account deletion | Implemented in repo after audit: parent settings can create a durable deletion request and explain retention exceptions. | Deploy migration/app, verify on TestFlight, and include path in review notes. | P0 |
| Privacy Policy URL | `/privacy` exists, but current page is short and repository docs still say public policy requires owner/counsel approval. | Replace or expand from generated draft after counsel approval. Must be public and reachable without login. | P0 |
| Terms/EULA URL | Implemented in repo after audit: public `/terms` and `/eula` routes exist. | Legal approval and production deployment still required. | P0 |
| Support URL | `/support` exists and points to `support@thebeesuite.io`, but needs support hours, phone or mailing address if required, SLA, and deletion/privacy instructions. | Finalize support operations before submission. | P0 |
| Privacy Nutrition Labels | Draft exists in `docs/APP_STORE_SUBMISSION_PACKET.md`. Needs final inventory against actual production app and third-party SDKs. | Complete in App Store Connect after vendor/data inventory. | P0 |
| Privacy manifest | `PrivacyInfo.xcprivacy` is now included in the iOS app target resources. | Generate the Xcode archive privacy report and reconcile it with App Store Connect labels before submission. | P0 |
| Children's data | App handles child records, media, health/medical/custody context, and school-family communications. App is for adults, not child self-service. | Do not mark Made for Kids unless product strategy changes. Include COPPA/FERPA service-provider posture in legal docs and review notes. | P0 |
| COPPA | COPPA may apply because the platform processes personal information about children under 13 through schools and parents. The app is not child-directed self-service. | Final legal position must document school/parent authorization, no child accounts, data minimization, parent review/deletion process, security, and retention. | P0 |
| FERPA | Some customers may be educational agencies or schools subject to FERPA or FERPA-like obligations. | Treat The BEE Suite as a school service provider/school official where applicable. Do not disclose education records without school/parent authorization. Add DPA language. | P0 |
| Sign in with Apple | App appears to use email/password and Supabase-backed auth, not third-party social login. | Not required for v1 if no third-party social sign-in is offered. Reassess if Google/Facebook/social login is added. | P2 |
| In-App Purchase | Parent payments appear to be for tuition, fees, school goods, or services consumed outside the app. | Do not use IAP for tuition/school payments. Explain in review notes. Do not sell SaaS upgrades or digital unlocks inside the parent app. | P0 |
| Encryption export | App uses HTTPS/TLS and standard platform encryption. No custom cryptography found. `ITSAppUsesNonExemptEncryption=false` is now present for the likely standard-encryption exemption path. | Complete App Store Connect encryption questions and confirm the exemption answer. | P0 |
| App Tracking Transparency | No IDFA/tracking code found. Vercel Analytics exists. | Answer no tracking unless a vendor/SDK tracks users across apps/sites for advertising or brokered measurement. Do not add IDFA. | P0 |
| User-generated content | The app has private messages, uploads, photos, and documents. | Review notes should explain content is private, school-controlled, permissioned, and subject to school review, not a public social network. | P1 |
| Age rating | Existing packet recommends not Made for Kids. | Complete questionnaire based on final build. Expect 4+ or higher depending on UGC/private messaging answers. | P0 |
| Background modes | No background modes found. | Keep disabled for v1 unless a native feature requires them. | P2 |
| Push notifications | In-app notification queue exists. APNs/native push not found. | Do not enable push entitlement or mention push as a v1 App Store feature until APNs is implemented and tested. | P1 |

## iOS Permission Audit

| Permission | Local status | Risk | Required action |
| --- | --- | --- | --- |
| Camera | `NSCameraUsageDescription` exists. | Acceptable if native/web upload can prompt camera for document/message images. | Test on real iPhone. Keep purpose text specific. |
| Photo Library | `NSPhotoLibraryUsageDescription` exists. | Acceptable for photo/document upload. | Test on real iPhone. Confirm no broad library access beyond expected picker behavior. |
| Face ID | Unused `NSFaceIDUsageDescription` was removed after audit. | Low risk for v1; biometric lock can be added later as a native feature. | No v1 action |
| Microphone | No microphone usage found. | Low. | Do not add. |
| Location | No location usage found. | Low. | Do not add. |
| Contacts | No contacts permission found. | Low. | Do not add. |
| Background refresh | No background modes found. | Low. | Do not add. |
| Push notifications | No APNs entitlement found. | Low for v1 if not advertised. | Keep disabled unless implemented. |
| App Transport Security | No broad ATS exception found. Capacitor config uses `cleartext: false`. | Good. | Keep HTTPS-only. |
| Associated domains | Not found. | Optional. | Add only if universal links are implemented. |

## Technical Audit

| Area | Current status | Risk | Priority |
| --- | --- | --- | --- |
| App icon | App icon set exists. Existing packet notes no-alpha App Store icon at `output/app-store/ios/app-icon-1024-no-alpha.png`. iOS asset set appears minimal. | App Store icon likely ready, but installed app icon variants should be verified in Xcode. | P1 |
| Launch screen | Launch storyboard exists and references Splash image. | Good, but needs device verification. | P1 |
| Splash/offline shell | Capacitor `errorPath` points to `offline.html`. Native parent shell exists. | Good baseline for network failure, but App Store review should see polished failure states. | P1 |
| Bundle identifier | `com.brunerdigital.thebeesuite.parent` in Capacitor and Xcode project. | Good. | P0 verify in Apple Developer portal |
| Version/build | Xcode project shows marketing version `1.0`, build `1`, iOS target 16.0, iPhone family only. | Good. | P0 verify before archive |
| Signing/certificates | Automatic signing configured. No Team ID in repo. | Cannot upload until Apple Developer team is selected on macOS. | P0 |
| Production web URL | Capacitor points to `https://thebeesuite.io` and `/parents`. | Good if backend is live during review. | P0 verify |
| Production environment variables | Local env files exist and appear ignored. Public env names do not expose service-role keys by name. | Must verify Vercel production values and rotate any shared/pilot secrets as needed. | P1 |
| Supabase keys | Server code uses service role on server side. No committed live keys were found in tracked source during audit. | Good, but production dashboard/advisor evidence is missing. | P0 |
| API security | Many routes use `getCurrentUser`, role checks, webhook signatures, cron secrets, and logging wrapper. | Needs route-by-route release audit and durable rate limiting. | P0 |
| App Transport Security | HTTPS-only posture. | Good. | P1 verify on device |
| Deep links/universal links | Not found. | Not required for v1 unless marketing/review flow depends on invite links opening in app. | P2 |
| Crash reporting | Web/React runtime error reporting is implemented through `/api/system/client-error-reports` with redaction, same-origin checks, durable rate limiting, and an RLS-enabled diagnostic table. Vercel Analytics is also present. Native shell crash reports still require TestFlight/App Store Connect evidence or a native SDK decision. | Deploy migrations/app, verify report creation in TestFlight, set alert ownership, and document whether App Store Connect crash reports are sufficient for the minimal native shell. | P0 |
| Analytics | `@vercel/analytics` is present. | Privacy label and policy must reflect actual collection. Product analytics are not a substitute for crash monitoring. | P0/P1 |
| Logging | Request/response logging redacts sensitive fields and samples bodies. | Good foundation. Need retention, access, and high-sensitivity endpoint review. | P1 |
| Error handling | API error wrappers exist in many routes. | Needs full regression around network failures, Stripe errors, upload failures, auth expiry, and Supabase outages. | P1 |
| Offline handling | Native shell has offline page. Web app has PWA/service worker pieces. | Needs real iPhone airplane-mode tests and parent workflow expectations. | P1 |
| Loading performance | Next app has production build path. No current release-candidate performance report was found. | Need Lighthouse/WebPageTest/device smoke for parent portal. | P1 |
| Battery/memory | No native profiling evidence found. | WebView app risk is moderate on long sessions/media pages. | P1 |
| Accessibility | No App Store release accessibility report found. | Must test VoiceOver, Dynamic Type, contrast, touch targets, forms, keyboard, and error states. | P0/P1 |

## Security Review

### Authentication

Strengths:

- Server-side session cookie is `httpOnly`, secure in production, same-site lax, HMAC signed, and time limited.
- Session version checks and device session checks exist.
- Supabase password verification is handled server side.
- Password reset flow exists.

Gaps:

- Sensitive auth routes use in-memory rate limiting. This is not adequate for a horizontally scaled production deployment.
- No mandatory MFA decision was found for executive/admin/director roles.
- App Review demo password handling must be documented outside git and rotated after review.
- Session timeout and reauthentication rules for medical, custody, payment, and admin actions should be explicit.

### Role Permissions

Strengths:

- RBAC distinguishes platform, brand, regional, director, assistant, teacher, billing, parent guardian, authorized pickup, and auditor roles.
- Parent/authorized pickup roles are constrained to parent portal modules in the UI access layer.
- Server routes use role and center access checks in many sensitive paths.

Gaps:

- A release audit should verify every API route, not just UI access. UI RBAC is not sufficient by itself.
- Executive/admin access to parent portal data should be deliberately documented as support/admin access and audited.
- Parent permissions need regression tests for guardian-family isolation, split custody, authorized pickup, inactive guardian, and center transfer scenarios.

### Supabase and Database Security

Strengths:

- Existing hardening migration enables RLS broadly and revokes broad `anon`/`authenticated` grants.
- Later migrations show some service-role policies and RLS enforcement for sensitive tables.
- Supabase service role appears server-side only in inspected code.

Gaps:

- Supabase changed public schema grant expectations in 2026. Existing projects need explicit grant/RLS verification before October 30, 2026.
- Several post-hardening Prisma migrations create tables without visible RLS enablement in the same migration. This may be safe from API exposure due to revoked grants, but Supabase advisor may still flag disabled RLS. Verify and add a hardening migration if needed.
- No live Supabase advisor report was found in the repo.
- Storage policies and bucket MIME limits need production verification.

### Storage and File Uploads

Strengths:

- Storage access is routed through server helpers and signed URLs.
- Child media requires image MIME types and size limits in code.
- Signed URL expirations are bounded.

Gaps:

- Storage setup script only provisions the child-media bucket with image-only MIME types.
- Document and message attachment helpers can use separate buckets, but default fallback can reuse `child-media`. This risks documents being blocked by image-only bucket rules or broadening a child-media bucket beyond intended use.
- Need malware scanning or at least file-type validation, extension normalization, content-disposition safety, and abuse monitoring for uploads.

### Stripe and Payment Security

Strengths:

- Stripe Checkout/Connect architecture is documented.
- Webhook route verifies signatures and has duplicate-event handling.
- Raw card/bank details should stay with Stripe.

Gaps:

- Live-mode Stripe go-live checklist evidence is incomplete.
- API version references need verification against the final Stripe account and SDK. The Stripe skill source identifies latest Stripe API version as `2026-02-25.clover`; local docs mention `STRIPE_ACCOUNTS_V2_API_VERSION=2026-06-24.dahlia`, which may be a separate Accounts v2 preview/version but must be explicitly confirmed.
- Refund, dispute, payout, negative balance, platform fee, receipt, and support ownership must be approved before broad parent payments.
- Payment disclosures and authorization language need legal approval.

### PII, Student, Staff, Medical, and Custody Data

The app processes high-sensitivity childcare data: child names, guardian details, attendance, media, incidents, immunization/medical/allergy notes, custody restrictions, staff records, billing details, and school operational records.

Release requirements:

- Minimum necessary access by role.
- Explicit support-access audit trail.
- No sensitive data in email unless secure path is provided.
- Retention and deletion policy implemented, not just documented.
- Medical/custody record edits require audit logging and school authority.
- Data exports/imports must preserve source evidence and support rollback.

## Legal Artifacts Created By This Audit

Drafts added for legal/product review:

- `docs/legal/PRIVACY_POLICY_DRAFT_2026-07-09.md`
- `docs/legal/TERMS_OF_SERVICE_DRAFT_2026-07-09.md`
- `docs/legal/EULA_DRAFT_2026-07-09.md`
- `docs/legal/DATA_AND_ACCOUNT_DELETION_WORKFLOW_2026-07-09.md`

These drafts are not legal approval. They should be reviewed by counsel before publication or App Store submission.

Required public URLs before submission:

| URL | Required status |
| --- | --- |
| `https://thebeesuite.io/privacy` | Public, final, counsel-approved |
| `https://thebeesuite.io/terms` | Public, final, counsel-approved |
| `https://thebeesuite.io/eula` | Public or App Store custom EULA, final, counsel-approved |
| `https://thebeesuite.io/support` | Public, with support contact, response expectations, privacy/deletion path |
| `https://thebeesuite.io/` | Marketing URL, optional but recommended |

## App Store Content

Use existing packet content unless Product chooses a brand change.

Paste-ready App Store Connect content is also available in `docs/APP_STORE_CONNECT_CONTENT_DRAFT_2026-07-09.md`.

| Field | Recommended value |
| --- | --- |
| App name | `BEE Suite Parent Portal` |
| Device display name | `BEE Suite` |
| Subtitle | `Childcare updates in one app` |
| Promotional text | `Parents can view child updates, school messages, documents, invoices, payments, photos, incident acknowledgements, and family requests from one secure portal.` |
| Primary category | Education |
| Secondary category | Productivity |
| Price | Free |
| Availability | United States for v1 |
| Made for Kids | No |
| Target devices | iPhone only for v1 |
| Minimum iOS | iOS 16.0 |
| Support URL | `https://thebeesuite.io/support` |
| Marketing URL | `https://thebeesuite.io/` |
| Privacy URL | `https://thebeesuite.io/privacy` |
| Keywords | `childcare,parent portal,daily reports,tuition,school messages,documents,photos,preschool` |
| What's New | `Initial iOS release for parent access to The BEE Suite parent portal.` |

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

### Screenshots Needed

Capture from the final native iOS build, not desktop browser screenshots.

Required set:

1. Parent dashboard with child summary and next action.
2. Daily report with meals, nap/activity, and teacher note.
3. Messages with center communication.
4. Documents/forms requiring upload, signature, or review.
5. Billing/invoice view with payment status.
6. Photos/media view with school-approved media.
7. Incident acknowledgement or notification preferences.

Required size strategy:

- Use iPhone 6.9 inch screenshots if possible, such as `1320 x 2868`, `1290 x 2796`, or `1260 x 2736`.
- If not using 6.9 inch screenshots, provide accepted 6.5 inch screenshots.
- Do not enable iPad support unless 13 inch iPad screenshots are ready.

### Preview Video Storyboard

Length target: 25-30 seconds. No real child data. Use fake demo records only.

| Time | Shot |
| --- | --- |
| 0-3s | Launch BEE Suite, secure parent login, branded school context |
| 3-7s | Parent dashboard showing linked child, today summary, and next action |
| 7-12s | Daily report showing meals, nap/activity, and teacher note |
| 12-16s | Messages thread with school communication |
| 16-20s | Documents or incident acknowledgement flow |
| 20-24s | Billing/invoice status and Stripe-hosted payment handoff if enabled |
| 24-30s | Notification preferences/support/privacy footer |

### Feature Graphics and Marketing Copy

Apple iOS does not require a Google Play-style feature graphic, but marketing assets should be prepared for launch:

- App Store screenshots with short captions.
- Website App Store badge section.
- Parent onboarding email graphic.
- Director launch handout showing parent app access.
- Support center article with login, password reset, privacy, payments, and school-contact rules.

## QA Release Checklist

### Manual QA

- [ ] Install final TestFlight build on a real iPhone.
- [ ] Cold launch, warm launch, login, logout, session expiry, password reset.
- [ ] Verify launch screen, offline screen, and failed network behavior.
- [ ] Confirm no unexpected permission prompt appears.
- [ ] Confirm camera/photo prompts only occur during upload paths.
- [ ] Confirm privacy/support/legal links open without authentication.

### Regression Testing

- [ ] Parent dashboard.
- [ ] Daily reports.
- [ ] Messages.
- [ ] Documents/upload/signature.
- [ ] Incident acknowledgements.
- [ ] Billing/invoices/payment history.
- [ ] Notification preferences.
- [ ] Contact change requests.
- [ ] Invite links and password reset links.
- [ ] Multi-child and multi-center family scenarios.

### Role Testing

- [ ] Parent guardian can only see linked family/child records.
- [ ] Authorized pickup access is limited and cannot see forbidden fields.
- [ ] Director can manage only assigned center scope.
- [ ] Assistant director permissions match approved policy.
- [ ] Teacher can only access assigned classroom/workflows.
- [ ] Billing role can access billing workflows without unrelated child/staff data.
- [ ] Executive/brand/regional access matches owner group and center scopes.
- [ ] Auditor role remains read-only.
- [ ] Deactivated users, inactive guardians, and removed access grants fail closed.

### Offline and Network Testing

- [ ] Airplane mode before launch.
- [ ] Network loss after login.
- [ ] Network loss during message send.
- [ ] Network loss during document upload.
- [ ] Network loss during Stripe handoff.
- [ ] Supabase outage simulation or controlled failure.
- [ ] Stripe webhook retry and duplicate-event test.
- [ ] Slow 3G/poor Wi-Fi parent portal loading.

### Payment Testing

- [ ] Stripe test-mode card success.
- [ ] Card decline.
- [ ] ACH or bank payment path if enabled.
- [ ] Payment method request link.
- [ ] Duplicate checkout/webhook event.
- [ ] Refund/dispute record.
- [ ] Connected account onboarding.
- [ ] Platform fee calculation.
- [ ] Receipt/support messaging.
- [ ] Legal payment authorization copy.

### Parent Testing

- [ ] First login with invite.
- [ ] Existing parent login.
- [ ] Password reset.
- [ ] Guardian with two children.
- [ ] Guardian across two centers if supported.
- [ ] Split custody/restricted pickup scenario.
- [ ] Parent with no open invoices.
- [ ] Parent with missing document request.
- [ ] Parent uploads image/PDF where allowed.
- [ ] Parent requests contact update.

### Director Testing

- [ ] Review parent messages.
- [ ] Approve/reject document submission.
- [ ] Edit family/child/staff records.
- [ ] Billing and payment support views.
- [ ] Classroom/attendance workflows.
- [ ] Compliance task and medical/custody notes.
- [ ] Export/report views.
- [ ] Support-access audit request.

### Executive Testing

- [ ] Multi-location dashboard.
- [ ] Owner group scoping.
- [ ] User creation and role assignment.
- [ ] Billing/payment setup.
- [ ] Brand/legal footer settings.
- [ ] Audit logs.
- [ ] Feature flags.
- [ ] Reports/export.

### Notification Testing

- [ ] In-app notification queue.
- [ ] Email notification if enabled.
- [ ] SMS notification if enabled.
- [ ] Opt-out/opt-in handling.
- [ ] Push notification disabled for v1 unless APNs is implemented.
- [ ] No notification leaks across families or centers.

### Import Testing

- [ ] ProCare family/child/guardian import.
- [ ] Staff/classroom import.
- [ ] Billing balance import.
- [ ] Attendance/history import where supported.
- [ ] Duplicate source rows.
- [ ] Missing required fields.
- [ ] Rollback/re-import.
- [ ] Imported custody/medical notes visibility.

### Performance Testing

- [ ] Parent dashboard load on LTE.
- [ ] Large media/document list.
- [ ] Large message thread.
- [ ] Billing view with many invoices.
- [ ] Executive analytics with multiple centers.
- [ ] WebView memory during 20-minute session.
- [ ] Battery profile during normal parent session.

### Accessibility Testing

- [ ] VoiceOver navigation for login, dashboard, messages, documents, billing.
- [ ] Dynamic Type text scaling.
- [ ] Contrast.
- [ ] Touch target sizes.
- [ ] Keyboard navigation where applicable.
- [ ] Error messages announced and visually clear.
- [ ] Form labels and required fields.
- [ ] Reduced motion.

## Missing Items Checklist

| ID | Missing item | Priority | Effort | Milestone |
| --- | --- | --- | --- | --- |
| GHA-001 | Finalize and publish legal documents | P0 | 3-7 days plus counsel | M1 |
| GHA-002 | Implement in-app account and data deletion request flow | P0 | 1-3 days | M1 - implemented in repo |
| GHA-003 | Complete App Privacy Nutrition Label inventory | P0 | 1-2 days | M1 |
| GHA-004 | Finalize COPPA/FERPA/DPA service-provider packet | P0 | 2-5 days plus counsel | M1 |
| GHA-005 | Build signed iOS archive and upload TestFlight build | P0 | 1-2 days | M2 |
| GHA-006 | Produce App Store screenshot and preview asset package | P0 | 1-2 days | M2 |
| GHA-007 | Verify App Review demo account and fake data | P0 | 0.5-1 day | M2 |
| GHA-008 | Run Supabase advisor/RLS/grants/storage verification | P0 | 1-2 days | M1 |
| GHA-009 | Add durable rate limiting for sensitive routes | P0 | 1-3 days | M1 - implemented for account/payment/privacy routes |
| GHA-010 | Complete crash/error monitoring evidence and alerting | P0 | 0.5-1 day after deploy | M1 - web/React reporting implemented in repo; native evidence/alerts pending |
| GHA-011 | Verify storage buckets, MIME limits, policies, signed URL rules | P0 | 1-2 days | M1 |
| GHA-012 | Complete Stripe live go-live and payment disclosure review | P0 | 1-3 days | M1 |
| GHA-013 | Finalize support operations/SLA for App Store support URL | P0 | 0.5-1 day | M1 |
| GHA-014 | Complete export compliance plist/App Store decision | P0 | 0.5 day | M2 - plist implemented; ASC answer pending |
| GHA-015 | Implement or remove Face ID declaration | P0 | 0.5-2 days | M2 - resolved by removal |
| GHA-016 | Harden native app against Guideline 4.2 rejection risk | P1 | 2-5 days | M2 |
| GHA-017 | Complete SDK/privacy manifest/vendor inventory | P1 | 0.5-1 day | M1 - app privacy manifest implemented; Xcode privacy report/vendor reconciliation pending |
| GHA-018 | Accessibility audit and remediation | P1 | 2-5 days | M2 |
| GHA-019 | Performance, battery, and memory profiling | P1 | 1-3 days | M2 |
| GHA-020 | Offline/network failure regression suite | P1 | 1-2 days | M2 |
| GHA-021 | Backup/restore drill and evidence packet | P1 | 1-2 days | M1 |
| GHA-022 | MFA decision and implementation for privileged roles | P1 | 2-5 days | M3 |
| GHA-023 | Logging retention/access/redaction review | P1 | 1-2 days | M1 |
| GHA-024 | Incident response and App Review support runbook | P1 | 0.5-1 day | M2 |
| GHA-025 | Age rating, UGC, Kids category, and review-answer worksheet | P1 | 0.5-1 day | M2 |
| GHA-026 | Push notification decision and entitlement cleanup | P1 | 0.5-3 days | M3 |
| GHA-027 | Universal/deep link decision for invite/password reset links | P2 | 1-3 days | M3 |
| GHA-028 | Production env provenance and secret rotation audit | P1 | 1 day | M1 |
| GHA-029 | File upload abuse-case/security tests | P1 | 1-3 days | M2 |
| GHA-030 | Import validation and rollback test evidence | P1 | 1-2 days | M2 |
| GHA-031 | Publish `/terms` and `/eula` routes | P0 | 0.5-1 day after legal approval | M1 - implemented in repo; legal approval/deploy pending |
| GHA-032 | Post-launch monitoring dashboard and release train | P2 | 1-2 days | M4 |

Full issue drafts are in `docs/GITHUB_ISSUES_APP_STORE_RELEASE_2026-07-09.md`.

## Step-By-Step Implementation Plan

1. Freeze v1 scope.
   - Parent app only.
   - iPhone only.
   - No push unless APNs is complete.
   - No Face ID unless real biometric lock is complete.
   - No child self-service accounts.

2. Close legal and privacy blockers.
   - Review drafts in `docs/legal`.
   - Counsel approves public Privacy Policy, Terms, EULA, deletion workflow, COPPA/FERPA/DPA language, and payment disclosures.
   - Publish `/privacy`, `/terms`, `/eula`, `/support`, and deletion instructions.
   - Complete App Privacy Nutrition Label worksheet.

3. Close security blockers.
   - Add durable rate limiting.
   - Run Supabase advisor and add hardening migration if any table/bucket is flagged.
   - Verify storage buckets and signed URL policies.
   - Deploy and verify crash/error monitoring.
   - Review log retention and sensitive endpoint sampling.
   - Verify Stripe live-mode readiness.

4. Close native iOS blockers.
   - Decide Face ID implement/remove.
   - Complete export compliance plist/App Store Connect answers.
   - Open Xcode on macOS, set Team ID, signing, version/build, iPhone-only, bundle ID.
   - Build on real iPhone.
   - Upload TestFlight build.

5. Build App Store asset package.
   - Create fake-data demo account and screenshots.
   - Capture final native screenshots.
   - Produce preview video if Product wants one.
   - Finalize description, subtitle, keywords, support URL, privacy URL, age rating, export compliance, and review notes.

6. Run release-candidate QA.
   - TestFlight smoke on real iPhone.
   - Parent, director, executive, billing, and support role regression.
   - Offline/network/payment/upload/accessibility/performance tests.
   - Record evidence and sign-offs.

7. Submit to Apple.
   - Confirm backend and demo account will stay live during review.
   - Submit build from TestFlight to App Review.
   - Staff review support during business hours until approved.
   - Rotate demo password after review.

8. Launch and monitor.
   - Release to phased or manual launch.
   - Watch logs, crash monitoring, auth, Stripe webhooks, Supabase errors, support inbox, and App Store reviews.
   - Run 24-hour, 7-day, and 30-day post-launch checks.

## Release Milestones

| Milestone | Exit criteria |
| --- | --- |
| M0 - Audit complete | This audit, legal drafts, deletion workflow, and issue backlog are committed or approved for tracking. |
| M1 - Legal/security gate | Legal docs approved, App Privacy inventory complete, deletion workflow implemented, Supabase/storage/rate-limit/Stripe/monitoring blockers closed. |
| M2 - Native TestFlight candidate | Signed iOS archive uploaded, TestFlight installed on real device, screenshots captured, demo account verified. |
| M3 - App Review candidate | Full QA sign-off, age rating/export/privacy/review answers complete, support staffed, backend live. |
| M4 - App Store approval and controlled release | Apple approval received, phased/manual release decision made, post-launch monitoring active. |
| M5 - Enterprise launch readiness | DPA packet, onboarding/support SLAs, incident response, backup drills, enterprise security packet, and customer rollout playbook complete. |

## Final App Store Submission Checklist

- [ ] Apple Developer Program account active.
- [ ] Team ID selected in Xcode.
- [ ] Bundle ID `com.brunerdigital.thebeesuite.parent` registered.
- [ ] App Store Connect app record created.
- [ ] Version `1.0.0`, build `1` or final release numbering confirmed.
- [ ] iPhone-only support confirmed unless iPad screenshots are ready.
- [ ] App icon no-alpha 1024 PNG uploaded.
- [ ] Native build uploaded to TestFlight.
- [ ] TestFlight build installed and smoke-tested on a real iPhone.
- [ ] Demo account works and contains fake data only.
- [ ] Review notes entered with login instructions and payment explanation.
- [ ] Privacy Policy URL public and approved.
- [ ] Terms/EULA public or attached and approved.
- [ ] Support URL public and staffed.
- [ ] In-app account deletion request flow available.
- [ ] App Privacy Nutrition Labels completed.
- [ ] Age rating questionnaire completed.
- [ ] Export compliance completed.
- [ ] Payments/IAP position documented.
- [ ] Screenshots uploaded at accepted iPhone sizes.
- [ ] Promotional text, subtitle, keywords, description, and what's new entered.
- [ ] No unused native permissions are declared.
- [ ] Supabase advisor/RLS/storage evidence filed.
- [ ] Stripe live readiness evidence filed.
- [ ] Crash/error monitoring deployed, verified, and alert owner assigned.
- [ ] Durable rate limiting active.
- [ ] Accessibility smoke passed.
- [ ] Offline/network/payment/upload regression passed.
- [ ] Support team is ready during review.
- [ ] Demo password rotation task scheduled after review.

## Source References

- Apple App Review Guidelines: https://developer.apple.com/app-store/review/guidelines/
- Apple App Privacy Details: https://developer.apple.com/app-store/app-privacy-details/
- Apple Account Deletion Guidance: https://developer.apple.com/support/offering-account-deletion-in-your-app/
- Apple Age Rating: https://developer.apple.com/help/app-store-connect/manage-app-information/set-an-app-age-rating/
- Apple Encryption/Export Compliance: https://developer.apple.com/help/app-store-connect/manage-app-information/determine-and-upload-app-encryption-documentation
- Apple User Privacy and Data Use: https://developer.apple.com/app-store/user-privacy-and-data-use/
- FTC COPPA Rule: https://www.ftc.gov/legal-library/browse/rules/childrens-online-privacy-protection-rule-coppa
- eCFR COPPA Rule Text: https://www.ecfr.gov/current/title-16/chapter-I/subchapter-C/part-312
- U.S. Student Privacy Policy Office FERPA Overview: https://studentprivacy.ed.gov/ferpa
- Supabase API Security: https://supabase.com/docs/guides/api/securing-your-api
- Supabase Production Security: https://supabase.com/docs/guides/security/product-security
- Supabase Changelog: https://supabase.com/changelog
- Stripe Go-Live Checklist: https://docs.stripe.com/get-started/checklist/go-live
- Stripe Security Guide: https://docs.stripe.com/security/guide.md
