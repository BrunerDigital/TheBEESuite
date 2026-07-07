# Kid City corporate school rollout checklist

Rollout window: week of July 7, 2026.

Goal: run The Bee Suite alongside Procare for the corporate-owned schools this week, validate the data and payment flows, and cut over from Procare by the end of the week only when each school passes the exit checks.

## Schools in this wave

| Status | School | Requested login/contact | Bee Suite center email | Notes |
| --- | --- | --- | --- | --- |
| Pilot first | Longmont | longmont@kidcityusa.com | longmont@kidcityusa.com | Use first for Procare import and payout onboarding testing. |
| Ready for rollout | Garland | garland@kidcityus.com | garland@kidcityusa.com | Requested email is missing the `a` in `usa`; confirm before sending parent/director communication. |
| Ready for rollout | Granbury | granbury1@kidcityusa.com | granbury@kidcityusa.com | Bee Suite center record uses `granbury@kidcityusa.com`. |
| Ready for rollout | North Richland Hills | northrichlandhills@kidcityusa.com | northrichlandhills@kidcityusa.com |  |
| Ready for rollout | Corpus Christi 2 | corpuschristi2@kidcityusa.com | corpuschristi2@kidcityusa.com |  |
| Ready for rollout | Canton NC | cantonnc@kidcityusa.com | canton@kidcityusa.com | Bee Suite center record uses `canton@kidcityusa.com`. |
| Ready for rollout | Pisgah Forest | pisgahforest@kidcityusa.com | pisgahforest@kidcityusa.com |  |
| Ready for rollout | Lees Summit | leessummit@kidcityusa.com | leessummit@kidcityusa.com |  |
| Live production | Kokomo | kokomo@kidcityusa.com | kokomo@kidcityusa.com | Already using The Bee Suite as the full system. Do not reset, overwrite, reseed, or bulk-reimport Kokomo production data. Only use additive fixes or approved, backed-up corrections. |
| Ready for rollout | Oakleaf | oakleaf@kidcityusa.com | oakleaf@kidcityusa.com |  |
| Ready for rollout | Holly Hill | hollyhill@kidcityusa.com | hollyhill@kidcityusa.com |  |
| Ready for rollout | Cordera | cordera@kidcityusa.com | cordera@kidcityusa.com |  |
| Ready for rollout | Beach Blvd | beachblvd@kidcityusa.com | beachblvd@kidcityusa.com |  |

## Access and payout setup

- [ ] Run `npm run kidcity:ensure-corporate-schools` before rollout work starts.
- [ ] Confirm `corpschools@kidcityusa.com` can log in from `/directors`.
- [ ] Open `/billing-settings` from that login and confirm all 13 schools show in the payout account table.
- [ ] For each school, corporate enters the legal business, EIN, support contact, address, and bank payout details.
- [ ] Each school must show Stripe Connect status `Ready` before parent payments are broadly enabled.
- [ ] Do not reuse old Stripe onboarding links. Generate a new link from `/billing-settings` if a link expires or the user returns without completing onboarding.

## Kokomo production safeguard

- [ ] Treat Kokomo as a live production school, not a rollout/import test school.
- [ ] Do not run destructive setup, seed, reset, rollback, or replacement import operations against Kokomo.
- [ ] Before any Kokomo data correction, export or snapshot the affected records, document the exact issue, and make the smallest additive or row-level repair possible.
- [ ] Use Longmont, staging, or approved test data for import and migration testing instead of Kokomo.

## Longmont pilot

- [ ] Export active Longmont families, children, guardians, authorized pickups, classrooms, staff, schedules, tuition rates, discounts, current balances, payment history for 2026, and child/staff documents from Procare.
- [ ] Import Longmont into The Bee Suite.
- [ ] Compare child count, active family count, staff count, classroom roster count, and current balances against Procare.
- [ ] Create or verify director, teacher, and parent portal users.
- [ ] Set tuition rates for a sample of full-time, part-time, sibling discount, agency/subsidy, and staff discount families.
- [ ] Confirm tuition auto-billing schedules are Friday billing for the following week.
- [ ] Add one non-recurring charge test, such as registration or uniform, and confirm it does not become recurring.
- [ ] Run a parent ACH setup test and verify payment status updates in The Bee Suite after payment events.
- [ ] Confirm the payout account is connected and the school can receive automatic daily payouts when funds become available.
- [ ] Collect director feedback and fix critical blockers before importing the remaining schools.

## Procare export and import checklist

- [ ] Export active and inactive family records for all of 2026.
- [ ] Export child profiles, birthdates, enrollment status, classroom assignment, allergies, medications, medical notes, and authorized pickup permissions.
- [ ] Export guardian contact details, portal emails, phone numbers, billing responsibility, and custody notes.
- [ ] Export staff profiles, roles, classroom assignments, schedules, and all 2026 timesheet records.
- [ ] Export tuition rates, recurring charges, discounts, agency billing, subsidies, registration charges, uniform charges, deposits, balances, credits, voids, and payment history.
- [ ] Export documents needed for licensing, tax, and federal retention requirements.
- [ ] Store original Procare exports in the agreed archival location before import cleanup.
- [ ] After import, compare record totals and spot-check at least 10 families per school before inviting parents.

## Parent ACH and tuition readiness

- [ ] Parent portal invitation is sent only after family profile, children, tuition plan, and balance are verified.
- [ ] ACH setup instructions tell parents to verify their bank account before the first live billing run.
- [ ] Directors confirm each family tuition rate and billing cadence.
- [ ] Tuition is recurring; uniforms, registration fees, deposits, and one-time adjustments are not recurring.
- [ ] Failed ACH/card payments generate a director-visible status and parent follow-up path.
- [ ] Parent statement preview includes school EIN/tax details where available.

## Director and teacher readiness

- [ ] Each director can log in from `/directors` and see only their school data unless they are corporate.
- [ ] Teachers can log in from `/teachers`, see their classroom roster, and complete attendance and daily workflow tests.
- [ ] Each school validates child photos, name-to-face workflow, daily health checks, incident reports, and classroom moves.
- [ ] Directors can see parent messages quickly enough to respond during the day.
- [ ] FTE reports are submitted by directors and visible to executive users across all schools with individual school filtering.

## Daily rollout rhythm

- [ ] Morning: confirm import status, payout status, parent invitation count, ACH verification count, and critical bug list.
- [ ] Midday: review director questions and bugs from active schools.
- [ ] End of day: reconcile payments, Stripe payment status, failed payments, and available payout status.
- [ ] Keep Procare active until a school passes the exit checks below.

## Cutover exit checks

- [ ] All active families, children, guardians, staff, classrooms, tuition rates, and balances are verified.
- [ ] Payout account is connected and ready for the school.
- [ ] Parent payment methods are verified for families that should be billed electronically.
- [ ] First tuition billing preview is reviewed by the director and corporate.
- [ ] Director confirms billing, attendance, messaging, FTE, and staff workflows are usable.
- [ ] 2026 Procare data exports are archived for active and inactive families and staff.
- [ ] Corporate signs off that the school can stop using Procare for daily operations.
