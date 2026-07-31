# Incident And Escalation Matrix

Brenden remains accountable until each named person accepts the role and coverage window.

## Owner roster

| Role | Primary | Backup | Coverage/time zone | Contact route | Acceptance/date |
| --- | --- | --- | --- | --- | --- |
| Incident commander / stop authority | Brenden Bruner | **REQUIRED — unaccepted** | Primary coverage accepted; after-hours backup coverage unaccepted | Existing approved direct contact; exact paging route still required | Brenden accepted 2026-07-20 |
| Technical release / Vercel | Brenden Bruner | **REQUIRED — unaccepted** | Primary coverage accepted; after-hours backup coverage unaccepted | Existing approved direct contact; exact paging route still required | Brenden accepted 2026-07-20 |
| Database / Supabase | Brenden Bruner | **REQUIRED — unaccepted** | Primary coverage accepted; after-hours backup coverage unaccepted | Existing approved direct contact; exact paging route still required | Brenden accepted 2026-07-20 |
| Monitoring and alerts | ______ | ______ | ______ | ______ | ______ |
| Security/privacy | ______ | ______ | ______ | ______ | ______ |
| Billing/Stripe | ______ | ______ | ______ | ______ | ______ |
| Communications/SendGrid/Twilio | ______ | ______ | ______ | ______ | ______ |
| School/corporate operations | ______ | ______ | ______ | ______ | ______ |
| ProCare/data reconciliation | ______ | ______ | ______ | ______ | ______ |
| After-hours support | ______ | ______ | ______ | ______ | ______ |

## Severity and response

| Severity | Examples | Acknowledge target | Immediate authority/action | Escalation |
| --- | --- | --- | --- | --- |
| P0 | Systemic outage; cross-school/family exposure; payment misrouting; destructive data event | 15 minutes | Stop affected rollout/module; preserve evidence and writes; rollback/restore decision within 30 minutes; begin approved recovery within 60 minutes | Primary immediately, backup at 15 minutes if unacknowledged, Brenden/executive and applicable vendor |
| P1 | Critical workflow broken for a school; cron/billing/import failure without safe completion | 30 minutes | Hold affected action; establish an owned recovery plan within 60 minutes; use approved workaround only | Module owner, incident commander if target missed or impact expands |
| P2 | Important defect with safe workaround | 1 business day | Record owner/workaround/retest | Release owner and next patch |
| P3 | Cosmetic/enhancement | 5 business days | Backlog | Product owner |

Every incident record must include environment, school/tenant when applicable, reporter, timestamps/time zone, deployment/request ID, expected/actual, scope, privacy-safe evidence, decisions, communications owner, recovery, reconciliation, and follow-up owner/date. Never paste secrets or unnecessary child/family/payment/medical data.
