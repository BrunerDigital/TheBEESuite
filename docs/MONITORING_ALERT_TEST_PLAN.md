# Monitoring And Alert Test Plan

Use this plan in an approved safe environment before a wider-wave release. It does not authorize production configuration changes or synthetic failures against production.

## Acceptance record

- Monitoring owner: ____________________  Accepted/date: ____________________
- Incident commander: __________________  Accepted/date: ____________________
- After-hours primary/backup: __________________ / __________________
- Approved environment and test window: ____________________
- Evidence folder/link: ____________________

## Required coverage

| Signal | Detection target | Severity | Recipient | Evidence required |
| --- | --- | --- | --- | --- |
| Public `/api/health` unavailable or non-2xx | Two consecutive failures within 5 minutes | P0 | On-call + incident commander | Probe history and delivered alert |
| Database unavailable | Health 503 or readiness Database blocked | P0 | On-call + database owner | Redacted response and delivered alert |
| API 5xx rate | Agreed threshold/window: __________ | P1/P0 by scope | On-call | Query, threshold, and alert |
| Critical workflow synthetic | Login/read-only safe flow fails | P1 | On-call + release owner | Synthetic run and alert |
| Cron missed/failed | No success within job-specific window | P1; billing may be P0 | On-call + job owner | Last success and alert |
| Client/server operational error | Agreed count/rate threshold | P1 | On-call | Redacted event and alert |
| Vendor degradation | Vercel/Supabase/Stripe/SendGrid/Twilio as applicable | P1/P0 by impact | Vendor owner + incident commander | Vendor status and escalation record |

Authenticated `/api/system/readiness` must not be exposed as a public uptime probe. Use an approved scoped synthetic account or an internal operator check.

## Safe test cases

For each case, record start time, injected condition, detection time, alert delivery time, acknowledgement time, recovery time, recipients, screenshots/export, and pass/fail.

1. Point a non-production probe at a controlled failing endpoint or temporarily disable only the safe test target.
2. Generate a privacy-safe synthetic server error with no child, family, payment, medical, or credential data.
3. Make a safe test cron return a controlled failure or withhold its test success marker.
4. Exercise acknowledgement, primary-to-backup escalation, incident channel/ticket creation, and recovery notification.
5. Confirm alert content contains environment, service, severity, timestamp, route/job, deployment/request ID when available, and runbook link, but no secrets or personal data.

## Pass criteria

- Every required signal is detected inside its approved threshold.
- Primary and backup routes receive and acknowledge the alert inside the accepted response target.
- P0 routing reaches the incident commander and stop authority.
- Recovery notification fires and the incident record links the evidence.
- No production data, credentials, or customer communication are used.

Final result: PASS / FAIL  Owner signature/date: ____________________
