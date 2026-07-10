# GitHub Issues - App Store Release Backlog

Created: July 9, 2026  
Scope: The BEE Suite Parent Portal iOS App Store readiness and enterprise production hardening.

Use these as issue bodies in GitHub. Priorities:

- P0: blocks App Store submission.
- P1: should be completed before public release or first broad customer rollout.
- P2: planned shortly after approval unless Product pulls it into v1.

## Implementation Status Update - July 9, 2026

Completed in repository:

- Issue 2: parent portal account deletion request flow implemented with durable request records, audit log, director notification, and retention notice.
- Issue 9: database-backed rate limiting implemented for login, forgot password, forced password reset, profile password update, parent setup, payment method request session, and privacy deletion request.
- Issue 10: web/React runtime error reporting implemented through `/api/system/client-error-reports` with privacy-safe redaction, same-origin checks, durable rate limiting, and RLS-enabled `ClientErrorReport` aggregation.
- Issue 14: `ITSAppUsesNonExemptEncryption=false` added for the standard-encryption exemption path, pending App Store Connect confirmation.
- Issue 15: unused Face ID permission string removed.
- Issue 17: app-level `PrivacyInfo.xcprivacy` added to the iOS target resources with tracking disabled and conservative collection declarations.
- Issue 31: `/terms` and `/eula` routes implemented and linked from public legal/support pages.

Still required before closing those issues fully:

- Apply database migrations in production.
- Deploy the updated web app.
- Verify the parent deletion flow in production/TestFlight.
- Verify client error report creation from a TestFlight/WebView session and assign alert ownership.
- Decide whether App Store Connect/TestFlight native crash reports are sufficient for the minimal Capacitor shell or add a native crash SDK before public rollout.
- Generate Xcode's privacy report from the final archive and reconcile it with App Store Connect privacy labels.
- Obtain owner/counsel approval for legal content.
- Complete App Store Connect export compliance answers.

## 1. [P0] Finalize and publish public legal documents

Labels: `p0`, `legal`, `privacy`, `app-store`  
Milestone: `M1 - Legal/Security Gate`  
Effort: 3-7 business days plus counsel queue

Body:

Finalize Privacy Policy, Terms of Service, EULA, payment disclosures, support terms, COPPA/FERPA language, and public legal/contact details for App Store submission.

Acceptance criteria:

- Counsel approves public Privacy Policy.
- Counsel approves Terms of Service.
- Counsel approves EULA or confirms Apple standard EULA is acceptable.
- Payment authorization/refund/dispute/support language is approved.
- COPPA/FERPA/DPA/service-provider language is approved.
- Public legal business name, mailing address, support email, support phone or support process, and effective dates are inserted.
- `/privacy`, `/terms`, `/eula`, and `/support` are public and reachable without login.

## 2. [P0] Implement in-app account and data deletion request flow

Labels: `p0`, `privacy`, `ios`, `backend`, `app-store`  
Milestone: `M1 - Legal/Security Gate`  
Effort: 1-3 days

Body:

Apple requires account-creation apps to let users initiate deletion in the app. Add a parent-accessible deletion request workflow with verification, audit trail, school/customer review, and retention explanation.

Acceptance criteria:

- Parent portal has `Settings > Privacy and Account > Request account deletion`.
- Authenticated API creates deletion request record.
- Request includes user, family, center, status, timestamps, source, and audit metadata.
- User verifies request through recent reauthentication or email confirmation.
- Support/admin queue can review and update status.
- User-visible copy explains legal/school retention limits.
- Sessions/device sessions are expired when account deletion is approved.
- QA verifies request creation, verification, status changes, and retained-record messaging.

## 3. [P0] Complete App Privacy Nutrition Label inventory

Labels: `p0`, `privacy`, `app-store`, `security`  
Milestone: `M1 - Legal/Security Gate`  
Effort: 1-2 days

Body:

Produce final App Store Connect privacy answers based on actual production data collection and SDK/vendor behavior.

Acceptance criteria:

- Inventory includes Supabase, Vercel, Stripe, Twilio, SendGrid, Google, analytics, crash reporting if added, and AI vendors if enabled.
- Data categories are mapped to Apple labels: contact info, identifiers, user content, financial info, purchase history, usage data, diagnostics, sensitive info.
- Tracking decision is documented. No IDFA/tracking unless explicitly approved.
- Product, security, and legal sign off on final App Store Connect answers.

## 4. [P0] Finalize COPPA/FERPA/DPA service-provider packet

Labels: `p0`, `legal`, `privacy`, `enterprise`  
Milestone: `M1 - Legal/Security Gate`  
Effort: 2-5 days plus counsel queue

Body:

Create the customer-facing childcare privacy packet covering COPPA, FERPA where applicable, school service provider terms, DPA, parent consent support, retention, deletion, and subprocessors.

Acceptance criteria:

- Counsel-approved COPPA position for child records under 13.
- FERPA/school official or service provider language approved where applicable.
- DPA/subprocessor list exists.
- Parent/school consent responsibilities are documented.
- Retention and deletion exceptions are documented.
- Enterprise sales/support can provide the packet to prospective schools.

## 5. [P0] Build signed iOS archive and upload TestFlight build

Labels: `p0`, `ios`, `release`, `app-store`  
Milestone: `M2 - Native TestFlight Candidate`  
Effort: 1-2 days

Body:

Open the Capacitor iOS project on macOS, configure Apple signing, archive the app, and upload a build to TestFlight.

Acceptance criteria:

- Apple Developer Team ID selected in Xcode.
- Bundle ID is `com.brunerdigital.thebeesuite.parent`.
- Version/build numbers are final for v1.
- Target devices remain iPhone-only unless iPad assets are ready.
- Archive succeeds.
- Upload to App Store Connect/TestFlight succeeds.
- TestFlight build installs on a real iPhone.

## 6. [P0] Produce App Store screenshot and preview asset package

Labels: `p0`, `design`, `qa`, `app-store`  
Milestone: `M2 - Native TestFlight Candidate`  
Effort: 1-2 days

Body:

Capture final screenshots from the native iOS build using fake/demo data only.

Acceptance criteria:

- Screenshots captured at accepted iPhone sizes.
- Set includes dashboard, daily report, messages, documents, billing, photos/media, and incident/preferences.
- No real child, family, payment, staff, or school-sensitive data appears.
- Captions match final product behavior.
- Optional preview video storyboard is approved or explicitly deferred.

## 7. [P0] Verify App Review demo account and fake data

Labels: `p0`, `qa`, `release`, `app-store`  
Milestone: `M2 - Native TestFlight Candidate`  
Effort: 0.5-1 day

Body:

Confirm Apple reviewers can log in and exercise meaningful parent workflows without touching real production data.

Acceptance criteria:

- Demo account email and temporary password are stored outside git.
- Demo account uses fake family, child, document, message, billing, and media data.
- TestFlight build login succeeds.
- Parent portal returns expected dashboard and child data.
- Non-destructive workflows can be exercised.
- Review notes include exact login steps.
- Password rotation task is scheduled after review.

## 8. [P0] Run Supabase advisor, RLS, grants, and storage verification

Labels: `p0`, `security`, `supabase`, `database`  
Milestone: `M1 - Legal/Security Gate`  
Effort: 1-2 days

Body:

Verify live production Supabase security against current Supabase grant/RLS behavior and fix any flagged tables, functions, policies, or storage buckets.

Acceptance criteria:

- Supabase advisor report is run against production.
- All exposed public tables have RLS enabled or are deliberately removed from exposure.
- `anon` and `authenticated` grants are explicit and minimal.
- Post-hardening tables are reviewed and hardened.
- Storage buckets are private unless deliberately public.
- Service-role-only policies are documented where applicable.
- Evidence report is stored in release packet.

## 9. [P0] Add durable rate limiting for sensitive routes

Labels: `p0`, `security`, `backend`  
Milestone: `M1 - Legal/Security Gate`  
Effort: 1-3 days

Body:

Replace in-memory rate limiting on sensitive endpoints with a shared durable store appropriate for Vercel/production scaling.

Acceptance criteria:

- Login, password reset, invite, deletion request, payment link, support/contact, and upload endpoints have durable rate limits.
- Limits are per IP and per account/email where appropriate.
- Lockout/error responses are safe and do not leak account existence.
- Tests cover allowed, limited, and reset-window behavior.
- Metrics/logging exist for rate-limit events.

## 10. [P0] Add production crash and error monitoring

Labels: `p0`, `observability`, `ios`, `frontend`, `backend`  
Milestone: `M1 - Legal/Security Gate`  
Effort: 1-2 days

Body:

Add production-grade crash/error monitoring for the web app and iOS shell, with privacy-safe scrubbing.

Implementation status:

- Web/WebView JavaScript runtime errors, unhandled promise rejections, and React error boundaries are implemented in repository.
- Reports post to `/api/system/client-error-reports`.
- Reports are redacted, same-origin checked, rate limited, deduped, and stored in the RLS-enabled `ClientErrorReport` table.
- `/api/system/readiness` verifies the reporting table is queryable.
- Remaining: deploy migration/app, verify in TestFlight, assign alert owner, and document native shell crash evidence or add native SDK.

Acceptance criteria:

- Web runtime errors are captured.
- API/server errors are captured.
- Native iOS shell crashes are captured or a decision is documented if deferred.
- PII/child/payment fields are scrubbed.
- Alerts route to an owner.
- App Privacy labels and Privacy Policy reflect diagnostics collection.

## 11. [P0] Verify storage buckets, MIME limits, policies, and signed URLs

Labels: `p0`, `security`, `supabase`, `uploads`  
Milestone: `M1 - Legal/Security Gate`  
Effort: 1-2 days

Body:

Confirm production file storage separates child media, documents, message attachments, and profile photos with correct private bucket policies and upload rules.

Acceptance criteria:

- Buckets are private.
- Child media accepts only intended image types and size limits.
- Documents accept only approved document/image types and size limits.
- Message attachments accept only approved types and size limits.
- Signed URL expirations are bounded and tested.
- Uploads cannot cross tenant/family/center scope.
- Storage setup script and env vars match production buckets.

## 12. [P0] Complete Stripe live go-live and payment disclosure review

Labels: `p0`, `payments`, `stripe`, `legal`, `qa`  
Milestone: `M1 - Legal/Security Gate`  
Effort: 1-3 days

Body:

Complete Stripe live-mode readiness, legal payment disclosures, and support ownership before broad parent payments.

Acceptance criteria:

- Live API keys and webhook secrets are configured only in secure env.
- Webhook endpoint receives and verifies live events.
- Checkout success, decline, duplicate event, refund, dispute, and receipt paths are tested.
- Connected account onboarding and payout support are verified.
- Stripe API version and local env references are reconciled.
- Parent payment authorization, refund, fee, and support copy is approved.
- App Review notes explain payments are for services/goods consumed outside the app.

## 13. [P0] Finalize support operations and support URL

Labels: `p0`, `support`, `app-store`, `operations`  
Milestone: `M1 - Legal/Security Gate`  
Effort: 0.5-1 day

Body:

Make support URL App Store-ready and operationally staffed.

Acceptance criteria:

- Support page includes support email, response expectations, and urgent-school-contact guidance.
- Support inbox is monitored during App Review.
- Support escalation guide covers privacy, payment, account deletion, login, uploads, and school-controlled record issues.
- Support team knows how to handle Apple reviewer issues.
- Sensitive data handling instructions are visible.

## 14. [P0] Complete export compliance plist and App Store Connect decision

Labels: `p0`, `ios`, `release`, `security`, `app-store`  
Milestone: `M2 - Native TestFlight Candidate`  
Effort: 0.5 day

Body:

Complete encryption/export compliance based on the final native build and add the correct plist key if the standard exemption applies.

Acceptance criteria:

- Final build encryption use is reviewed.
- App Store Connect export compliance answers are documented.
- `ITSAppUsesNonExemptEncryption` is added with the correct value if applicable.
- Release manager signs off before upload/submission.

## 15. [P0] Implement or remove Face ID declaration

Labels: `p0`, `ios`, `privacy`, `app-store`  
Milestone: `M2 - Native TestFlight Candidate`  
Effort: 0.5-2 days

Body:

`NSFaceIDUsageDescription` is present, but no implemented biometric lock was found. Implement the feature or remove the permission string before submission.

Acceptance criteria:

- If implemented: Face ID/Touch ID app lock works on reopen and after timeout.
- If implemented: fallback passcode/session behavior works.
- If removed: plist no longer declares Face ID usage.
- App Privacy and screenshots do not claim unavailable biometric behavior.
- QA verifies no unexpected permission prompt occurs.

## 16. [P1] Harden native app against App Review Guideline 4.2 risk

Labels: `p1`, `ios`, `app-store`, `product`  
Milestone: `M2 - Native TestFlight Candidate`  
Effort: 2-5 days

Body:

Reduce risk that Apple views the app as a thin web wrapper.

Acceptance criteria:

- Native launch/offline/session-expired states are polished.
- Native shell handles back/reload/error states predictably.
- Parent workflows feel app-like on iPhone.
- Review notes explain secure invitation-based parent portal functionality.
- If feasible, add native biometric lock, native file picker affordance, or native navigation.

## 17. [P1] Complete SDK privacy manifest and vendor inventory

Labels: `p1`, `privacy`, `security`, `app-store`  
Milestone: `M1 - Legal/Security Gate`  
Effort: 1-2 days

Body:

Inventory all SDKs and service providers used by the web/native app and document privacy/data collection behavior.

Implementation status:

- App-level `ios/App/App/PrivacyInfo.xcprivacy` is included in the iOS target resources.
- Manifest declares tracking as false and no tracking domains.
- Manifest conservatively declares contact info, identifiers, user content, financial/payment records, sensitive childcare records, product interaction, crash data, and performance data.
- Remaining: archive in Xcode, generate the privacy report, confirm third-party SDK manifests, and reconcile final labels in App Store Connect.

Acceptance criteria:

- Native SDK list is complete.
- Web SDK/vendor list is complete.
- Required privacy manifests are present where applicable.
- Vendor list maps to Privacy Policy and App Privacy labels.
- Tracking/fingerprinting review is complete.

## 18. [P1] Accessibility audit and remediation

Labels: `p1`, `qa`, `accessibility`, `frontend`, `ios`  
Milestone: `M2 - Native TestFlight Candidate`  
Effort: 2-5 days

Body:

Run accessibility QA for critical parent and admin workflows before public release.

Acceptance criteria:

- VoiceOver smoke passes for login, dashboard, messages, documents, billing, and support/legal pages.
- Dynamic Type does not break critical screens.
- Contrast and touch targets pass.
- Forms have labels and clear errors.
- Fixes are implemented or tracked with release decision.

## 19. [P1] Performance, battery, and memory profiling

Labels: `p1`, `qa`, `performance`, `ios`, `frontend`  
Milestone: `M2 - Native TestFlight Candidate`  
Effort: 1-3 days

Body:

Verify parent portal performance and WebView resource behavior on real iPhone hardware.

Acceptance criteria:

- Parent dashboard load time measured on Wi-Fi and LTE.
- Large media/document/message/billing views are profiled.
- 20-minute session memory behavior is acceptable.
- Battery impact is checked for normal parent session.
- Major issues are fixed or documented.

## 20. [P1] Offline and network failure regression suite

Labels: `p1`, `qa`, `offline`, `ios`, `frontend`  
Milestone: `M2 - Native TestFlight Candidate`  
Effort: 1-2 days

Body:

Test degraded network cases likely to occur in childcare pickup/dropoff environments.

Acceptance criteria:

- Airplane mode before launch shows expected state.
- Network loss after login is handled.
- Message, upload, document, and billing network failures show safe retry/error behavior.
- Auth expiry under poor network is handled.
- No duplicate payments or duplicate message sends occur.

## 21. [P1] Backup and restore drill evidence packet

Labels: `p1`, `security`, `operations`, `database`  
Milestone: `M1 - Legal/Security Gate`  
Effort: 1-2 days

Body:

Produce evidence that production childcare data can be restored within an acceptable operational window.

Acceptance criteria:

- Backup schedule is documented.
- Restore drill is run in non-production environment.
- RTO/RPO are documented.
- Data integrity checks pass.
- Owner signs off on residual risk.

## 22. [P1] MFA decision and privileged-role protection

Labels: `p1`, `security`, `auth`, `enterprise`  
Milestone: `M3 - App Review Candidate`  
Effort: 2-5 days

Body:

Decide and implement MFA or compensating controls for executive, admin, director, billing, and support users.

Acceptance criteria:

- MFA policy is documented.
- Privileged roles are covered or a risk acceptance is signed.
- Recovery process is documented.
- QA verifies privileged login and recovery behavior.

## 23. [P1] Logging retention, access, and redaction review

Labels: `p1`, `security`, `privacy`, `observability`  
Milestone: `M1 - Legal/Security Gate`  
Effort: 1-2 days

Body:

Review request/response logging, operational logs, vendor logs, retention windows, access controls, and redaction for childcare-sensitive records.

Acceptance criteria:

- Sensitive fields and patterns are redacted.
- High-sensitivity endpoints are reviewed for body sampling.
- Log retention windows are documented.
- Log access is restricted.
- Privacy Policy reflects diagnostics/log collection.

## 24. [P1] Incident response and App Review support runbook

Labels: `p1`, `operations`, `support`, `release`  
Milestone: `M2 - Native TestFlight Candidate`  
Effort: 0.5-1 day

Body:

Create the operational runbook for App Review week and first public launch week.

Acceptance criteria:

- App Review support owner and backup are assigned.
- Support inbox monitoring schedule exists.
- Escalation paths for login, payments, privacy, crash, and data-access issues are documented.
- Apple rejection response process is documented.
- Demo password rotation is scheduled.

## 25. [P1] Age rating, UGC, Kids category, and review-answer worksheet

Labels: `p1`, `app-store`, `product`, `legal`  
Milestone: `M2 - Native TestFlight Candidate`  
Effort: 0.5-1 day

Body:

Prepare final App Store Connect questionnaire answers.

Acceptance criteria:

- Age rating answers reflect final build.
- Made for Kids is set to No unless product/legal explicitly changes strategy.
- User-generated content/private messaging answer is documented.
- Payment/IAP answers are documented.
- Legal/product approve final questionnaire answers.

## 26. [P1] Push notification decision and entitlement cleanup

Labels: `p1`, `ios`, `notifications`, `app-store`  
Milestone: `M3 - App Review Candidate`  
Effort: 0.5-3 days

Body:

Decide whether APNs push is in v1. If not, ensure the entitlement and marketing copy do not imply native push support.

Acceptance criteria:

- Product decision recorded.
- If deferred: no push entitlement, no push App Store claim, no permission prompt.
- If included: APNs configured, token registration works, notification privacy reviewed, opt-in/out tested.

## 27. [P2] Universal/deep link decision for invite and password reset links

Labels: `p2`, `ios`, `product`, `app-store`  
Milestone: `M3 - App Review Candidate`  
Effort: 1-3 days

Body:

Decide whether invite/password reset links should open the iOS app via universal links.

Acceptance criteria:

- Product decision recorded.
- If implemented: associated domains are configured and tested.
- Invite, password reset, and parent portal deep links route correctly.
- If deferred: email copy and support docs clearly use web fallback.

## 28. [P1] Production environment provenance and secret rotation audit

Labels: `p1`, `security`, `devops`, `release`  
Milestone: `M1 - Legal/Security Gate`  
Effort: 1 day

Body:

Verify production environment variables, secret owners, rotation schedule, and access scope before App Store release.

Acceptance criteria:

- Vercel production env variables are inventoried by name and owner without exposing values.
- Supabase, Stripe, Twilio, SendGrid, Google, OpenAI/AI, Turnstile, cron, and app secrets are accounted for.
- Unused secrets are removed.
- Shared/pilot secrets are rotated if needed.
- Access to production env values is limited.

## 29. [P1] File upload abuse-case and security tests

Labels: `p1`, `security`, `uploads`, `qa`  
Milestone: `M2 - Native TestFlight Candidate`  
Effort: 1-3 days

Body:

Test upload paths for malicious, oversized, cross-tenant, unsupported, and sensitive file cases.

Acceptance criteria:

- Unsupported MIME types are rejected.
- Oversized files are rejected.
- Extension/content-type mismatch is handled.
- Cross-tenant object access fails.
- Signed URLs expire.
- Uploaded files use safe names/content disposition.
- Malware scanning or compensating control decision is documented.

## 30. [P1] Import validation and rollback test evidence

Labels: `p1`, `qa`, `data-import`, `operations`  
Milestone: `M2 - Native TestFlight Candidate`  
Effort: 1-2 days

Body:

Verify import workflows used for childcare migration at enterprise scale.

Acceptance criteria:

- ProCare family/child/guardian import test passes.
- Staff/classroom import test passes.
- Billing balance import test passes where supported.
- Duplicate/missing-field cases are handled.
- Rollback/re-import process is documented.
- Custody/medical data visibility is validated after import.

## 31. [P0] Publish `/terms` and `/eula` routes

Labels: `p0`, `frontend`, `legal`, `app-store`  
Milestone: `M1 - Legal/Security Gate`  
Effort: 0.5-1 day after legal approval

Body:

Add public Terms and EULA routes to match App Store and enterprise legal requirements.

Acceptance criteria:

- `/terms` is public and reachable without login.
- `/eula` is public and reachable without login, unless App Store custom EULA is attached only in App Store Connect and legal approves that route.
- Footer/settings/support link to Privacy, Terms, EULA, and Support.
- Pages use counsel-approved content.

## 32. [P2] Post-launch monitoring dashboard and release train

Labels: `p2`, `operations`, `observability`, `release`  
Milestone: `M4 - App Store Approval and Controlled Release`  
Effort: 1-2 days

Body:

Create a post-launch dashboard and release cadence for App Store launch.

Acceptance criteria:

- Dashboard covers auth failures, API errors, Stripe webhook failures, Supabase errors, crash/error rate, upload failures, support tickets, and App Store reviews.
- 24-hour, 7-day, and 30-day launch review checkpoints are scheduled.
- Release owner and rollback/escalation path are documented.

## 33. [P2] Marketing and parent onboarding launch packet

Labels: `p2`, `marketing`, `support`, `product`  
Milestone: `M4 - App Store Approval and Controlled Release`  
Effort: 1-2 days

Body:

Prepare parent-facing launch materials for schools adopting the iOS app.

Acceptance criteria:

- Parent invite email template includes App Store badge/link.
- Director handout explains parent app setup and support path.
- FAQ covers login, password reset, payments, documents, privacy, deletion, and school contact.
- Marketing page references the iOS app after approval.

## 34. [P3] Localization and broader market preparation

Labels: `p3`, `product`, `accessibility`, `enterprise`  
Milestone: `M5 - Enterprise Launch Readiness`  
Effort: TBD

Body:

Plan localization and broader market requirements after U.S. v1 release.

Acceptance criteria:

- Spanish-language parent portal/support/legal localization scope is estimated.
- State-specific childcare retention/payment notice needs are mapped.
- Product decides whether localization is required for next major rollout.
