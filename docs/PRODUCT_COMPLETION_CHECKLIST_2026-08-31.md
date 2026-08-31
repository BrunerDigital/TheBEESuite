# The BEE Suite Master Product Completion Checklist

Date: August 31, 2026  
Purpose: one evidence-based backlog organized by user type and feature category.

This is a discovery checklist, not a production activation record. A checked-in feature can still need school configuration, provider setup, credentialed verification, training, or explicit business approval.

## How to use this checklist

Each item starts with the kind of work it needs:

- **FIX**: current behavior or data is wrong.
- **FINISH**: a built workflow still has incomplete coverage.
- **CONFIGURE**: code exists, but a school, provider, environment, or owner must be set up.
- **ADD**: a missing capability should be built.
- **VERIFY**: prove the real flow with the correct role, school, device, data, and provider outcome.
- **DECIDE**: an authorized owner must choose policy, scope, timing, or activation.

Priority:

- **P0**: safety, isolation, money, identity, or launch blocker.
- **P1**: required for dependable daily operation.
- **P2**: important completeness or scale work.
- **P3**: enhancement after the core operating system is proven.

Completion evidence must be attached to the item: school/tenant, role, test or screenshot, provider outcome where relevant, date, owner, and any intentionally held-off module.

## Current technical baseline

- [x] Ten application roles are defined: platform owner, brand admin, regional manager, center director, assistant director, teacher, billing admin, parent/guardian, authorized pickup, and read-only auditor.
- [x] The repository exposes the major childcare workflows through role-scoped pages and more than 100 API routes.
- [x] Local automated suite passed on August 31, 2026: 1,432 passed, 0 failed.
- [ ] **VERIFY P0** Re-run the production gate from a clean worktree at current `origin/main`; this checkout was one commit behind during this audit.
- [ ] **VERIFY P0** Run credentialed production smoke tests for every role against two schools and prove cross-school, cross-family, and read-only isolation.
- [ ] **VERIFY P0** Record a current production deployment, canonical alias, `/api/health`, runtime-log, and changed-flow evidence packet after the next release.

## Platform owner

### Platform, tenants, brands, and locations

- [ ] **FINISH P1** Add a complete owner-group/franchisee workspace for operators who own multiple locations inside a larger brand.
- [ ] **FINISH P1** Add actual logo, favicon, and brand-asset upload, preview, replacement, and rollback flows; current controls primarily store references and settings.
- [ ] **FINISH P1** Complete custom-domain lifecycle: DNS validation, ownership proof, activation, Vercel binding, certificate verification, renewal/failure handling, and removal.
- [ ] **VERIFY P0** Prove tenant, brand, owner-group, center, classroom, family, and child grants fail closed with two-tenant fixtures and credentialed production accounts.
- [ ] **DECIDE P2** Define whether support impersonation will ever be allowed. If yes, require time-limited approval, visible session banner, reason, audit trail, revocation, and no silent access.
- [ ] **ADD P2** Add granular permission profiles only if the ten roles plus scoped grants cannot express a real customer need; avoid a second permission system without an approved model.
- [ ] **VERIFY P1** Test archive/restore behavior for locations and users without deleting financial, attendance, message, or audit history.

### Executive administration and identity

- [ ] **ADD P0** Add MFA enrollment, recovery, enforcement policy, and administrator evidence for platform, brand, regional, director, billing, and auditor roles.
- [ ] **FINISH P1** Add a first-class staff/executive invitation workflow with expiring setup links, delivery state, resend controls, accepted state, and recovery; do not rely only on administrator-created credentials.
- [ ] **VERIFY P0** Reconcile Prisma users, Supabase Auth identities, active access grants, staff profiles, and device sessions as separate records for every active operator.
- [ ] **VERIFY P1** Exercise create, edit, archive, password recovery, force-reset, logout-all-devices, and access-grant replacement from the executive UI.
- [ ] **CONFIGURE P1** Create dedicated non-personal smoke accounts for every role and at least two schools; store credentials in an approved secret manager.
- [ ] **VERIFY P1** Confirm read-only auditors cannot mutate through UI, API, direct object URLs, bulk actions, exports, or AI commands.

### Platform reliability, security, and recovery

- [ ] **CONFIGURE P0** Establish a staging environment isolated from production data and provider sends.
- [ ] **CONFIGURE P0** Enable application error monitoring, uptime checks, alert routing, on-call owner, backup owner, and tested escalation targets.
- [ ] **VERIFY P0** Run a fresh Supabase security-advisor and schema/RLS review after the latest migrations; reconcile Prisma and Supabase migration ledgers.
- [ ] **VERIFY P0** Complete credentialed two-school security evidence for every sensitive role and endpoint class.
- [ ] **VERIFY P0** Audit rate limiting across every public and sensitive mutation route, not only the currently covered login, setup, survey, and kiosk paths.
- [ ] **VERIFY P0** Test CSP and every required external allowlist without weakening script, frame, media, or connection policy.
- [ ] **CONFIGURE P0** Put production database and private Storage backups on an approved encrypted, versioned, off-platform schedule.
- [ ] **VERIFY P0** Run and document database plus Storage restore drills in a safe environment, including relationships, private media, hashes, and rollback timing.
- [ ] **CONFIGURE P1** Name a second human technical/recovery owner and confirm after-hours coverage.
- [ ] **VERIFY P1** Exercise cron authentication, schedules, retry behavior, deduplication, stale-job handling, and alerts for every scheduled route.
- [ ] **VERIFY P1** Run load and connection-pool tests for multi-school dashboard, messaging, billing, teacher, and parent traffic.
- [ ] **VERIFY P1** Test degraded-mode recovery for Supabase, Stripe, SendGrid, Twilio, storage, and stale installed-app caches.
- [ ] **DECIDE P0** Rotate any secret ever exposed outside the approved secret store and retain only redacted evidence.

### Platform billing and commercial operations

- [ ] **DECIDE P0** Approve the final customer pricing, software subscription, payment-operations fee, refund, dispute, and tax policies with legal/accounting ownership.
- [ ] **VERIFY P0** Reconcile corporate software invoices, subscriptions, payment methods, connected accounts, application fees, refunds, disputes, and payouts end to end.
- [ ] **CONFIGURE P1** Complete each live school's receipt identity, EIN/tax fields, payout owner, payout bank confirmation, and support contact without storing bank credentials in the app.
- [ ] **VERIFY P1** Prove month-end finance exports agree with Stripe and the BEE Suite ledger for a representative multi-school period.

### Integrations and provider administration

- [ ] **CONFIGURE P0** Complete SendGrid From identities, SPF, DKIM, DMARC, reply inboxes, branded-link posture, suppression policy, and signed Event Webhook evidence.
- [ ] **DECIDE P0** Classify every email as transactional, operational, or marketing and approve consent, unsubscribe, address, payment, receipt, and failure language.
- [ ] **CONFIGURE P1** Complete Twilio sender, webhook signature, delivery callback, opt-in/STOP/START, quiet-hours, and escalation ownership for each enabled tenant.
- [ ] **CONFIGURE P1** Complete Google Calendar/Sheets, marketing, review, social, and webhook connections only for tenants that use them; identify the source of truth and revocation owner.
- [ ] **VERIFY P1** Test provider disconnect, expired credential, permission reduction, account reselection, retry, and audit behavior for every enabled integration.
- [ ] **DECIDE P1** Document whether shared platform provider credentials are allowed per integration; default remains fail closed.

## Brand admin

### Portfolio operations

- [ ] **VERIFY P0** Confirm every active and closed school, public location ID, time zone, region, owner group, director, notification address, and rollout status is correct.
- [ ] **FINISH P1** Add a durable portfolio readiness view that separates setup, invitations, kiosk/PIN, billing, payments/payouts, communications, ProCare retirement, and mobile-store gates.
- [ ] **VERIFY P1** Test multi-location KPIs, current-family counts, enrollment, FTE, payroll, receivables, and exports against exact school source reports.
- [ ] **CONFIGURE P1** Assign one primary and backup operational owner per school for launch, support, communications, billing, and data reconciliation.

### Rollout and school activation

- [ ] **DECIDE P0** Choose the rollout order, modules enabled, modules held off, cutover window, rollback window, and stop conditions for every school.
- [ ] **VERIFY P0** Run a fresh school-specific readiness report and director signoff; never use a global warning summary as a school GO decision.
- [ ] **VERIFY P0** Validate imported families, children, guardians, pickups, emergency contacts, classrooms, staff, schedules, attendance history, balances, tuition, and documents before activation.
- [ ] **VERIFY P0** Record separate GO/NO-GO decisions for operations/CRM, parent invitations, kiosk/PIN, billing/invoices, live payments/payouts, and ProCare retirement.
- [ ] **CONFIGURE P1** Schedule training, floor support, after-hours support, incident contacts, and next-business-day reconciliation for each launch.

### Marketing and reputation

- [ ] **DECIDE P1** Approve brand voice, review-response policy, campaign approval roles, consent rules, budgets, audiences, and publishing authority.
- [ ] **VERIFY P1** Prove marketing profiles and ad accounts map to exactly one intended school or brand and fail closed when ambiguous.
- [ ] **CONFIGURE P2** Add analytics, conversion tracking, and ad pixels only when marketing launch and privacy consent are approved.
- [ ] **FINISH P2** Add approved customer testimonials and current product-use imagery for the public SaaS launch.
- [ ] **VERIFY P2** Test campaign drafts, approvals, schedules, delivery results, lead attribution, and revocation without publishing unapproved content.

## Regional manager

### Multi-school oversight

- [ ] **VERIFY P0** Prove regional managers see only assigned owner groups/centers across dashboards, global search, reports, messages, exports, AI, and direct URLs.
- [ ] **VERIFY P1** Reconcile regional enrollment, occupancy, attendance, staffing, FTE, compliance, billing, and lead totals against underlying school records.
- [ ] **FINISH P1** Provide an exception-first regional queue for missing FTE, expired documents, ratio risk, overdue director actions, unresolved imports, and payment-readiness holds.
- [ ] **VERIFY P1** Test saved filters, date ranges, exports, and deep links while switching between multiple assigned schools.

### Coaching and escalation

- [ ] **CONFIGURE P1** Define which regional actions are manage, approve, or view-only for staff, billing, communications, incidents, and compliance.
- [ ] **FINISH P2** Add explicit assignment, due date, acknowledgement, escalation, and closure evidence for regional follow-up items.
- [ ] **VERIFY P2** Test regional communications and AI suggestions for school scope, human review, recipient accuracy, and audit history.

## Center director

### School setup and daily command center

- [ ] **VERIFY P0** Complete all school setup sections: profile, time zone, classrooms, ratios, staff, families, tuition, forms, integrations, tax/receipt details, and emergency contacts.
- [ ] **VERIFY P0** Run the director launch checklist using real school records and attach evidence for every blocker, warning, exclusion, and owner decision.
- [ ] **FINISH P1** Ensure every setup item opens the exact working screen, preserves selected-school context, and returns to the checklist with refreshed status.
- [ ] **VERIFY P1** Test the director dashboard, review inbox, closing board, alerts, global search, saved widgets, and mobile/tablet layouts with live-sized data.

### CRM, inquiries, tours, waitlist, and enrollment

- [ ] **VERIFY P0** Test inquiry-to-enrollment for each production form origin, school selection, notification recipient, duplicate match, lead owner, stage, tour, registration, approval, and roster result.
- [ ] **VERIFY P1** Confirm closed/inactive schools cannot receive public inquiries and every active school routes by a stable location identifier.
- [ ] **VERIFY P1** Test duplicate lead/family/child/guardian review and merge controls with audit history and no cross-school matches.
- [ ] **VERIFY P1** Exercise registration packet, conditional documents, signatures, fee/deposit, approval/rejection, parent invite opt-in, and CRM stage handoff.
- [ ] **CONFIGURE P1** Approve school-specific programs, age groups, capacity, waitlist rules, registration fees, deposits, tours, and nurture timing.

### Family, child, guardian, and document records

- [ ] **VERIFY P0** Reconcile every current child to one school, current classroom, family, guardian authority, pickup list, emergency contacts, custody warnings, medical/allergy records, and schedule.
- [ ] **VERIFY P0** Confirm former, withdrawn, waitlisted, summer-break, pending, and enrolled statuses behave distinctly and do not create tuition or current-family access incorrectly.
- [ ] **VERIFY P1** Exercise family/child edits, relationship review, document request/upload/review/expiration, guardian change request, profile photo, and record export.
- [ ] **VERIFY P1** Confirm sensitive custody, medical, identity, and document details appear only to authorized roles and never in messages, logs, notifications, or exports beyond scope.

### Attendance, kiosk, and closing

- [ ] **VERIFY P0** Test PIN and QR check-in/out on the actual lobby device for guardians and authorized pickups, including custody warnings, inactive children, wrong school, rapid taps, offline state, and recovery.
- [ ] **VERIFY P0** Confirm no shared, duplicate, predictable-without-policy, or cross-school PIN creates unauthorized access; document reset and collision handling.
- [ ] **CONFIGURE P1** Set late-pickup cutoff, kiosk idle/reset timing, signature policy, staff-clock mode, QR policy, device owner, network fallback, and end-of-day owner.
- [ ] **VERIFY P1** Reconcile end-of-day attendance, classroom location transitions, late pickup flags, and unresolved check states against actual children on site.

### Billing, invoices, and school payments

- [ ] **VERIFY P0** Reconcile every current child to the correct tuition plan, cadence, amount, credits, agency/family split, start period, classroom, and future invoice coverage.
- [ ] **VERIFY P0** Verify opening balances and all current-family ledger balances against approved source evidence while preserving historical invoices and payments.
- [ ] **VERIFY P0** Prove manual cash, check, and payroll-deduction entries apply once to the intended account/invoices with school-local timestamps, receipt evidence, audit logs, and exact balance changes.
- [ ] **VERIFY P0** Prove parent payments, saved methods, explicit autopay consent, invoice creation, Thursday billing, scheduled collection, failure/dunning, webhook reconciliation, refunds, credits, disputes, and payouts as separate states.
- [ ] **DECIDE P0** Approve billing preview, accounting reconciliation, live billing, live payment, and payout activation separately for each school.
- [ ] **CONFIGURE P1** Confirm tuition reminder cadence, copy, opt-out behavior, drop-off reminder policy, and support escalation before enabling it school-wide.
- [ ] **VERIFY P1** Test refund request, executive approval/denial, provider refund, ledger update, family notice, and reconciliation.
- [ ] **VERIFY P1** Validate agency program setup, authorizations, documents, claims, approvals, remittances, reversals, references, and family copay separation without inferring settlement from Stripe.
- [ ] **DECIDE P2** Keep the terminal equipment store disabled until pricing, inventory, tax, shipping, fulfillment, returns, and support ownership are approved and tested.

### Communications and parent service

- [ ] **VERIFY P0** Confirm inbox, recipient picker, direct send, broadcast, AI suggestion, counts, and notifications include only current families inside the selected school.
- [ ] **VERIFY P0** Test email, SMS, push, in-app, reply routing, attachment access, opt-out, suppression, bounce, delivery, and failure states with approved non-family test addresses first.
- [ ] **VERIFY P1** Validate daily report email content, sender authentication, guardian recipients, preference handling, signed media, and final delivery state before wider rollout.
- [ ] **CONFIGURE P1** Define monitored reply inboxes, primary and backup responders, response targets, emergency-message rules, and marketing-versus-operational classifications.
- [ ] **VERIFY P1** Confirm AI drafts cannot send or mutate sensitive records without an authorized human review and exact school/family scope.

### Staff, scheduling, payroll, and compliance

- [ ] **VERIFY P0** Reconcile active staff, roles, classroom assignments, teacher logins, access grants, employment status, certifications, background checks, and PINs.
- [ ] **VERIFY P1** Validate schedules, classroom coverage, ratios, time clock, missed lunches, manual edits, PTO/unavailability, school-local dates, and printable pay-period reports.
- [ ] **CONFIGURE P1** Confirm compensation, payroll IDs, pay codes, overtime, rounding, breaks, approvals, retention, and the payroll provider/export handoff before payroll reliance.
- [ ] **VERIFY P1** Exercise licensing rules, required records, medication logs, incidents, emergency drills, tasks, expiration reminders, and compliance exports for the school's jurisdiction.

## Assistant director

### Delegated school operations

- [ ] **DECIDE P0** Define the exact difference between center director and assistant director for billing, refunds, staff compensation, permissions, communications, compliance, and launch signoff.
- [ ] **VERIFY P0** Test those differences at UI, API, bulk-action, export, AI, and direct-route levels.
- [ ] **VERIFY P1** Exercise all delegated workflows with the director absent: opening/closing, attendance reconciliation, incidents, family updates, documents, staffing, messages, and escalation.
- [ ] **CONFIGURE P1** Name who takes over each director responsibility and which actions must wait for director, regional, brand, billing, or executive approval.

## Billing admin

### Accounts receivable and family billing

- [ ] **VERIFY P0** Confirm billing admins see only assigned schools and only the family/enrollment context needed for billing.
- [ ] **VERIFY P0** Reconcile invoice status filters, family ledger, aging, balance credits, invoice application, void rules, credits, agency responsibility, and historical-family exclusions.
- [ ] **VERIFY P0** Test exact-target payments, duplicate prevention, pending attempts, partial payments, account payments without an open invoice, and oldest-first allocation.
- [ ] **VERIFY P1** Test create/edit/void invoice, one-time charges, tuition assignments, cadence changes, statements, receipts, exports, reminders, and payment-method requests.
- [ ] **VERIFY P1** Prove prior-connected-account methods fail closed after a school Stripe cutover and reauthorization cannot charge or silently enable autopay.

### Reconciliation and approvals

- [ ] **CONFIGURE P0** Assign primary and backup billing, refund, payout, chargeback, failed-payment, and agency-claim owners for each school.
- [ ] **VERIFY P0** Complete daily/weekly/month-end reconciliation between Stripe, local payments, invoice applications, ledger balances, account balances, refunds, fees, and payouts.
- [ ] **VERIFY P0** Confirm billing admins cannot approve their own restricted refund when executive approval is required.
- [ ] **VERIFY P1** Validate accounting exports and receipt/tax content with the approved finance owner.

## Teacher

### Identity, roster, and classroom scope

- [ ] **VERIFY P0** Reconcile each teacher's Prisma user, Supabase Auth identity, staff profile, active center grant, classroom assignment, and generated login.
- [ ] **VERIFY P0** Prove teachers cannot read or write another classroom, school, family, billing account, custody record, or restricted document.
- [ ] **VERIFY P1** Test first login, optional profile setup, password recovery, forced-reset policy, device session, logout, and reassignment between classrooms.

### Daily classroom work

- [ ] **VERIFY P0** Exercise roster attendance, live child location, ratios, meals, naps, diapers/potty, activities, notes, partial saves, batch entry, daily reports, and checkout delivery on the actual classroom device.
- [ ] **VERIFY P1** Test offline encrypted queue, replay, idempotency, conflicts, account switching, logout cleanup, stale items, and poor-network recovery.
- [ ] **VERIFY P1** Test incomplete and completed incident reports, director review, parent acknowledgement, attachments, and restricted visibility.
- [ ] **VERIFY P1** Test private media upload, child assignment, consent/restriction, director review, parent visibility, signed URLs, notification preference, and deletion/retention policy.
- [ ] **CONFIGURE P1** Define which teachers may message families, share media immediately, create incidents, adjust attendance, and see medical/custody warnings.

### Teacher mobile app

- [ ] **VERIFY P1** Run physical-device iPhone/iPad tests for install, login, safe areas, camera/photo access, background/foreground, offline recovery, cache update, and large rosters.
- [ ] **DECIDE P2** Approve signing, App Store submission, reviewer account, privacy labels, support URL, release owner, and update strategy before store distribution.
- [ ] **ADD P3** Add native notification adapters only after APNs/FCM capabilities and store distribution are approved.

## Parent or guardian

### Invitation, identity, and family scope

- [ ] **VERIFY P0** Reconcile every invited guardian to exactly one safe family scope per selected portal context; block shared emails spanning families until explicitly resolved.
- [ ] **VERIFY P0** Test invite, setup, expiry, newest-link behavior, password creation, login, recovery, optional password change, resend, and already-claimed states.
- [ ] **VERIFY P0** Prove parents cannot access another family, child, school, guardian, document, media object, incident, message, invoice, or payment method through any route or identifier.
- [ ] **CONFIGURE P1** Approve the exact invitation population, support owner, delivery test, help copy, and launch date separately for each school.

### Parent home and daily engagement

- [ ] **VERIFY P1** Test Today status, attendance history, daily reports, care-event ordering, photos/full-size view, announcements, messages, contact requests, and notification preferences with real linked-family data.
- [ ] **VERIFY P1** Test document requests, uploads, signatures, review results, expiration, emergency-contact change requests, and correction-request status.
- [ ] **VERIFY P1** Confirm custody/medical restrictions never leak while staff still receive the warnings required to keep the child safe.
- [ ] **VERIFY P1** Test installed browser-app behavior on current iOS and Android: add to Home Screen, icon, deep links, logout, updates, stale-cache recovery, offline messaging, and badge cleanup.

### Parent billing

- [ ] **VERIFY P0** Confirm the displayed balance contains only family responsibility and never charges agency-only responsibility.
- [ ] **VERIFY P0** Test card, bank, microdeposit fallback, partial payment, account payment, invoice payment, saved method, explicit autopay consent, disable autopay, pending, failure, cancellation, retry, receipt, credit, refund, and dispute states.
- [ ] **VERIFY P0** Confirm school/provider fees follow approved policy and the parent sees the exact checkout total without raw Stripe identifiers or internal readiness details.
- [ ] **VERIFY P1** Validate DCFSA/service-period invoice documents, receipts, school EIN/tax details, payment history, ledger pagination, and time zone.

### Parent mobile app

- [ ] **VERIFY P1** Complete physical-device and App Store reviewer evidence for the parent iOS wrapper without claiming native features that are not enabled.
- [ ] **DECIDE P2** Approve signing, submission, privacy labels, account deletion instructions, reviewer credentials, support, rollout, and release ownership.
- [ ] **ADD P3** Add native APNs/FCM only after native capabilities and provider/store approval; web push remains a separate working channel.

## Authorized pickup

### Limited pickup access

- [ ] **VERIFY P0** Reconcile every authorized pickup to one exact reviewed user link and authorized child set; fail closed on ambiguous or stale links.
- [ ] **VERIFY P0** Prove authorized pickups cannot access family profiles, messages, documents, billing, media, parent preferences, or unrelated children.
- [ ] **VERIFY P0** Test PIN/QR check-in and checkout for correct school, service day, current enrollment, custody restrictions, revoked authority, collision, and audit history.
- [ ] **CONFIGURE P1** Define expiry, revocation, identity-verification, fallback, dispute, and emergency procedures for pickup authority.

## Read-only auditor

### Audit and reporting access

- [ ] **VERIFY P0** Prove every mutation is blocked, including hidden buttons, API calls, direct URLs, exports with side effects, AI commands, and bulk actions.
- [ ] **VERIFY P0** Confirm the auditor sees only the assigned tenant/brand/owner-group/center scope and only approved sensitive fields.
- [ ] **CONFIGURE P1** Define export policy, watermarking, retention, download logging, access expiry, review cadence, and who approves auditor access.
- [ ] **VERIFY P1** Test dashboards, FTE, finance reports, compliance, documents, activity history, filters, pagination, and exports against source records.

## Public and unauthenticated users

### Website, inquiry, registration, legal, and support

- [ ] **VERIFY P0** Test inquiry, registration, password recovery, setup links, payment-method forms, survey responses, public locations, legal pages, and support routes for abuse, enumeration, rate limits, and safe errors.
- [ ] **VERIFY P1** Run final public copy, accessibility, responsive, performance, metadata, favicon, canonical URL, sitemap/search, and conversion-path review.
- [ ] **DECIDE P1** Obtain final legal approval for Terms, Privacy, EULA, consent, photo/media, communications, payments, refunds, retention, and account deletion.
- [ ] **VERIFY P1** Test public forms with keyboard, screen reader, mobile, slow network, retry, duplicate submission, bot protection, allowed origins, and failure queues.
- [ ] **CONFIGURE P2** Add approved analytics and consent controls before collecting marketing/conversion data.

## Cross-role data migration and ProCare retirement

### Per-school migration

- [ ] **VERIFY P0** Inventory every authoritative export used by each school and mark every required field mapped, intentionally excluded, or blocked with evidence.
- [ ] **VERIFY P0** Resolve all ambiguous account, payer, guardian, relationship, pickup, emergency, tuition, balance, classroom, staff, and enrollment links without guessing.
- [ ] **VERIFY P0** Run preview, duplicate review, director reconciliation, commit checkpoints, exact counts, financial totals, parent-access preflight, and rollback export for each school.
- [ ] **VERIFY P0** Recheck Oakleaf, Canton, and any other previously recorded warning counts from current sources; historical counts are not current proof.
- [ ] **DECIDE P0** Keep ProCare as source of truth until written school-specific cutover approval names the modules and effective time.
- [ ] **VERIFY P0** After a school is fully set up, verify BEE Suite data and archive original ProCare files as recoverable backups; do not delete them or leave them as active inputs.
- [ ] **CONFIGURE P1** Retain source hashes, manifests, reviewer decisions, exclusions, import batches, reconciliation packets, rollback references, and archive location.

## Cross-role reporting and analytics

- [ ] **VERIFY P0** Reconcile displayed totals, CSV/PDF exports, filters, school scope, date/time zone, freshness, and drill-down rows for every report family.
- [ ] **FINISH P1** Complete and approve the Google Sheets two-way FTE reconciliation rules or formally retire Sheets as an editable source.
- [ ] **VERIFY P1** Test FTE submission, Friday deadlines, reminders, escalations, corrections, bulk import, trends, scheduled-day weighting, and selected reporting periods.
- [ ] **VERIFY P1** Validate enrollment, attendance, billing, payments, payroll, CRM funnel, compliance, and reputation reports with complete exports and historical records.
- [ ] **CONFIGURE P1** Define report owners, source-of-truth rules, refresh expectations, correction workflow, retention, and signoff cadence.

## Cross-role documentation, training, and support

- [ ] **VERIFY P1** Re-audit every public and internal SOP against the current UI after major navigation or billing changes.
- [ ] **CONFIGURE P1** Provide role-specific day-one training and school-specific launch packets for directors, assistants, billing admins, teachers, parents, and support.
- [ ] **VERIFY P1** Conduct scenario-based drills: failed login, wrong-school access, child safety warning, offline classroom, failed payment, duplicate payment, bounced invitation, provider outage, and rollback.
- [ ] **CONFIGURE P1** Publish one canonical current documentation path and retire stale versions only after link and replacement verification.
- [ ] **CONFIGURE P1** Establish ticket intake, severity, response targets, escalation, incident communication, resolution evidence, and recurring product-review cadence.

## Recommended execution order

1. **P0 identity and isolation:** reconcile accounts/grants and complete two-school credentialed tests.
2. **P0 school data:** finish per-school ProCare/source reconciliation and record exact module gates.
3. **P0 money:** reconcile tuition, balances, Stripe accounts, webhooks, ledger, refunds, agency responsibility, and payouts.
4. **P0 recovery/security:** staging, monitoring, RLS/advisor, rate-limit audit, backups, restore drill, and on-call ownership.
5. **P1 real-device role flows:** director, teacher, parent, kiosk, billing admin, regional, executive, and auditor.
6. **P1 communications/providers:** sender authentication, webhooks, suppressions, consent, delivery outcomes, and reply ownership.
7. **P1 operations:** payroll, reporting, compliance, training, documentation, support, and per-school launch rehearsal.
8. **P2/P3 expansion:** owner-group UX, custom domains, public marketing, terminal store, native distribution, and native notifications.

## Definition of “works perfectly”

For a checklist area to be complete, all of the following must be true:

- the code path exists and its focused/full automated tests pass;
- the intended user can complete it on the actual supported device;
- unintended users, schools, families, and records are denied;
- required school data and provider configuration are current;
- retries, duplicate submissions, errors, offline behavior, and recovery are tested;
- audit, notification, reporting, and financial side effects reconcile exactly;
- documentation and support ownership match the current UI;
- any external or business activation has a named approver and explicit evidence;
- the released commit is Ready on canonical production aliases with healthy logs and changed-flow verification.


