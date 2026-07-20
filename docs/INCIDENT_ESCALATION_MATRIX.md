# Incident And Escalation Matrix

Brenden remains accountable until each named person accepts the role and coverage window.

## Owner roster

| Role | Primary | Backup | Coverage/time zone | Contact route | Acceptance/date |
| --- | --- | --- | --- | --- | --- |
| Incident commander / stop authority | ______ | ______ | ______ | ______ | ______ |
| Technical release / Vercel | ______ | ______ | ______ | ______ | ______ |
| Database / Supabase | ______ | ______ | ______ | ______ | ______ |
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
| P0 | Systemic outage; cross-school/family exposure; payment misrouting; destructive data event | ______ minutes | Stop affected rollout/module; preserve evidence and writes; page incident commander | Primary immediately, backup after ______ minutes, Brenden/executive and applicable vendor |
| P1 | Critical workflow broken for a school; cron/billing/import failure without safe completion | ______ minutes | Hold affected action; use approved workaround only | Module owner, incident commander if target missed or impact expands |
| P2 | Important defect with safe workaround | ______ business hours | Record owner/workaround/retest | Release owner and next patch |
| P3 | Cosmetic/enhancement | ______ business days | Backlog | Product owner |

Every incident record must include environment, school/tenant when applicable, reporter, timestamps/time zone, deployment/request ID, expected/actual, scope, privacy-safe evidence, decisions, communications owner, recovery, reconciliation, and follow-up owner/date. Never paste secrets or unnecessary child/family/payment/medical data.
