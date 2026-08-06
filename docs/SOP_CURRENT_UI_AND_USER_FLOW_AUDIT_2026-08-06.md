# SOP Current UI And User-Flow Audit - August 6, 2026

Baseline commit reviewed: `33f526b2680bb699298b025945a1bc15810a6972`

## Scope

This audit compares the public Resource Center and role SOPs with the current application navigation, login routing, role permissions, family intake, parent access, billing, staff, reporting, AI, and reliability behavior.

## Current Role Entry Points

- Directors, assistant directors, and billing admins: `https://thebeesuite.io/directors`
- Teachers: `https://thebeesuite.io/teachers`
- Parents and authorized pickups: `https://thebeesuite.io/parents`
- Executives, regional managers, and auditors: `https://thebeesuite.io/executives`
- General fallback: `https://thebeesuite.io/login`

## Current Consolidated Workspaces

- School Operations: Enrollment status, Classrooms, Attendance, Daily reports, Incidents
- Families & Communication: Families, Children, Messages, Media review
- Staff & Access: Teachers, Team permissions
- Billing & Payments: Billing & invoices, Payments
- Records & Compliance: Forms, Documents, Compliance
- Enrollment CRM: Leads, Pipeline, Tours, Waitlist
- Campaigns & Automations: Campaigns, Automations
- Insights & Reputation: Enrollment status, Analytics, Reputation
- Settings & Setup: Settings, Integrations, School setup, Notifications, White-label

## Recent User-Facing Changes Covered

| Change | Documentation updated |
| --- | --- |
| Enrollment Status Summary promoted on director dashboards and School Operations | Director, executive, system manual, public resources |
| One-save family, guardian, child, billing account, and kiosk PIN intake | Director, system manual, public resources |
| One-at-a-time parent invitation and resend flow | Director, parent, school transition, public resources |
| Accepted versus delivered invitation status and manual-copy fallback | Director, parent, public resources |
| Parent invites decoupled from ProCare batch completeness | Director, system manual, school transition, public resources, invite helper text |
| Ambiguous guardian/family access fails closed | Director, parent, system manual, school transition |
| Active versus Past & Other enrollment visibility | Director, system manual |
| Withdrawn families excluded from active receivables | Director, billing, system manual |
| Per-child canonical tuition and family total rollup | Director, billing, system manual |
| Zero-dollar agency-funded assignment | Director, billing, system manual |
| Weekly and four-week tuition cadence | Director, billing, school transition, public resources |
| Itemized tuition credits | Billing |
| Safe unpaid-invoice void behavior | Director, billing, system manual |
| School absorbs Stripe processing costs; no parent surcharge | Director, billing, parent, executive, system manual, payment guide, public resources |
| Executive school filter and terminated staff with selected-period hours | Executive |
| Confirmed school-scoped AI mutations | Director, executive, system manual |
| Performance-safe lightweight notification refresh and manual record verification | Director, teacher, executive, system manual |

## Files Updated

- `docs/sops/README.md`
- `docs/sops/SCHOOL_SYSTEM_OPERATING_MANUAL.md`
- `docs/sops/SCHOOL_TRANSITION_SETUP_AND_CUTOVER_SOP.md`
- `docs/sops/EXECUTIVE_ADMIN_SOP.md`
- `docs/sops/DIRECTOR_SOP.md`
- `docs/sops/BILLING_ADMIN_SOP.md`
- `docs/sops/TEACHER_SOP.md`
- `docs/sops/PARENT_PORTAL_SOP.md`
- `docs/sops/PARENT_PORTAL_INSTALL_GUIDE.md`
- `docs/sops/PARENT_ACH_PAYMENT_GUIDE.md`
- `docs/sops/KIOSK_AND_AUTHORIZED_PICKUP_GUIDE.md`
- `src/app/resources/page.tsx`
- `src/components/parent-portal-invite-button.tsx`
- `tests/documentation-current-flows.test.ts`

## Generated Packet Rule

The Markdown and PDF packet under `output/pdf/TEAM_SHARE_GUIDES_CURRENT/` is generated output. Rebuild it from this source revision before distributing PDFs; do not hand-edit binary PDFs or distribute a packet whose revision date predates the source SOP.
