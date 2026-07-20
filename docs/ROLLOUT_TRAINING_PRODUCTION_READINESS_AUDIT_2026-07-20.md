# Rollout and Training Production-Readiness Audit

Date: July 20, 2026  
Priority: P2  
Accountable human: Brenden until explicitly delegated and accepted

## Decision

The wider school wave is **NO-GO**. Kokomo may continue normal production use. This audit does not select a wave, authorize a cutover, send parent invitations, enable kiosk use, enable billing, retire ProCare, contact users, or authorize a production deployment.

## Production-ready definition

The rollout and training workstream is production-ready only when every selected school has one completed `ROLLOUT_TRAINING_PER_SCHOOL_CONTROL_RECORD.md` that:

1. names the school, its location ID in `ST | City` format (the center ID and location ID are the same identifier), launch date and time zone, and the exact modules intended for operational launch;
2. records an accepted human owner and backup for launch, director signoff, data/import, billing/Stripe, technical release, training, and first-week support;
3. records role-specific training completion and evidence for every role using the selected modules;
4. publishes support hours, intake method, severity/response targets, escalation path, and launch-week review schedule;
5. defines module-specific stop conditions, rollback actions, reconciliation ownership, and re-entry criteria while ProCare remains the source of truth;
6. records separate decisions for operations/CRM, parent invitations and kiosk, and billing/payments; and
7. contains all applicable director, corporate, billing/accounting, technical/release, and ProCare cutover signatures.

A rollout record coordinates evidence; it does not replace the underlying setup, import, access, payment, communications, security, QA, or deployment evidence required by `SCHOOL_ROLLOUT_READINESS_CHECKLIST_2026-07-18.md`.

## Evidence reviewed

- `PRODUCTION_READINESS_WORKSTREAMS_2026-07-20.md`
- `SCHOOL_ROLLOUT_READINESS_CHECKLIST_2026-07-18.md`
- `KIDCITY_ALL_SCHOOLS_DEPLOYMENT_PLAN_2026-07-09.md`
- `KIDCITY_CORPORATE_ROLLOUT_CHECKLIST_2026-07-07.md`
- `kidcity-enterprise-rollout/DIRECTOR_IMPLEMENTATION_GUIDE.md`
- `kidcity-enterprise-rollout/RISK_CONTINGENCY_ROLLBACK.md`
- `SUPPORT_ESCALATION_GUIDE.md`
- role quick starts and SOPs for executive/admin, director, billing, teacher, parent, and kiosk users
- `BEE_SUITE_SCHOOL_DATA_IMPORT_AND_PARENT_LAUNCH_EMAILS.md`

The repository already has useful role guides, training schedules, severity language, rollback actions, and parent-launch communications. The missing control was one current, per-school record that binds those materials to the selected wave, accepted owners, dated evidence, separate activation decisions, reviews, and signatures. `ROLLOUT_TRAINING_PER_SCHOOL_CONTROL_RECORD.md` supplies that repo-safe control.

## Findings

### BLOCKER

1. **The actual first wave, dates, and intended live modules are not selected.** Owner: Brenden. Exact retest: create one control record per selected school and complete its school/scope section with the shared center/location ID in `ST | City` format, time zone, launch window, and explicit enabled/held modules.
2. **Per-school launch ownership is not accepted and recorded.** Owner: Brenden. Exact retest: each required owner and backup records a name, contact path, acceptance date, and coverage window. A Codex task is not a business owner.
3. **No current per-school record proves role training completion.** Owner: Brenden. Exact retest: attach dated attendance and scenario evidence for each applicable role; unresolved scenarios have an owner, severity, workaround, and retest result.
4. **Support coverage, escalation contacts, and response targets are not published for a selected wave.** Owner: Brenden. Exact retest: record launch-day and first-week coverage, backup coverage, intake channel, severity targets, and the person authorized to declare a stop.
5. **Cutover, stop, rollback, reconciliation, and re-entry decisions are not approved per selected school/module.** Owner: Brenden. Exact retest: complete the control record's stop/rollback table and obtain the applicable written acknowledgements before operational cutover.
6. **Required per-school signatures are absent.** Owner: Brenden. Exact retest: record director, corporate, billing/accounting, technical/release, and ProCare cutover decisions with names, dates, scope, and exceptions. Billing/accounting may sign `NOT ENABLED` only when payments remain explicitly off.

### REQUIRED BEFORE WAVE

1. **Launch-week reviews are not scheduled.** Owner: Brenden. Exact retest: schedule morning readiness, midday issue review, end-of-day reconciliation, day-1 director check-in, first-billing review if applicable, and week-1 review with facilitator and evidence location.
2. **Training must match the modules actually enabled.** Owner: Brenden. Exact retest: map each enabled module to the affected roles, guide/version used, trainer, completion date, practical scenario, and remediation result.
3. **The system of record during parallel operation is not recorded per workflow.** Owner: Brenden. Exact retest: state whether ProCare or The BEE Suite is authoritative for attendance, roster/family changes, billing, payments, documents, communications, and reporting; publish the reconciliation owner and cadence.
4. **Parent invitations/kiosk and billing/payments need independent go/no-go records.** Owner: Brenden. Exact retest: record three separate decisions: operations/CRM, parent invitations/kiosk, and billing/payments. Approval of one does not approve another.
5. **Older sequencing guidance must not be treated as a current wave decision.** Owner: Brenden. `KIDCITY_ALL_SCHOOLS_DEPLOYMENT_PLAN_2026-07-09.md` recommends Longmont for controlled validation, but the July 18 checklist records 160 unassigned children and no linked guardian logins or PINs. Exact retest: Brenden explicitly selects the wave using current readiness evidence; no school is selected merely because an older plan names it.
6. **Training and support evidence must be retained with the school packet.** Owner: Brenden. Exact retest: link attendance, scenario results, issue log, review notes, rollback acknowledgement, and signed decisions from the per-school record.

### FOLLOW-UP

1. **Create maintained training-version metadata.** Owner: Brenden. Record the guide name and revision used for each session so changed workflows trigger targeted retraining.
2. **Add adoption and support trends to corporate review.** Owner: Brenden. After launch authorization, review login/setup completion, attendance reconciliation, invitation failures, support volume, and training refresh needs without weakening stop conditions.
3. **Run a post-launch retrospective after any P0/P1 event or rollback.** Owner: Brenden. Use the existing risk/rollback guide and assign each corrective action a human owner and due date.

## Gate separation

| Decision | Minimum rollout/training evidence | What it does not authorize |
| --- | --- | --- |
| Operations/CRM | Selected modules, trained operating roles, support coverage, stop/rollback plan, underlying domain gates and signatures | Parent invitations, kiosk activation, live billing, payments, or ProCare retirement |
| Parent invitations/kiosk | Family-scope and custody/access evidence, parent/front-desk training, support coverage, director approval, invitation/kiosk domain gates | Billing or payments |
| Billing/payments | Billing training, accounting ownership, approved support/refund/dispute path, and all payment/Stripe evidence and signatures | Any module not separately approved |
| ProCare retirement | Reconciled parallel operation, no blocking defects, completed launch reviews, rollback/re-entry disposition, and written ProCare cutover approval | Automatic approval for another school |

## External decisions required

Brenden must explicitly decide or delegate:

- the first-wave schools, shared center/location IDs in `ST | City` format, dates/time zones, and intended live modules;
- the accepted human owners and backups for every required role;
- support hours, intake channel, response targets, and stop authority;
- the authoritative system per workflow during parallel operation and the minimum parallel period;
- separate parent invitation/kiosk and billing/payment activation dates; and
- who is authorized to sign each final approval.

## Exact next action

Brenden names the first-wave schools, shared center/location IDs in `ST | City` format, launch windows, and intended modules, then duplicates `ROLLOUT_TRAINING_PER_SCHOOL_CONTROL_RECORD.md` once per selected school and completes only the scope and owner-acceptance sections. Do not schedule invitations, enable billing, or declare GO while any blocker or required underlying workstream gate remains open.
