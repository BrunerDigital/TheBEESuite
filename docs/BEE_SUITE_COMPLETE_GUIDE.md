# The BEE Suite: Complete Product, User, and Technical Guide

**Documentation snapshot:** July 15, 2026  
**Purpose:** A single, narration-friendly explanation of what The BEE Suite is, what is included, who uses it, how information moves through it, and how the software is built.  
**Audience:** School owners, executives, directors, teachers, billing staff, parents, implementation teams, support staff, developers, and AI assistants asked to explain the system aloud.

> **Narration note:** This document is intentionally written in full sentences. An AI voice can read it from the beginning for a complete tour, or begin at any heading for a focused explanation. Tables are followed by prose where context is important.

---

## 1. The short explanation

The BEE Suite is a multi-tenant, white-label childcare operating system. It brings the work that is often split across a customer relationship manager, enrollment spreadsheet, childcare management system, billing platform, parent app, classroom app, compliance binder, and executive reporting workbook into one role-aware application.

The system follows a family from the first inquiry through a tour, application, enrollment, classroom attendance, daily care, parent communication, invoicing, payment, and eventual record retention. At the same time, it gives teachers a classroom-safe workspace, directors a school operations workspace, billing staff a financial workspace, and executives a multi-location view.

“Multi-tenant” means more than one childcare business can use the software while each business's records remain separated. “White-label” means a tenant, brand, owner group, or school can present its own name, colors, logo, domain, legal links, and communication identity. “Role-aware” means the software changes what it shows and permits according to the user's job and explicit access grants.

The production application is a responsive web application hosted on Vercel. It uses Next.js and React for the interface, PostgreSQL and Prisma for structured data, Supabase for authentication, database hosting, and storage workflows, Stripe for payment and payout workflows, SendGrid and Twilio foundations for email and text messaging, and OpenAI for human-reviewed assistance called Mr. Bee.

The most important safety principle is that a role is only the first access check. Records are also scoped by tenant and, when applicable, by brand, organization, owner group, center, classroom, family, or child. Teachers should see assigned classroom information, parents should see linked family information, and a director should see assigned schools—not every record in the platform.

---

## 2. What problem the platform solves

Childcare operations connect many kinds of work that are easy to separate accidentally:

- An inquiry becomes a tour, an application, and an enrolled child.
- An enrolled child needs guardians, emergency contacts, medical details, documents, a schedule, and a classroom assignment.
- A classroom needs attendance, ratio awareness, care logs, incidents, photos, and parent updates.
- A family needs invoices, payment methods, messages, forms, documents, and a trustworthy view of the child's day.
- A school needs staffing, compliance reminders, payment reconciliation, reporting, and an audit trail.
- A multi-location operator needs comparable information across schools without giving every employee network-wide access.

The BEE Suite treats those items as parts of one operating loop. Information entered during inquiry and registration can become family and child records. Classroom activity can become a parent update. Tuition activity can appear in both the school's billing workspace and the family's portal. The same access rules follow the record through each view.

---

## 3. The organizational structure

The platform's hierarchy is:

**Platform → tenant → brand or franchise → organization → owner group → center or location → classroom → staff, families, and children.**

These terms mean the following:

- **Platform:** The complete BEE Suite service and its platform-level controls.
- **Tenant:** The top data-security boundary for a customer or operating network. Most queries are limited to a tenant before any finer scope is applied.
- **Brand:** A public-facing childcare brand or franchise identity inside a tenant.
- **Organization:** The legal or administrative organization that contains centers.
- **Owner group:** The operator or franchisee container. It can represent one independent owner, a group with several centers, or a corporate-owned group.
- **Center or location:** A physical childcare school.
- **Classroom:** A room, age group, or teaching unit within a center, including capacity and ratio configuration.
- **Family:** The household-level record that connects children, guardians, billing, communication, and documents.
- **Guardian:** A parent or guardian connected to a family and, when invited, to a portal user.
- **Child:** The child-specific record containing enrollment, classroom, safety, attendance, care, and reporting information.
- **User:** An authenticated person with a role.
- **Access grant:** A rule that narrows or expands a user's legitimate scope to a particular tenant, brand, organization, owner group, center, classroom, family, or child.

An executive title does not automatically mean unrestricted access. A regional manager may be limited to assigned owner groups or centers. A teacher may be limited to one classroom. A parent user is linked to a family. Access is the combination of role, active account status, tenant identity, and explicit grants.

---

## 4. All user levels

The application defines ten user roles.

### 4.1 Platform owner

The platform owner operates the broadest system scope. This role can manage tenants and enterprise controls, see cross-location information, administer users and access, inspect system readiness, configure integrations and branding, review audit evidence, and support rollout. Platform access is powerful and should be rare, audited, and used with least-privilege discipline.

### 4.2 Brand admin

The brand admin runs a childcare brand or franchise network. This role typically manages locations, owner groups, users, CRM and enrollment oversight, communications, reporting, billing oversight, white-label settings, and integrations within the assigned tenant. A tenant-wide grant is required for tenant-wide screens.

### 4.3 Regional manager

The regional manager oversees assigned regions, owner groups, or centers. The role is designed for multi-center comparison, enrollment and operations oversight, FTE review, compliance follow-up, communications, and reporting. Its scope may be tenant-wide or limited by grants.

### 4.4 Center director

The center director runs a school. The director's workspace includes leads, tours, enrollment, families, children, classrooms, staff, attendance, incidents, daily reports, parent communication, documents, compliance, billing oversight, FTE submission, and center analytics. This is the primary operating role for a location.

### 4.5 Assistant director

The assistant director supports day-to-day center operations. Its general module access resembles the center director role, but actual access can be narrowed through grants and operating policy. It commonly handles attendance, classrooms, family records, communications, incidents, documents, and daily follow-up.

### 4.6 Teacher

The teacher receives a classroom-focused workspace. Teachers can work with an assigned roster, record attendance and care activities, prepare daily reports, document incidents, upload classroom media, and communicate where enabled. A teacher is not a general school administrator and should not receive unrelated family, billing, executive, or compliance records.

### 4.7 Billing admin

The billing admin handles invoices, balances, payments, payment methods, reminders, failed-payment follow-up, reconciliation, and billing-related communication. This role can receive the financial context required for its job without receiving unrestricted classroom or medical information.

### 4.8 Parent or guardian

The parent or guardian uses the family portal. This role can see linked children and family information, daily reports, approved media, messages, documents, incidents requiring acknowledgement, invoices, payment options, contact-change requests, preferences, and check-in credentials. It cannot browse other families.

### 4.9 Authorized pickup

The authorized pickup role is deliberately narrow. It exists for approved pickup and drop-off actions, generally through the kiosk, and only for authorized children. It is not a substitute for a parent portal, teacher account, or staff account.

### 4.10 Read-only auditor

The read-only auditor reviews evidence without changing operational data. Typical views include multi-location and center dashboards, FTE reports, family and child records where granted, invoices, documents, compliance, analytics, and audit logs. Read-only access is still sensitive and remains scoped.

### 4.11 The public kiosk is a surface, not a broad user role

The check-in kiosk is a controlled public-facing interface for guardian PIN or QR lookup, signatures, child check-in and check-out, pickup warnings, and staff clock activity. Identity and authorization are verified during the workflow; the kiosk does not expose the full application.

---

## 5. Dashboard lenses

A **lens** is a dashboard perspective, not a second account role. It changes the level and emphasis of the dashboard while the user's underlying permissions stay in force.

There are eight lenses:

- **Platform lens:** System-wide operating perspective for a platform owner.
- **Brand lens:** Brand or franchise performance and administration perspective.
- **Regional lens:** Multi-center comparison and regional follow-up perspective.
- **Director lens:** A center-level daily operations perspective.
- **Billing lens:** Financial tasks, balances, invoices, and payment follow-up.
- **Teacher lens:** Assigned classroom, roster, attendance, care logs, and action queue.
- **Parent lens:** The linked family's children, updates, messages, documents, and billing.
- **Pickup lens:** Minimal authorized pickup and check-in context.

Lens availability follows the code's role and scope rules:

| User context | Available lenses |
|---|---|
| Platform owner with platform scope | Platform, brand, regional, director |
| Brand admin with tenant-wide scope | Brand, regional, director |
| Regional manager with tenant-wide scope | Regional, director |
| Read-only auditor | Regional |
| Center director or assistant director | Director |
| Billing admin | Billing |
| Teacher | Teacher |
| Parent or guardian | Parent |
| Authorized pickup | Pickup |

A lens never bypasses record scope. For example, changing from a regional lens to a director lens does not grant access to an unassigned center.

The dashboard can also contain configurable widgets, saved views, date ranges, snapshot exports, KPI cards, attendance and ratio summaries, enrollment and billing indicators, notification queues, and a human-reviewed AI summary. The exact content depends on role, feature settings, and available records.

---

## 6. Product areas and features

### 6.1 Launch and school setup

The **School Setup Command Center** organizes launch readiness across center profile, classrooms, staff, families, tuition, forms, compliance, integrations, parent access, and sign-off. It shows progress, missing records, director inputs, external dependencies, and links to the relevant live modules.

Onboarding creates or configures tenant, organization, brand, center, and initial administrative access. Rollout scripts and checklists support corporate school creation, school logins, parent access, teacher access, payout preparation, and readiness validation.

### 6.2 Dashboards and executive oversight

The **Dashboard** is the role-aware daily command center. Depending on the lens, it can summarize children, capacity, occupancy, leads, tours, balances, staffing, ratios, incidents, messages, compliance reminders, and priorities.

The **Multi-location Dashboard** compares assigned centers. It supports enrollment, occupancy, staffing, compliance, FTE, and financial rollups and highlights locations that need follow-up.

The **Center Dashboard** concentrates on today's school activity: attendance, tours, staffing, messages, birthdays, incidents, tasks, billing alerts, and licensing reminders.

The **FTE Reports** area supports weekly full-time-equivalent reporting. Directors submit enrollment and age-group counts; executives track missing schools, request corrections, approve submissions, review history, and export CSV data.

### 6.3 CRM, inquiry, and enrollment

The **CRM Leads** module captures the prospective family's source, desired start date, age-group interest, center interest, status, tags, score, notes, tasks, messages, and follow-up history. Inquiries can arrive through a public form or an embedded form on a school website. Routing rules associate the inquiry with the correct school and notification recipients.

The **Enrollment Pipeline** moves a lead through defined stages: new inquiry, contacted, tour scheduled, tour completed, application sent, application started, application submitted, documents pending, deposit pending, enrolled, waitlisted, or lost/not a fit.

The **Tours** area stores tour dates, preparation tasks, family context, reminders, calendar information, and post-tour follow-up.

The **Waitlist** organizes families by age group, desired date, sibling priority, center preference, and future capacity.

The public **Registration** workflow collects family and child information, required acknowledgements, uploads, and signatures. Staff can review, approve, or reject an application and can gate registration fees or deposits on payment readiness.

The **ProCare Import Center** supports migration from CSV exports. Its foundations cover preview and mapping, duplicate matching, row and batch tracking, families, guardians, children, classrooms, staff, invoices, balances, attendance, source identifiers, backups, and rollback-oriented evidence. A real migration still requires field validation and a controlled cutover.

### 6.4 Families and child records

The **Family Detail** view is the household record. It connects guardians, authorized pickups, emergency contacts, siblings, billing contact, communication history, documents, timelines, and restricted notes.

The **Child Profile** contains enrollment, classroom, schedule, allergies, medical notes, permissions, emergency contacts, location history, attendance, daily care, media, incidents, and documents. Custody, medical, and incident information is need-to-know data and requires stricter handling.

Family deduplication and lead merging help prevent the same household from becoming multiple disconnected records. Contact-change requests let parents propose updates without silently overwriting verified school records; staff review and accept or reject the change.

### 6.5 Classroom and teacher operations

The **Classroom Dashboard** is a touch-friendly home for rosters, attendance, ratios, meals, bottles, naps, diaper or potty logs, activities, supplies, notes, and incidents.

The **Teacher Portal** is the mobile-first version of that workflow. It includes large quick-action controls, assigned children, partial-save support, poor-connectivity guidance, an offline queue foundation for classroom actions, profile and photo setup, and classroom-safe messaging.

The **Attendance** module handles child and staff check-in and check-out, absence state, PIN and QR credentials, signatures, pickup verification, late-pickup warnings, classroom state, and ratio snapshots. Attendance is stateful: a child cannot be meaningfully checked out without a prior checked-in state, and duplicate or contradictory events must be guarded.

The **Daily Reports** module records meals, bottles, naps, diapers, potty activity, mood, activities, supplies, notes, photos, and staff observations. Teachers can save progress and publish an appropriate summary to the parent portal.

The **Incident Reports** module records what happened, when and where it happened, witnesses, actions taken, notifications, director review, and parent acknowledgement. AI may help improve wording, but it cannot decide safety outcomes or replace required review.

The **Parent Media Review** queue lets staff review classroom photos or media before family visibility. Media access must be child- and family-scoped.

The **Staff** area covers profiles, center and classroom assignments, schedules, certifications, profile photos, teacher login setup, attendance or time-card foundations, and compensation-reporting foundations.

Child location records and transitions provide a current-location and movement history foundation. They help answer where a child is expected to be without treating a stale record as a substitute for physical supervision.

### 6.6 Parent and guardian experience

The **Parent Portal** is the family's unified view. It can show linked children, today's activity, daily reports, approved photos, messages, announcements, calendar information, invoices, payments, documents, incident acknowledgements, authorized pickups, kiosk credentials, preferences, and change requests.

Parent setup and invitation links establish the relationship among the authentication user, guardian record, family, and children. Portal queries are family-scoped. A guardian should never be able to change a URL or identifier and retrieve another family's information.

The portal supports responsive web and progressive-web-app use. Install guides cover phones, tablets, and desktops. A Capacitor iOS parent shell and app-store assets exist, but the product notes distinguish the current web/PWA experience from a future fully native mobile product with native push and offline sync.

### 6.7 Kiosk and authorized pickup

The kiosk looks up a family or approved pickup using controlled credentials, confirms the authorized child, records the attendance event and signature, and displays relevant warnings. Guardian PINs can be managed or rotated. QR tokens are designed to be scoped and time-aware. Staff kiosk functions support staff clock-in and clock-out.

The kiosk must not reveal broad family, medical, billing, or custody data. A warning should prompt staff verification rather than disclose a restricted note to an unauthorized person.

### 6.8 Communications

The **Messages** area supports family-to-school and internal threads, replies, attachments, templates, unread and priority filters, director oversight, and notification routing. Teacher conversations are constrained to appropriate classroom and family relationships.

The **Announcements** area sends center, classroom, age-group, family-status, or tag-based broadcasts. Emergency and ordinary announcements should use different review and delivery practices.

The **Campaigns** area supports inquiry nurture, tour reminders, open houses, newsletters, review requests, waitlist updates, and lost-lead reactivation. Audience segmentation can use stage, tag, classroom, or other approved attributes.

**Message Templates** provide repeatable content and merge fields. **Notification Preferences** determine whether a user or role receives a category through email, SMS, push-style in-app notification, or quiet hours. **Integration Delivery** records track provider, purpose, recipient, attempts, status, next retry, result, and errors.

SendGrid paths support transactional email. Twilio paths support outbound SMS, inbound replies, and delivery-status callbacks. These channels require verified credentials, sender configuration, consent and opt-out practices, and production testing. In-app notifications remain a separate durable action queue.

### 6.9 Billing, payments, and payouts

The **Billing and Invoices** area manages family billing accounts, tuition plans, products, invoice items, due dates, status, balances, credits, subsidies, and ledger history.

The **Payments** area manages checkout readiness, saved-method setup, payment-method requests, autopay status, failed-payment follow-up, payment records, payout status, and reconciliation evidence.

The intended financial chain is:

**Tuition assignment → invoice and invoice items → family balance → payment method or hosted checkout → Stripe event → webhook verification → payment and ledger update → reconciliation → school payout.**

Stripe Checkout provides hosted payment collection. Stripe Connect provides a connected account and payout path for each school or approved owner structure. Webhook records are deduplicated so a repeated provider event does not apply the same financial action twice. Payment-method request links are expiring, family-specific paths for securely collecting a method.

Scheduled billing foundations include recurring tuition creation, autopay attempts, payment reminders, dunning for failures, and reconciliation reports. “Dunning” means the controlled sequence used to notify a payer and recover a failed or overdue payment.

The **Billing Settings** area defines tuition plans, products, discounts, taxes, subsidy fields, processor settings, and policy notes.

The **Terminal Store** is a Stripe-hosted purchase flow for approved equipment or products. It is separate from tuition and requires live validation of pricing, tax, shipping, fulfillment, and support ownership before broad use.

The **Corporate Billing** view supports BEE Suite software invoices to a corporate customer based on active school-user counts and maintains an audit trail distinct from parent tuition billing.

No school should be asked to take live parent payments until its connected payout account, disclosures, refund and dispute process, reconciliation, webhook configuration, and accounting approval are ready.

### 6.10 Forms, documents, and signatures

The **Forms** area covers inquiry, tour, enrollment, emergency contact, medical and allergy, authorized pickup, permissions, and staff onboarding forms. Form submissions can carry status, structured answers, required fields, and signatures.

The **Documents** area holds family, child, enrollment, billing, staff, and compliance files. Documents have workflow statuses—draft, requested, submitted, approved, rejected, or expired—and can have expiration reminders, review actions, upload controls, and export packages.

Signature-request integration foundations support sending a document through an external signature provider. A signature image or checkbox is not automatically equivalent to a legally sufficient signature in every jurisdiction; policy and legal review remain necessary.

### 6.11 Compliance-readiness and records

The **Compliance** area brings together document checklists, certifications, immunizations, emergency drills, incidents, medication logs, allergy information, licensing records, tasks, reminders, audits, and export packages.

“Compliance-ready” means the software helps collect, organize, remind, review, and export records. It does not guarantee that a school complies with licensing, legal, medical, labor, payroll, tax, or accounting requirements.

Emergency drill logs record type, date, duration, participants, notes, and the next due date. Medication logs record the child, medication, dosage, route, administrator, time, notes, and parent-notification state. Compliance tasks link an owner, due date, priority, status, and related record. Certifications connect staff qualifications with expiration tracking.

### 6.12 Calendar and scheduling

The **Calendar** combines tours, school events, staff schedules, closures, birthdays, billing dates, training, and compliance reminders. Events support time zones, all-day state, recurrence information, audience visibility, center scope, and Google Calendar synchronization metadata.

Google Calendar integration is credential-gated and should preserve the BEE Suite record as an auditable source while recording provider identifiers and sync state.

### 6.13 Reporting, analytics, and reputation

The **Analytics** area covers enrollment funnel, lead sources, tour conversion, occupancy, revenue, balances, attendance, ratios, response time, incidents, compliance, campaigns, and reviews. Data can be filtered by the user's authorized centers and exported where allowed.

The **Reputation** area supports satisfaction surveys, NPS-style scores, review requests, testimonials, and response drafts. Public testimonial use requires explicit approval. AI-generated responses remain drafts.

The **Audit Logs** area records actor, action, resource, resource identifier, center, tenant, metadata, and time for sensitive operations such as permission changes, restricted record access, billing changes, incident review, documents, and support access.

### 6.14 Automations and notifications

The **Workflow Builder** models a trigger, conditions, actions, delays, execution status, and logs. Examples include sending a tour reminder, creating a missing-document task, or notifying a director when an incident is submitted.

The repository describes this as a foundation, not yet a complete no-code automation marketplace. Sensitive workflows must not silently activate merely because an AI suggested them.

The **Notification Center** gathers parent messages, inquiries, tours, billing alerts, compliance reminders, incidents, certification expirations, capacity warnings, AI suggestions, and system alerts. Dedupe keys prevent duplicate notices, while read, archived, and expiration fields control lifecycle.

### 6.15 Administration, branding, integrations, and support

The **Executive or Agency Admin** area manages organizations, owner groups, locations, scoped users, passwords, feature flags, subscriptions, rollout controls, and support-access evidence.

The **Team, Users, and Permissions** area manages roles, user activation, center and classroom assignment, access grants, session revocation, and sensitive visibility.

The **White-Label Settings** area controls brand name, logos, favicon, colors, theme, sender identity, custom-domain request, portal labels, login presentation, legal footer, terms, and privacy links. Custom-domain activation and asset upload require operational deployment and storage work in addition to saving a setting.

The **Integrations** area tracks configuration and credentials for Stripe, SendGrid, Twilio, Google services, OpenAI, storage, signatures, webhooks, lead sources, and reviews. Encrypted tenant credentials are stored separately from ordinary configuration data.

The **Developer Dashboard** and readiness APIs support platform diagnostics, integration delivery health, route and release evidence, and error reporting. These are administrative tools, not school-user workflows.

The **Help and Resources** areas provide role-specific SOPs, launch guides, payment instructions, kiosk guidance, security notes, and escalation paths.

### 6.16 Mr. Bee and AI assistance

Mr. Bee is the human-reviewed assistant layer. It can summarize a center, explain trends, draft replies and announcements, suggest lead follow-up, help word incident descriptions, prioritize tasks, or draft review responses.

AI output is labeled as a suggestion and should be reviewed before use. It must not make final safety, medical, custody, legal, licensing, payroll, tax, billing, or compliance decisions. AI context must be scoped before it is sent to a model, and sensitive output should be reviewable and auditable.

---

## 7. How the main end-to-end workflows operate

### 7.1 Inquiry to enrolled family

1. A prospective family submits a public inquiry or registration form.
2. The system validates the request, identifies the intended center, creates or matches a lead, records its origin, and routes notifications.
3. Enrollment staff add notes, tasks, messages, and a tour.
4. The lead advances through pipeline stages. Stage changes are recorded rather than inferred from a single screen.
5. The family completes an application, uploads requested documents, acknowledges policies, and provides signatures.
6. Staff review the application, resolve duplicates, and approve or reject it.
7. If approved and payment readiness is complete, the school can collect an approved fee or deposit.
8. The system creates or connects the family, guardians, children, enrollment, classroom, billing account, documents, and portal access.

### 7.2 A normal school day

1. A guardian or approved pickup checks a child in through the kiosk or an authorized staff workflow.
2. Attendance state and classroom counts update.
3. Teachers record meals, naps, diapers or potty activity, activities, notes, and media.
4. Ratio and staffing views use current attendance and assignment data to flag conditions for human attention.
5. If an incident occurs, the teacher documents it and the director reviews it.
6. The teacher completes the daily report, and approved content becomes visible to the linked family.
7. The guardian checks the child out, provides any required signature, and receives the day's information through the portal and configured channels.

### 7.3 Tuition and payment

1. A tuition plan or assignment determines what should be billed.
2. The billing run creates an invoice and itemized charges.
3. The invoice contributes to the family billing-account balance and ledger.
4. The parent pays through hosted checkout or an approved saved method, or autopay attempts the invoice.
5. Stripe sends a signed webhook event.
6. The server verifies and deduplicates the event, updates payment and invoice state, and records ledger evidence.
7. Failed or overdue items enter reminder and dunning workflows.
8. Billing staff reconcile application records, Stripe activity, and connected-account payout readiness.

### 7.4 Document lifecycle

1. A checklist determines which document is required for a family, child, enrollment, or staff member.
2. The document is requested and the recipient receives an allowed notification.
3. The recipient uploads or signs through a scoped route.
4. Staff review and approve or reject the submission.
5. An expiration date can generate reminders and a future replacement request.
6. Audit and export records preserve evidence of the workflow.

### 7.5 Weekly FTE reporting

1. Each center prepares counts for the reporting week.
2. A director submits total enrolled, full-time, part-time, age-group counts, calculated FTE, and notes.
3. Executive users see submitted and missing centers.
4. A reviewer requests correction or approves the report.
5. Authorized users compare historical trends or export a consolidated file.

---

## 8. Software architecture

### 8.1 Front end and server application

The application uses **Next.js 16 App Router**, **React 19**, and **TypeScript**. Tailwind CSS supplies utility styling; shadcn-style primitives provide consistent controls; Lucide supplies icons; Recharts supports visual analytics.

Next.js server pages load authenticated, scoped data and render role-aware workspaces. Client components handle interactive forms, filters, dialogs, offline queue behavior, and browser-only actions. Most authenticated modules are routed through `src/app/[slug]/page.tsx`, with dedicated pages for the public site, dashboards, role logins, registration, kiosk, setup, and payment-method forms.

The current repository includes a special warning: this Next.js version contains breaking changes and its bundled documentation in `node_modules/next/dist/docs/` must be consulted before changing framework behavior.

### 8.2 Server APIs

Routes under `src/app/api` implement authentication, inquiries, leads, tours, registration, operations records, teacher actions, parent actions, communications, billing, Stripe Connect, webhooks, kiosk, documents, compliance, reporting, FTE, integrations, AI, notifications, privacy requests, and system health.

Scheduled routes handle tuition billing, autopay, payment reminders, dunning, campaign scheduling, FTE reminders, document expirations, and integration retries. Scheduled endpoints require server-side authorization such as a cron secret and must be idempotent where repeated execution is possible.

### 8.3 Database and object model

The structured database is PostgreSQL, accessed through Prisma. Supabase provides the hosted Postgres environment and associated authentication and storage services. Prisma migrations and Supabase SQL migrations capture the database history.

The schema's major record groups are:

- **Tenancy and identity:** Tenant, Brand, Organization, OwnerGroup, Center, Classroom, User, UserAccessGrant, DeviceSession, Role, and Permission.
- **Branding:** BrandAsset, BrandCustomization, and WhiteLabelSettings.
- **Family and child:** Family, Guardian, Child, AuthorizedPickup, EmergencyContact, ChildMedicalNote, Allergy, ChildLiveLocation, and ChildLocationTransition.
- **Enrollment CRM:** Enrollment, EnrollmentPipelineStage, Lead, Tour, WaitlistEntry, Task, Note, Tag, and CustomField.
- **Communication and automation:** Message, MessageTemplate, Announcement, Campaign, Automation, AutomationRun, Notification, NotificationPreference, and IntegrationDelivery.
- **Forms and files:** Form, FormSubmission, and Document.
- **Classroom care:** AttendanceRecord, CheckInOutLog, DailyReport, ChildMedia, Meal, Nap, DiaperPottyLog, ActivityLog, and IncidentReport.
- **Operations and compliance:** EmergencyDrillLog, MedicationLog, ComplianceTask, StaffProfile, StaffSchedule, CalendarEvent, and Certification.
- **Finance:** BillingAccount, Invoice, InvoiceItem, Payment, LedgerEntry, Product, TuitionPlan, SubscriptionPlaceholder, PaymentMethodRequestLink, StripeWebhookEvent, and FteReport.
- **Feedback:** Review, Survey, and SurveyResponse.
- **Platform evidence and integrations:** AuditLog, DataDeletionRequest, RateLimitBucket, ClientErrorReport, Integration, IntegrationCredential, ProcareImportBatch, ProcareImportRow, AiSummary, and AiSuggestion.

### 8.4 Authentication and session security

Supabase Auth handles sign-in, password setup, forgot-password, and reset-password flows. The application uses secure session cookies and server-side user resolution. It supports first-login reset gates, login rate limiting, session-version revocation, device-session visibility, and logout.

Server routes must authenticate again and must not rely only on hidden buttons. After authentication, helpers calculate allowed tenant and center scopes and then apply workflow-specific checks. Service-role Supabase credentials remain server-only.

### 8.5 Authorization model

The access decision can be summarized as:

**Is the account authenticated and active? Is it in the correct tenant? Does its role permit this module and action? Does an access grant include this record's scope? Is the operation allowed on the record's current state?**

The last question matters. A user might have permission to manage incidents but still be unable to acknowledge an incident for an unrelated child. A billing user may manage invoices but not edit a restricted medical note. A read-only auditor may view a report but not mutate it.

### 8.6 Storage and files

Document, profile-photo, and child-media workflows use Supabase Storage foundations and scoped server routes. The database stores metadata and relationships; binary files belong in object storage. Access should use restricted buckets or signed access rather than permanent public URLs for sensitive files.

### 8.7 External services

- **Vercel:** Production hosting, server runtime, deployment, and scheduled routes.
- **Supabase:** PostgreSQL, authentication, storage, and migration environment.
- **Stripe:** Checkout, payment methods, Connect onboarding and payouts, webhooks, fee settings, and reconciliation.
- **SendGrid:** Transactional email delivery paths.
- **Twilio:** SMS delivery, status callbacks, and inbound reply paths.
- **Google Sheets:** Inquiry backup or operational snapshots where configured.
- **Google Calendar:** Calendar-event synchronization where configured.
- **OpenAI:** Mr. Bee summaries and drafts under human-review rules.
- **Signature and webhook providers:** Credential-gated extension points rather than assumed live connections.

### 8.8 White-label inheritance

Brand presentation can be set at several levels. Legacy brand settings coexist with newer customization and asset records. A lower-level center customization can provide local contact or portal details while inheriting the broader brand identity. Code resolving presentation must use a defined precedence so two settings do not conflict unpredictably.

### 8.9 Reliability and evidence

The platform uses dedupe keys for notifications and external deliveries, unique provider-event records for Stripe, retry metadata for integrations, rate-limit buckets for abuse control, and client-error aggregation for production diagnostics. Audit logs retain evidence for sensitive actions. Imports retain batch and row status so a migration can be inspected.

The build pipeline runs Prisma generation, linting, TypeScript checking, the Node test suite, and the Next.js production build. Tests cover role access, parent and teacher workflows, attendance, billing, Stripe, messaging, Twilio, imports, reporting, storage, readiness, and safety guardrails. Playwright scripts support browser smoke checks and visual captures.

---

## 9. Definitions of important states and terms

### Enrollment stages

- **New inquiry:** The family has made initial contact.
- **Contacted:** Staff have begun direct follow-up.
- **Tour scheduled:** A tour has a planned time.
- **Tour completed:** The family attended or the tour workflow was completed.
- **Application sent:** The family received an application path.
- **Application started:** Some application data has been saved.
- **Application submitted:** The family has submitted for review.
- **Documents pending:** Required supporting records are incomplete.
- **Deposit pending:** Enrollment is waiting on an approved deposit step.
- **Enrolled:** The child has an active or planned enrollment record.
- **Waitlisted:** The family is interested but placement is not currently available.
- **Lost or not a fit:** The opportunity closed without enrollment.

### Document states

- **Draft:** Prepared but not formally requested or submitted.
- **Requested:** The school asked the responsible person to provide it.
- **Submitted:** The recipient supplied it and it awaits or has entered review.
- **Approved:** Staff accepted the document.
- **Rejected:** Staff determined that it does not satisfy the requirement.
- **Expired:** Its valid period has ended.

### Payment and invoice states

- **Draft:** Prepared but not open for collection.
- **Open:** Amount is due or collectible.
- **Paid:** Required funds were successfully recorded.
- **Failed:** The payment attempt did not complete successfully.
- **Void:** The charge or invoice was cancelled without collection.
- **Refunded:** Previously collected funds were returned in full or according to recorded handling.

### Other core terms

- **RBAC:** Role-based access control—the baseline permissions associated with a job role.
- **Scope:** The specific records a person may access, such as a tenant, center, classroom, family, or child.
- **FTE:** Full-time equivalent, a standardized enrollment measure used to combine full- and part-time participation for reporting.
- **Occupancy:** Enrolled or present children compared with licensed or configured capacity, depending on the report.
- **Ratio:** Children compared with qualified staff for a room or age group. The software can flag data; staff remain responsible for live supervision and local rules.
- **Ledger:** An ordered financial history of charges, payments, credits, and resulting balance.
- **Reconciliation:** Comparing internal financial records with processor events and payouts to explain every difference.
- **Autopay:** An approved process that attempts payment using a saved method on a schedule.
- **Dunning:** The reminder and recovery workflow after a failed or overdue payment.
- **Webhook:** A signed server-to-server notification that an external provider sends when an event occurs.
- **Idempotency:** Designing a repeated request so it does not duplicate the business effect.
- **Dedupe key:** A stable identifier used to suppress duplicate records or deliveries.
- **PWA:** Progressive web app—a website that can be installed to a device home screen and provide app-like behavior.
- **RLS:** Row-level security—database policies that restrict which rows a database client can access. Application-layer authorization is still required.
- **PII:** Personally identifiable information, including data that can identify a child, family, or staff member.
- **White-label:** Presenting the system under a customer's brand while retaining the shared platform.
- **Human-in-the-loop:** A person reviews and decides whether to use an AI suggestion or other sensitive automated output.
- **Source system and external ID:** Metadata linking an imported record to the system and identifier from which it came.

---

## 10. Privacy, safety, and operational guardrails

The system handles child identity, guardian relationships, custody context, medical information, attendance, precise school location, incidents, billing, payment status, staff records, and compliance evidence. These are not ordinary marketing records.

Core safeguards include tenant isolation, scoped access grants, server-side authorization, route-specific workflow checks, secure cookies, rate limits, session revocation, restricted file access, redacted request logging, audit records, provider-signature verification, and human review.

Operational rules remain equally important:

- Never use another family's real record for training or screenshots.
- Verify the center, classroom, family, and child before changing a record.
- Treat custody, medical, incident, billing, and staff information as need-to-know.
- Do not place secrets, payment credentials, or service-role keys in client code.
- Do not treat an AI draft as approved communication.
- Do not use a dashboard ratio as a substitute for physically supervising a classroom.
- Do not enable live payment collection before payout, disclosure, webhook, refund, dispute, and reconciliation readiness is approved.
- Use preview, backups, duplicate review, and spot checks before a production import.
- Preserve audit evidence for access changes, incident review, document review, and financial changes.
- Follow the documented deletion-request workflow rather than immediately deleting regulated or legally retained records.

Data-deletion requests record verification, review requirements, retention notice, status, due date, completion, denial, and cancellation. This supports a controlled response when privacy rights and record-retention duties may conflict.

---

## 11. What is live, what is foundational, and what is future scope

The repository contains broad production-capable foundations, but the existence of a screen, model, or route does not prove that every school has completed the credentials, policy, data, and real-world validation required to use it live.

### Broadly implemented in the current version

Role-specific login and portal surfaces; tenant and scoped access; CRM and inquiry routing; registration and enrollment records; families and children; classrooms and staff; attendance and kiosk foundations; teacher daily reports, incidents, and media; parent portal workflows; billing accounts, invoices, ledgers, Checkout and Connect foundations; communications and delivery logs; documents and compliance records; FTE reporting; analytics; audit logs; white-label data; imports; readiness checks; and human-reviewed AI assistance.

### Implemented foundations that require per-school rollout validation

Live Stripe payouts and payment policy; recurring billing and autopay; ACH or card recovery rules; Twilio compliance and sender registration; SendGrid domain authentication; Google credentials; custom-domain activation; signature-provider configuration; storage hardening; payment-terminal fulfillment; production monitoring; real-school ProCare field mapping; and final role-by-role regression testing.

### Known roadmap or incomplete areas

A full no-code automation marketplace; fully native iOS and Android experiences with native push and complete offline sync; curriculum and lesson planning; developmental milestones and formal assessments; meal planning and CACFP; full payroll-provider exports; multi-state licensing packs; advanced AI forecasting; a broad public partner API; and a mature third-party marketplace.

Compliance-readiness features support operations but do not replace professional legal, licensing, medical, payment, tax, payroll, or accounting advice.

---

## 12. Repository map for technical readers

- `src/app` contains public pages, role login pages, authenticated module pages, API routes, webhooks, and scheduled endpoints.
- `src/components` contains the application shell, dashboard panels, portal workspaces, forms, tables, dialogs, and shared UI primitives.
- `src/lib` contains authentication, role and scope rules, workflow guardrails, billing, communications, reporting, import, Stripe, Supabase, storage, and notification logic.
- `prisma/schema.prisma` is the canonical Prisma object model.
- `prisma/migrations` and `supabase/migrations` contain database change history.
- `tests` contains the Node test suite for critical workflows and guardrails.
- `scripts` contains environment, import, seeding, payout, rollout, audit, graphics, and readiness utilities.
- `docs` contains product notes, architecture, security guidance, setup instructions, SOPs, rollout plans, and legal drafts.
- `public` contains brand assets, the service worker, location data, and public inquiry scripts.
- `native` and `ios` contain native-shell and Capacitor-related parent-app material.
- `wordpress-avada` contains public website inquiry embed examples.
- `output` contains generated screenshots, print packs, PDFs, and launch artifacts—not application source.

The main dynamic authenticated router is `src/app/[slug]/page.tsx`. The module catalog and navigation are in `src/lib/demo-data.ts`. Module access and dashboard-lens rules are in `src/lib/rbac.ts`. Authentication and scoped query helpers live in `src/lib/auth.ts`. The data model is in `prisma/schema.prisma`.

---

## 13. A concise spoken tour

The BEE Suite is a secure operating system for childcare organizations. It connects the full family journey—from an inquiry, tour, and application to enrollment, classroom care, parent communication, tuition billing, and reporting.

Each person receives a different experience. Platform owners and brand administrators manage the network. Regional managers compare assigned schools. Directors run a center. Assistant directors support daily operations. Billing administrators handle money workflows. Teachers receive a classroom-safe mobile workspace. Parents see only their own family portal. Authorized pickups receive only the check-in permissions they need. Auditors review scoped evidence without editing it.

The dashboard uses lenses. A platform lens emphasizes system-wide operations; brand and regional lenses compare groups of schools; a director lens focuses on one center; and billing, teacher, parent, and pickup lenses focus on the work of those users. A lens changes presentation, not security.

The app includes CRM leads, tours, waitlists, registration, family and child profiles, classrooms, staff, attendance, kiosk check-in, daily reports, incidents, photos, messages, announcements, campaigns, forms, documents, compliance records, calendars, invoices, payments, Stripe payouts, FTE reporting, analytics, reviews, notifications, branding, integrations, permissions, audit logs, and a human-reviewed AI assistant called Mr. Bee.

Technically, it is a Next.js and React web application hosted on Vercel. PostgreSQL and Prisma hold structured records. Supabase supplies hosted database, authentication, and storage workflows. Stripe supplies hosted checkout and connected-account payout foundations. SendGrid and Twilio provide email and text delivery paths. OpenAI provides drafts and summaries that a person must review.

Security is based on both role and scope. The system first separates tenants, then checks the user's role and grants for a brand, organization, owner group, center, classroom, family, or child. Sensitive data and workflow state receive additional checks. The safest way to understand the product is that every screen is a different window onto the same connected operating record, but each person receives only the window needed for their job.

The product is broad, but rollout readiness is school-specific. Live payments, communication providers, imports, custom domains, signatures, and other external actions require correct credentials, policies, data validation, and real-school testing. The software assists compliance and decision-making; it does not replace human supervision, professional advice, or accountable school leadership.

---

## 14. Source-of-truth references

This guide consolidates the implementation and existing operational documentation as of the snapshot date. When code and prose disagree, verify the current code and migration state before making a production decision.

Primary references:

- `README.md`
- `docs/PRODUCT.md`
- `docs/ARCHITECTURE.md`
- `docs/user-feature-access-map.md`
- `docs/SECURITY_PRIVACY_OPERATIONS.md`
- `docs/sops/`
- `src/lib/rbac.ts`
- `src/lib/auth.ts`
- `src/lib/demo-data.ts`
- `src/app/`
- `prisma/schema.prisma`
- `tests/`

**End of guide.**
