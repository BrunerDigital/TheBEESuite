# The BEE Suite Role SOP Library

Last updated: August 6, 2026

Use these SOPs when training a school team or sending role-specific instructions before a launch, pilot, parent portal rollout, billing rollout, or kiosk rollout.

For the owner/director transition announcement, use `SCHOOL_TRANSITION_SETUP_AND_CUTOVER_SOP.md` with the curated packet in `output/pdf/SCHOOL_TRANSITION_EMAIL_PACKET_CURRENT/`.

Latest sendable packet: `output/pdf/TEAM_SHARE_GUIDES_CURRENT/`. This stable path contains the refreshed Markdown copies, bundled visuals, matching PDFs, and a one-page index. Rebuilds replace this packet instead of creating another dated version.

## Current UI Route Map

| User | Entry point | Default workspace |
| --- | --- | --- |
| Director, assistant director, billing admin | `https://thebeesuite.io/directors` | `/dashboard` |
| Teacher | `https://thebeesuite.io/teachers` | `/teacher-portal` |
| Parent or authorized pickup | `https://thebeesuite.io/parents` | `/parent-portal` |
| Executive, regional, auditor | `https://thebeesuite.io/executives` | `/dashboard` |

Current consolidated workspaces:

- `School Operations`: Enrollment status, Classrooms, Attendance, Daily reports, Incidents.
- `Families & Communication`: Families, Children, Messages, Media review.
- `Staff & Access`: Teachers, Team permissions.
- `Billing & Payments`: Billing & invoices, Payments.
- `Records & Compliance`: Forms, Documents, Compliance.
- `Enrollment CRM`: Leads, Pipeline, Tours, Waitlist.
- `Campaigns & Automations`: Campaigns, Automations.
- `Insights & Reputation`: Enrollment status, Analytics, Reputation.
- `Settings & Setup`: Settings, Integrations, School setup, Notifications, White-label.

## Documentation Baseline - August 6, 2026

The role SOPs incorporate the current new-enrollment/parent-invitation flow, parent delivery statuses and manual fallback, ambiguous-family fail-closed behavior, active-versus-past enrollment visibility, Enrollment Status Summary exports, per-child tuition and family rollups, zero-dollar agency-funded assignments, four-week tuition cadence, invoice void rules, withdrawn-family balance filtering, school-absorbed Stripe processing costs, school-filtered payroll review, confirmed AI changes, and performance-safe manual record verification.

When the UI, permissions, labels, routes, or workflow guardrails change, update the affected role SOP, this index, and `src/app/resources/page.tsx` in the same pull request. Do not describe a feature as live merely because code exists; the named school still requires the applicable launch gate.

## Send-Out Order

1. Executives and owners: send `SCHOOL_SYSTEM_OPERATING_MANUAL.md` and `EXECUTIVE_ADMIN_SOP.md` first.
2. Directors and assistant directors: send `DIRECTOR_SOP.md` after the school workspace, classrooms, users, billing readiness, and launch checklist are reviewed.
3. Billing admins: send `BILLING_ADMIN_SOP.md` before payment method requests, tuition runs, card/bank payments, autopay, or Terminal payments are promoted.
4. Teachers: send `TEACHER_SOP.md` after teacher accounts, classroom assignments, and rosters are confirmed.
5. Parents and guardians: send `PARENT_PORTAL_INSTALL_GUIDE.md`, `PARENT_PORTAL_SOP.md`, and `PARENT_ACH_PAYMENT_GUIDE.md` only after guardian emails are correct and parent access is ready.
6. Authorized pickups and front desk staff: send `KIOSK_AND_AUTHORIZED_PICKUP_GUIDE.md` before the lobby kiosk is live.

## Role Guides

- `docs/sops/SCHOOL_TRANSITION_SETUP_AND_CUTOVER_SOP.md` - school-specific owner payout setup, director data validation, staff and parent readiness, billing cutover, independent launch gates, and GO/NO-GO sign-off.
- `docs/sops/SCHOOL_SYSTEM_OPERATING_MANUAL.md` - full system breakdown, launch sequence, key functions, role handoff, and visual training assets.
- `docs/sops/EXECUTIVE_ADMIN_SOP.md` - executive setup, multi-location oversight, FTE review, payment readiness, integrations, permissions, and support access.
- `docs/sops/DIRECTOR_SOP.md` - director daily operations, families, classrooms, billing oversight, parent portal launch, documents, communications, and escalation.
- `docs/sops/BILLING_ADMIN_SOP.md` - school-scoped tuition plans, Thursday invoice scheduling, card/bank choices, autopay, Terminal payments, failed payments, dunning, and reconciliation.
- `docs/sops/TEACHER_SOP.md` - classroom attendance, daily reports, media, incidents, messages, staff kiosk, and offline queue behavior.
- `docs/sops/PARENT_PORTAL_INSTALL_GUIDE.md` - parent device install instructions for iPhone, iPad, Android, Fire tablet, and desktop.
- `docs/sops/PARENT_PORTAL_SOP.md` - parent login, family dashboard, invoices, documents, messages, incident acknowledgements, and troubleshooting.
- `docs/sops/PARENT_ACH_PAYMENT_GUIDE.md` - parent card-first payment choices, saved card/bank setup, one-time bank payment, autopay status, and exact-total review.
- `docs/sops/KIOSK_AND_AUTHORIZED_PICKUP_GUIDE.md` - lobby kiosk PIN/QR check-in/out, guardian signature, staff clock-in/out, and warning handling.

## Visual Assets

Screenshot standard:

- Teachers: iPad and desktop, with iPad shown first for classroom work.
- Directors and executives: desktop.
- Parents: iPhone, iPad, and desktop, with iPhone used for most examples.
- Role screenshots use the current light-mode UI, exclude warning banners and developer controls, and contain privacy-safe seeded demo records only. Never replace them with production family, child, staff, billing, medical, custody, or authentication data.

- `public/brand/the-bee-suite/screenshots/current/` - canonical privacy-safe light-mode role screenshots for iPhone, iPad, and desktop.
- `public/brand/the-bee-suite/sop-graphics/current/` - canonical teacher, director, executive, parent, and role/device training graphics.
- `public/brand/the-bee-suite/explainers/current/` - canonical launch, parent access, payment, tuition, daily operations, kiosk, FTE, and Terminal flows.

## Training Notes

- Keep each training session role-specific. Do not train parents on director or teacher workflows.
- Use real school examples only when the data has already been reviewed for accuracy.
- Do not share admin screenshots with parents if the screenshot includes another family, child, balance, staff record, incident, or document.
- Treat custody, medical, billing, incident, staff, and compliance information as need-to-know.
- If a workflow looks wrong during training, stop and fix the underlying record before telling staff to work around it.
- When demonstrating family or billing work, name the school, family, child, and payer context before saving.
- Treat the assigned child billing record as the source of truth for weekly tuition. Do not create a second editable family-level weekly rate.
- Use `Charge This Child Now` only for a separately approved immediate invoice; saving recurring tuition is the normal assignment action.
- ProCare preparation, preview, import, cutover, parent invitations, kiosk, billing, and payments are independent gates. Training material does not activate any of them.

## Launch Sign-Off

Before the guides are sent broadly, the school should confirm:

- Executives can see only the intended tenant, brand, owner group, and locations.
- Directors can log in and see the correct school.
- Teachers can log in and see the correct classroom rosters.
- Parent guardian emails are accurate on family profiles.
- Parent portal login is available from `https://thebeesuite.io/parents`; role-specific staff entry points are `/directors`, `/teachers`, and `/executives`.
- Parent invitations use the verified guardian email, secure parent URL, and school-issued first-login password. Parents may change the password later; staff must never ask for it to be sent back.
- Kiosk PIN or QR credentials are ready before lobby check-in is used.
- Stripe payout and checkout readiness are complete before parents are asked to pay online.
- Billing and document workflows have been tested with one low-risk family record.
- The support escalation path is clear for executives, directors, billing users, teachers, parents, and front desk staff.
- The named school/module has a dated GO decision; a successful software release is not that decision.
