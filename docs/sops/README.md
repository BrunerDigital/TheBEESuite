# The BEE Suite Role SOP Library

Last updated: July 7, 2026

Use these SOPs when training a school team or sending role-specific instructions before a launch, pilot, parent portal rollout, billing rollout, or kiosk rollout.

## Send-Out Order

1. Executives and owners: send `SCHOOL_SYSTEM_OPERATING_MANUAL.md` and `EXECUTIVE_ADMIN_SOP.md` first.
2. Directors and assistant directors: send `DIRECTOR_SOP.md` after the school workspace, classrooms, users, billing readiness, and launch checklist are reviewed.
3. Billing admins: send `BILLING_ADMIN_SOP.md` before payment method requests, tuition runs, ACH verification, or card payments are promoted.
4. Teachers: send `TEACHER_SOP.md` after teacher accounts, classroom assignments, and rosters are confirmed.
5. Parents and guardians: send `PARENT_PORTAL_INSTALL_GUIDE.md`, `PARENT_PORTAL_SOP.md`, and `PARENT_ACH_PAYMENT_GUIDE.md` only after guardian emails are correct and parent access is ready.
6. Authorized pickups and front desk staff: send `KIOSK_AND_AUTHORIZED_PICKUP_GUIDE.md` before the lobby kiosk is live.

## Role Guides

- `docs/sops/SCHOOL_SYSTEM_OPERATING_MANUAL.md` - full system breakdown, launch sequence, key functions, role handoff, and visual training assets.
- `docs/sops/EXECUTIVE_ADMIN_SOP.md` - executive setup, multi-location oversight, FTE review, payment readiness, integrations, permissions, and support access.
- `docs/sops/DIRECTOR_SOP.md` - director daily operations, families, classrooms, billing oversight, parent portal launch, documents, communications, and escalation.
- `docs/sops/BILLING_ADMIN_SOP.md` - tuition plans, invoices, ACH/instant-bank setup, card policy, payment method requests, failed payments, dunning, and reconciliation.
- `docs/sops/TEACHER_SOP.md` - classroom attendance, daily reports, media, incidents, messages, staff kiosk, and offline queue behavior.
- `docs/sops/PARENT_PORTAL_INSTALL_GUIDE.md` - parent device install instructions for iPhone, iPad, Android, Fire tablet, and desktop.
- `docs/sops/PARENT_PORTAL_SOP.md` - parent login, family dashboard, invoices, documents, messages, incident acknowledgements, and troubleshooting.
- `docs/sops/PARENT_ACH_PAYMENT_GUIDE.md` - parent bank verification, ACH/instant-bank payment, autopay status, and card fee avoidance guidance.
- `docs/sops/KIOSK_AND_AUTHORIZED_PICKUP_GUIDE.md` - lobby kiosk PIN/QR check-in/out, guardian signature, staff clock-in/out, and warning handling.

## Visual Assets

- `public/brand/the-bee-suite/explainers/bee-suite-school-launch-swimlane-2026-07-01.svg`
- `public/brand/the-bee-suite/explainers/bee-suite-daily-user-quick-start-2026-07-01.svg`
- `public/brand/the-bee-suite/explainers/bee-suite-director-dashboard-guide-2026-06-25.png`
- `public/brand/the-bee-suite/explainers/bee-suite-parent-dashboard-guide-2026-06-25.png`
- `docs/BEE_SUITE_PAYMENTS_ARCHITECTURE_VISUAL_2026-06-08.png`
- `screenshots/dashboard-desktop.png`
- `screenshots/parent-portal.png`
- `screenshots/teacher-mobile.png`

## Training Notes

- Keep each training session role-specific. Do not train parents on director or teacher workflows.
- Use real school examples only when the data has already been reviewed for accuracy.
- Do not share admin screenshots with parents if the screenshot includes another family, child, balance, staff record, incident, or document.
- Treat custody, medical, billing, incident, staff, and compliance information as need-to-know.
- If a workflow looks wrong during training, stop and fix the underlying record before telling staff to work around it.

## Launch Sign-Off

Before the guides are sent broadly, the school should confirm:

- Executives can see only the intended tenant, brand, owner group, and locations.
- Directors can log in and see the correct school.
- Teachers can log in and see the correct classroom rosters.
- Parent guardian emails are accurate on family profiles.
- Parent portal login is available from `https://thebeesuite.io/parents` and `https://thebeesuite.io/login`.
- The default parent password is `BusyBees` unless a parent has already reset their password or the school changed launch instructions.
- Kiosk PIN or QR credentials are ready before lobby check-in is used.
- Stripe payout and checkout readiness are complete before parents are asked to pay online.
- Billing and document workflows have been tested with one low-risk family record.
- The support escalation path is clear for executives, directors, billing users, teachers, parents, and front desk staff.
