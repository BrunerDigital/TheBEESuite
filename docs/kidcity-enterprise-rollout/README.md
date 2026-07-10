# Kid City USA Enterprise Rollout Packet

Last updated: July 9, 2026

Purpose: migrate Kid City USA locations from ProCare to The Bee Suite through a controlled enterprise rollout while both systems continue running in parallel until leadership approves final ProCare retirement.

## Operating Assumptions

- Kokomo, IN is already live and must not be reset, reseeded, overwritten, or bulk-reimported.
- The current Bee Suite location master in `public/kidcity-locations.json` contains 70 tracked school records.
- The three-week rollout covers the 69 tracked schools that are not Kokomo.
- The rollout target is 23 schools per week for three weeks.
- ProCare remains active for every school until the go-live exit criteria are met and leadership approves the final switch.
- The public Kid City USA website and the local Bee Suite location master do not perfectly match. Corporate must reconcile the operational location master before scheduling schools that are not in the Bee Suite dataset.

## Deliverable Map

| # | Requested deliverable | File |
| --- | --- | --- |
| 1 | Master Corporate Rollout Playbook | `MASTER_CORPORATE_ROLLOUT_PLAYBOOK.md` |
| 2 | Director Implementation Guide | `DIRECTOR_IMPLEMENTATION_GUIDE.md` |
| 3 | Corporate Checklist | `CHECKLISTS.md` |
| 4 | Director Checklist | `CHECKLISTS.md` |
| 5 | Daily Migration Checklist | `CHECKLISTS.md` |
| 6 | Data Verification Checklist | `CHECKLISTS.md` |
| 7 | Parent Communication Timeline | `CHECKLISTS.md` |
| 8 | Staff Training Timeline | `CHECKLISTS.md` |
| 9 | Executive Dashboard | `EXECUTIVE_DASHBOARD.md` |
| 10 | Risk Matrix | `RISK_CONTINGENCY_ROLLBACK.md` |
| 11 | Contingency Plans | `RISK_CONTINGENCY_ROLLBACK.md` |
| 12 | Rollback Procedure | `RISK_CONTINGENCY_ROLLBACK.md` |
| 13 | Standard Operating Procedures | `SOPS_HELP_TRAINING_PACKET.md` |
| 14 | Help Center article list | `SOPS_HELP_TRAINING_PACKET.md` |
| 15 | Training video list | `SOPS_HELP_TRAINING_PACKET.md` |
| 16 | Printable implementation packet | `PRINTABLE_IMPLEMENTATION_PACKET.md` |
| 17 | Suggested rollout order | `ROLLOUT_ORDER_2026-07.md` |

## Related Existing Docs

- `docs/PROCARE_LOCATION_MIGRATION_RUNBOOK.md`
- `docs/PROCARE_FIELD_COVERAGE.md`
- `docs/KIDCITY_CORPORATE_ROLLOUT_CHECKLIST_2026-07-07.md`
- `docs/kid-city-usa-director-implementation-guide.md`
- `docs/KOKOMO_GO_LIVE_STARTER_GUIDE_2026-06-16.md`
- `docs/sops/SCHOOL_SYSTEM_OPERATING_MANUAL.md`
- `docs/SUPPORT_ESCALATION_GUIDE.md`
- `docs/SECURITY_PRIVACY_OPERATIONS.md`
- `docs/STRIPE_CONNECT_SETUP.md`

## Source Notes

- Location baseline: `public/kidcity-locations.json`.
- Public website reference: https://kidcityusa.com/locations/ and state location pages, reviewed July 9, 2026.
- Because the website currently references broader location coverage than the local Bee Suite master, corporate should treat the rollout order as the active Bee Suite migration list, not the final franchise universe.
