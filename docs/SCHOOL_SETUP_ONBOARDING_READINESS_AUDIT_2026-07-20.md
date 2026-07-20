# School Setup and Onboarding Production-Readiness Audit

Date: July 20, 2026  
Accountable human: Brenden until explicitly delegated  
Decision: **NO-GO for the wider school wave. Kokomo may continue normal production use.**

## Production-ready definition

A selected school is setup-ready only when its official identity, location mappings, tenant/organization/owner relationships, classrooms, staff, families, children, classroom and staff assignments, guardians, authorized pickups, director/billing access, and launch ownership are complete and reconciled to the approved source. Setup approval does not authorize parent invitations, kiosk activation, billing, or payments. Those steps require their own evidence and signoffs.

## Evidence completed

- Read the production-readiness workstream charter, school rollout checklist, onboarding setup model/API/UI, registration approval path, Prisma relationships, pilot readiness report, and focused tests.
- Ran the read-only `npm run pilot:check -- --all --json` at `2026-07-20T15:57:23.576Z`.
- Current report: 70 active centers, 69 with at least one core rollout gap, 68 with no classrooms, 1 with no staff profile, 2 with unassigned children, 2 with guardians but no linked login, 1 with guardians but no PIN, and 0 cross-center child/classroom mismatches.
- All active centers currently have at least one active director, assistant-director, or billing access grant. This is a count signal, not a credentialed access or tenant-isolation test.
- Kokomo is the only center with no automated core setup gap: 12 classrooms, 9 staff, 9 families, 11 children, 0 unassigned children, 15 guardians, 13 linked guardian logins, 15 PINs, and 3 director/billing grants.
- Longmont remains blocked: 160 of 514 children are unassigned; 674 guardians have 0 linked logins and 0 PINs.
- Holly Hill remains blocked: 0 classrooms, 1 unassigned child, and 0 linked guardian logins.
- The other named candidate-wave schools in the July 18 checklist still have no classrooms, families, or children.
- Added a fail-closed registration safeguard: approving an application no longer sends parent setup unless the reviewer explicitly opts in. The UI checkbox is off by default and names the launch-approval condition; the API accepts only literal `true`.

## Findings and owners

### BLOCKER

1. **The selected wave, dates, intended modules, and per-school launch owners are not named.** Owner: Brenden. Exact retest: record center IDs, dates, modules, corporate launch owner, director owner, data owner, billing owner, technical owner, training owner, and support owner, then rerun this audit only for those schools.
2. **Selected-school structure and records do not reconcile.** Owner: Brenden. Exact retest: after approved import/setup work, run `npm run pilot:check -- --all --json`, extract each selected school, reconcile source and BEE Suite counts, and attach director-approved exceptions.
3. **Longmont assignments and guardian rollout are incomplete.** Owner: Brenden. Exact retest: show zero unassigned children, then separately approve and test guardian login/PIN rollout before any parent invitation or kiosk launch.
4. **Holly Hill has no classroom and no linked guardian login.** Owner: Brenden. Exact retest: create/reconcile the approved classroom structure, assign the child, and credential-test one correctly scoped guardian only after invitation approval.
5. **School identity/configuration is not fully evidenced by the automated report.** Owner: Brenden. Exact retest: for every selected school, attach verified name, address, phone, email, EIN/tax receipt data, timezone, CRM location ID, tenant, organization, owner group, status, public inquiry route, classroom capacities/ratios/hours, and notification recipients.
6. **No per-school reconciliation/signoff package exists for the selected wave.** Owner: Brenden. Exact retest: attach source totals and BEE Suite totals for classrooms, staff, families, children, guardians, assignments, pickups, balances, credits, and open invoices, plus at least 10 family spot checks and director/corporate approval.

### REQUIRED BEFORE WAVE

1. **The invitation safeguard must pass the final release gate and be promoted under separate release authorization.** Owner: Brenden. Exact retest: run the final build, approve a safe test registration with the invitation box off and confirm no login/email action; then explicitly opt in after launch approval and confirm one expected invitation.
2. **Credentialed access is not proven by access-grant counts.** Owner: Brenden. Exact retest: sign in with the actual selected-school director, teacher, and linked guardian test accounts and confirm correct school/family scope and no cross-school visibility.
3. **Setup notes can reach `ready_for_review` based on non-empty free text, not record reconciliation.** Owner: Brenden. Exact retest: treat this status only as director input complete; do not use it as go-live evidence until database counts, source reconciliation, and signatures are attached.
4. **Staff-to-classroom assignments, guardian coverage, authorized pickups, and ownership quality are not fully measured by `pilot:check`.** Owner: Brenden. Exact retest: add these fields to the per-school evidence worksheet or extend the report before final signoff.
5. **Parent invitations, kiosk PIN activation, and billing/payment enablement need independent approvals.** Owner: Brenden. Exact retest: retain three separate signed decisions: setup/data ready, parent/kiosk ready, and billing/payments ready.

### FOLLOW-UP

1. **Add selected-school filters and strict launch semantics to `pilot:check`.** Owner: Brenden. The current global report says `READY WITH WARNINGS` despite 69 rollout gaps; operational go/no-go must continue to use the checklist and per-school signoff.
2. **Replace role labels such as `Director or admin` with named people in the saved evidence package.** Owner: Brenden.
3. **Track partial guardian readiness, not only the current zero-login/zero-PIN condition.** Owner: Brenden. A school with one linked guardian among hundreds should not appear complete.

## External decisions required

- Brenden must select the actual wave, dates, and intended live modules.
- Brenden must explicitly delegate and obtain acceptance from each per-school owner, or remain the owner.
- Each school director and corporate owner must approve identity, structure, roster, assignments, guardians, pickups, and reconciliation evidence.
- Parent invitation/kiosk approval and billing/payment approval must remain separate from setup approval.
- ProCare remains the source of truth until the shared cutover, rollback, role-smoke, training, support, and reconciliation signoffs pass.

## Files changed

- `src/lib/registration-packet.ts`
- `src/app/api/registration/[id]/review/route.ts`
- `src/components/registration-review-actions.tsx`
- `tests/registration-packet.test.ts`
- `docs/SCHOOL_SETUP_ONBOARDING_READINESS_AUDIT_2026-07-20.md`

## Tests run

- `node --import tsx --test tests/registration-packet.test.ts tests/onboarding-setup.test.ts tests/pilot-readiness-report.test.ts` — 13 passed, 0 failed.
- `npm run typecheck` — passed.
- `npm run pilot:check -- --all --json` — read-only query completed; 0 failures, 7 warnings, 69 rollout gaps. This does not mean the wider wave is ready.

## Exact next action

Brenden names the first-wave schools, center IDs, dates, modules, and one accepted human owner for launch, director signoff, data/reconciliation, billing, technical release, training, and first-week support. Then run a school-scoped reconciliation pass for only that named wave before creating accounts, sending invitations, activating kiosk PINs, or enabling billing.
