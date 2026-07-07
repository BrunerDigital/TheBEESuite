# Role and Screen Testing Matrix

Use this as the master testing path. Test one user type at a time. Within each user type, test one screen or tab at a time. Capture every requested change with `change-note-template.md`.

## Universal Pass on Every Role

Before deep feature testing, verify these basics:

- Login or entry route loads.
- Correct user name, school, brand, or family context appears.
- Navigation only shows allowed screens.
- Data is scoped correctly.
- Primary dashboard cards link to the right screens.
- Global search, filters, sort order, and date ranges behave as expected where present.
- Loading, empty, disabled, success, and error states are understandable.
- Desktop, tablet, and phone layouts do not hide primary actions.
- Sensitive data is not visible to the wrong role.
- Audit or notification side effects happen only where expected.

## Executive Admin / Platform Owner / Brand Admin

Primary purpose: manage the whole brand or assigned multi-location scope.

| Screen or route | Tab/section | Key functions to test | Notes |
|---|---|---|---|
| `/dashboard` | Executive dashboard lens | Multi-location KPIs, FTE summary, occupancy, revenue, action queue, dashboard widgets, links to modules. | Confirm numbers match assigned scope only. |
| `/multi-location-dashboard` | School comparisons | School rollups, occupancy, enrollment, staffing, billing, missing tasks. | Confirm filters do not leak other brands or tenants. |
| `/fte-reports` | Weekly reporting | Submitted/missing schools, report import, deadline reminders, escalation flow. | Check current week dates and missing-school logic. |
| `/agency-admin` | Locations/users/access | Create or update centers, users, access grants, archived/reactivated centers, temporary passwords. | P0 if access grants expose the wrong center. |
| `/crm-leads` | Lead list/detail | All assigned centers, lead status, notes, tasks, tours, inquiry source, merge/dedupe. | Confirm a director at another center cannot see the lead. |
| `/analytics` | Reporting exports | Center reports, revenue reports, attendance reports, export behavior. | Verify exported rows match filtered scope. |
| `/billing-invoices` and `/payments` | Billing oversight | Invoice status, balances, checkout readiness, payment state, reconciliation. | P0 for wrong invoice or duplicated payment state. |
| `/integrations` | Integration status | Twilio, SendGrid, Google, Stripe, push, webhook readiness, retry queues. | Verify disconnected services are clearly gated. |
| `/white-label` | Branding/settings | Portal names, colors, custom domains, terms/privacy URLs, assets. | Confirm branding applies only to intended scope. |
| `/team-permissions` | Role access | Users, grants, role changes, read-only auditor behavior. | Confirm every grant is scoped and reversible. |
| `/ai-command` | Human-reviewed AI | Suggestions, summaries, allowed actions, safety copy. | AI must not finalize billing, custody, medical, safety, or compliance decisions. |
| `/audit-logs` | Activity history | Filters, actor, event, record target, export. | Confirm sensitive actions are logged. |

## Regional Manager / Read-Only Auditor

Primary purpose: review assigned schools without broad operational changes.

| Screen or route | Tab/section | Key functions to test | Notes |
|---|---|---|---|
| `/dashboard` | Regional or auditor lens | Assigned-school KPIs, action queue, reports. | Confirm read-only users cannot mutate records. |
| `/multi-location-dashboard` | Assigned scope | Compare schools, view trends, open details. | Confirm only assigned owner groups or centers appear. |
| `/crm-leads` | View/review | Lead visibility, comments if allowed, no unauthorized edits. | Verify edit buttons match permissions. |
| `/analytics` | Reports | Export or view-only behavior. | Confirm exports respect scope. |
| `/audit-logs` | Review | Event filtering and actor history. | Confirm no destructive action controls appear. |

## Center Director / Assistant Director

Primary purpose: run one school or assigned schools day to day.

| Screen or route | Tab/section | Key functions to test | Notes |
|---|---|---|---|
| `/dashboard` | Director dashboard lens | Today view, action queue, attendance, classrooms, incidents, billing alerts, parent messages. | Confirm the dashboard shows only assigned center data. |
| `/center-dashboard` | Center operations | Enrollment, attendance, staffing, compliance, billing summary. | Check drill-down links. |
| `/crm-leads` | Leads and inquiries | New inquiry, lead edit, status changes, notes, tasks, tours, source, routing. | Confirm pipeline status does not revert unexpectedly. |
| `/family-detail` | Family records | Guardians, contact info, authorized pickups, custody warnings, linked children, billing context. | P0 if another family's data appears. |
| `/child-profile` | Child record | Profile, classroom, attendance, documents, incidents, media permissions, medical/custody fields. | Confirm restricted fields are need-to-know. |
| `/enrollment-pipeline` | Pipeline | Inquiry to tour to enrollment, waitlist movement, registration review. | Check status labels and next actions. |
| `/waitlist` | Waitlist | Priority, age room fit, target dates, offer/decline. | Verify school-specific list only. |
| `/tours` | Tours | Schedule, reschedule, complete, no-show, calendar sync. | Confirm time zone and school calendar behavior. |
| `/calendar` | Calendar | Events, tours, staff schedules, school closures, reminders. | Check recurring and date-range behavior. |
| `/messages` | Parent inbox | Threads, replies, contact requests, billing-related messages, unread state. | Confirm thread participants are correct. |
| `/announcements` | Announcements | Create, preview, send, schedule, audience selection. | Confirm no accidental all-brand send from center user. |
| `/campaigns` | Campaigns | Marketing workflow, audience segments, scheduling, delivery status. | Confirm opt-outs and disabled integrations are respected. |
| `/classroom-dashboard` | Classrooms | Classroom roster, ratios, assignments, attendance summary. | Verify staff/child counts. |
| `/attendance` | Check-in/out | Manual attendance, corrections, duplicate states, checkout-before-checkin. | P0 for bad attendance state. |
| `/daily-reports` | Review reports | Parent visibility, report completeness, resend, date filters. | Confirm reports belong to visible children only. |
| `/incident-reports` | Incident review | Teacher-created incidents, director review, parent acknowledgement, restricted details. | P0 if incident goes to wrong parent. |
| `/parent-media-review` | Media approvals | Teacher uploads, approval/rejection, parent visibility. | P0 if unapproved media is visible to parents. |
| `/staff` | Staff operations | Staff profiles, scheduling, classroom assignment, staff kiosk, compensation where allowed. | Confirm assistant director permissions. |
| `/billing-invoices` | Billing overview | Family balances, invoice status, manual corrections if allowed. | Confirm billing controls match director permission. |
| `/payments` | Payment status | Checkout readiness, autopay status, failed payment follow-up. | Live payment gating must be clear. |
| `/documents` | Documents | Requests, uploads, review, expiration reminders, export package. | Confirm parent submissions attach to correct child/family. |
| `/forms` | Forms | Registration/intake packets, custom forms, signatures. | Check approval creates expected records. |
| `/compliance` | Compliance | Licensing tasks, emergency drills, medication logs, records export. | Confirm restricted compliance data is scoped. |
| `/analytics` | Center reports | Attendance, enrollment, billing, FTE, exports. | Verify exported data matches center scope. |

## Billing Admin

Primary purpose: manage tuition, payment setup, balances, failed payments, and reconciliation.

| Screen or route | Tab/section | Key functions to test | Notes |
|---|---|---|---|
| `/billing-invoices` | Invoice workbench | Create invoice, view family balance, edit draft, send invoice, mark status. | P0 if wrong family or invoice is affected. |
| `/payments` | Payment activity | Payment status, checkout handoff, failed payment, refund/void visibility if present. | Confirm platform-only payments are disabled in production. |
| `/billing-settings` | Stripe Connect/readiness | Payout onboarding status, refresh, readiness gates, fee disclosures. | Parent checkout must stay blocked until school is ready. |
| `/messages` | Billing messages | Past-due notices, payment reminders, family billing threads. | Confirm billing admin cannot see unrelated parent messages unless allowed. |
| `/analytics` | Finance exports | Revenue, balances, reconciliation, payment method reports. | Exported totals must match filters. |
| `/parent-portal` test as parent | Parent payment experience | Invoice display, payment method setup, ACH/card choices, fee copy, autopay. | Use test credentials only. |
| `/payment-method-form/[token]` | Secure payment method request | Token validation, expired/used token behavior, checkout session. | P0 if token opens wrong family. |

## Teacher

Primary purpose: run classroom workflows from a tablet or mobile device.

| Screen or route | Tab/section | Key functions to test | Notes |
|---|---|---|---|
| `/teachers` and `/login` | Login | Teacher login, forced reset, bad password, redirect to teacher portal. | Confirm teacher cannot reach director-only pages. |
| `/teacher-portal` | Roster | Assigned classroom or center roster, child cards, allergies/notes visibility. | P0 if teacher sees unassigned classroom data. |
| `/teacher-portal` | Attendance | Present/absent, check-in/out, attendance-only status, duplicate actions. | Confirm offline or slow network messaging. |
| `/teacher-portal` | Daily report | Meals, naps, diapers/potty, activities, supplies, teacher note, send to parent portal. | Confirm saved report appears for correct parent only. |
| `/teacher-portal` | Incident | Incident type, objective description, action taken, child selection, director review. | P0 if parent sees before review when review is required. |
| `/teacher-portal` | Media | Photo upload, caption, permission handling, approval queue. | P0 if media bypasses approval or consent rules. |
| `/teacher-portal` | Messages/classroom notes | Allowed family messages and classroom updates. | Confirm teacher cannot see billing-only details. |
| `/teacher-portal` | Mobile/PWA | Tablet/phone layout, app install behavior, offline queue status. | Test portrait and landscape if tablets are used. |

## Parent / Guardian

Primary purpose: manage own family portal, payments, documents, child updates, and school communication.

| Screen or route | Tab/section | Key functions to test | Notes |
|---|---|---|---|
| `/parents` and `/login` | Login | Parent login, setup login, password reset, forced reset, redirect to portal. | P0 if parent can access another family. |
| `/parent-portal/setup` | First setup | Guardian profile, password setup, missing email handling. | Confirm setup is one family only. |
| `/parent-portal` | Family dashboard | Child cards, balances, messages, documents, reports, incidents, notifications. | Confirm all records belong to linked family. |
| `/parent-portal` | Invoices/payments | Balance, invoice detail, checkout, fee copy, payment status. | P0 for wrong invoice or misleading paid status. |
| `/parent-portal` | Payment methods/autopay | Bank/card setup, request forms, ACH/card choices, autopay on/off display. | Verify disabled states explain why. |
| `/parent-portal` | Daily reports | Report list/detail, date filters, child selection. | Confirm teacher note and activity display is clear. |
| `/parent-portal` | Media review | Approved media, captions, permissions. | P0 if unapproved or wrong-child media appears. |
| `/parent-portal` | Incidents | Incident acknowledgement, signatures if present, review history. | Confirm acknowledgement records correct guardian. |
| `/parent-portal` | Documents/forms | Required documents, upload, review status, signature requests. | Confirm file status is clear after upload. |
| `/parent-portal` | Messages/contact requests | Send message, contact update request, unread/read states. | Confirm school sees request and parent sees status. |
| `/parent-portal` | Notification preferences | Email/SMS/push preferences, opt-outs, required notices. | Confirm required notices are not accidentally disabled. |
| `/app` | App install | Parent app route, mobile install guidance, icons, app names. | Check iPhone, Android, Fire tablet, desktop copy. |

## Authorized Pickup / Lobby Kiosk / Front Desk

Primary purpose: handle limited check-in/check-out without exposing full records.

| Screen or route | Tab/section | Key functions to test | Notes |
|---|---|---|---|
| `/check-in` | Center selection | Correct center links, no sensitive data before center selection. | Public route must not expose family data. |
| `/check-in/[centerId]` | Lookup | Search child/family, limited result display, no cross-center results. | P0 if wrong center results appear. |
| `/check-in/[centerId]` | PIN/QR validation | Valid PIN, invalid PIN, expired/rotated credentials, wrong center. | P0 if wrong PIN is accepted. |
| `/check-in/[centerId]` | Check-in/out | Check-in, check-out, duplicate check-in, checkout-before-checkin, timestamp display. | Bad state must be blocked or clearly warned. |
| `/check-in/[centerId]` | Signature/warnings | Guardian signature, custody/authorized pickup warning, staff override if present. | Confirm warnings do not reveal restricted details to unauthorized pickup. |
| `/staff` or staff kiosk flow | Staff clock | Staff check-in/out if enabled, schedule context, duplicate state. | Confirm staff data is center-scoped. |

## Public Visitor / Registration / Inquiry

Primary purpose: allow outside families to inquire or register without login.

| Screen or route | Tab/section | Key functions to test | Notes |
|---|---|---|---|
| `/` | Public landing | Primary calls to action, role login links, inquiry/registration links, mobile layout. | Confirm public page does not imply unavailable features. |
| `/registration` | Registration packet | Family details, child details, school selection, submit, confirmation, next steps. | Confirm registration creates correct review queue. |
| Embedded inquiry form | Location selector | Selected location, family contact, child age, source tracking, submit. | Confirm selected center receives the lead. |
| `/api/public/kidcity-locations` | Location data | Active school list, labels, IDs used by embed. | Confirm closed/inactive schools are not selectable. |
| `/support` | Support | Parent support links, privacy link, email copy. | Confirm urgent school issues route to school first. |
| `/privacy` | Privacy | Parent portal data handling, support, child account language. | Confirm wording matches current policy. |

## Cross-Role Regression Pass

Run this after a batch touches shared data or permissions:

- Executive can still see assigned multi-location data.
- Director can see only assigned center data.
- Teacher can see only assigned classroom or allowed center roster.
- Parent can see only linked family and child records.
- Billing admin can use finance workflows without unrelated operational access.
- Kiosk can check in/out only authorized children at the selected center.
- Read-only auditor cannot create, edit, delete, send, pay, or acknowledge records.

## Minimum Evidence by Issue Type

| Issue type | Evidence needed |
|---|---|
| Visual/layout | Screenshot or short video plus device/browser. |
| Button/form action | Reproduction steps, submitted fields, resulting message or record. |
| Wrong data | Account, role, route, expected record, actual record, and screenshot with sensitive data redacted before sharing outside the internal team. |
| Payment | Test mode confirmation, invoice/family identifier, payment status before/after, Stripe test event if available. |
| Notification | Trigger action, recipient, channel, delivery status, message content if safe. |
| API/error | Route, request action, status code, console/network error, timestamp. |
| Mobile/PWA | Device, OS/browser, viewport orientation, screenshot/video. |

## Suggested Note ID Prefixes

| Prefix | Role/workflow |
|---|---|
| QA-EXEC | Executive admin, brand admin, regional manager, auditor |
| QA-DIR | Director or assistant director |
| QA-BILL | Billing admin, invoices, payments, payment methods |
| QA-TEACH | Teacher portal |
| QA-PARENT | Parent portal |
| QA-KIOSK | Check-in kiosk or authorized pickup |
| QA-PUBLIC | Public inquiry, registration, landing, support, privacy |
| QA-CROSS | Cross-role permission, scope, or regression issue |
