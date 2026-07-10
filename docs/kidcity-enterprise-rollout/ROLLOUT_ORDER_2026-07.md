# Suggested Rollout Order

Last updated: July 9, 2026

Source: `public/kidcity-locations.json`, which contains 70 tracked Kid City USA school records.

Important reconciliation note: the public Kid City USA website currently references broader location coverage than the local Bee Suite rollout master. Before scheduling any school outside this file, corporate should reconcile the public/franchise location master against Bee Suite center records, ProCare access, ownership, and active operating status.

## Rollout Math

- Total Bee Suite tracked schools: 70.
- Completed pilot/live school: 1, Kokomo, IN.
- Remaining schools: 69.
- Requested schedule: 3 weeks, one-third of remaining schools each week.
- Weekly load: 23 schools per week.

## Complexity Scoring Model

Use this order as the initial rollout sequence. Before locking the wave calendar, replace assumptions with actual operating data.

| Factor | Weight | Low risk | Higher risk |
| --- | --- | --- | --- |
| Enrollment count | 30 | Small/medium enrollment | High enrollment, many part-time schedules |
| Staffing readiness | 20 | Stable director and classroom leads | Director vacancy, turnover, many floating staff |
| Data export quality | 20 | Clean unencrypted ProCare export | Encrypted, partial, inconsistent, or duplicate-heavy export |
| Billing complexity | 15 | Simple tuition, few subsidies | Many discounts, agency billing, credits, high balances |
| Device readiness | 10 | Tablets/kiosk/front desk ready | Device shortage or unreliable network |
| Director readiness | 5 | Director attends kickoff and validates quickly | Missed validation windows |

Recommended complexity labels:

- Standard: expected normal implementation path.
- Elevated: more validation, billing, staffing, or device risk expected.
- Hold candidate: do not schedule until missing data or leadership decision is resolved.

## Week 0: Completed Pilot

| Order | School | State | Complexity | Rationale |
| --- | --- | --- | --- | --- |
| 0 | Kid City USA - Kokomo | IN | Completed | Already live. Protect production data. Do not reset, reseed, overwrite, or bulk-reimport. |

## Week 1: Current Corporate Wave Plus Multi-State Control Group

Purpose: use known corporate rollout schools and a broad state mix to prove the process across different operating contexts before concentrating on the large Florida and Indiana clusters.

| Order | School | State | Complexity | Rationale |
| --- | --- | --- | --- | --- |
| 1 | Kid City USA - Longmont | CO | Standard | Existing pilot candidate and current corporate rollout list. Use as first non-Kokomo import/control school. |
| 2 | Kid City USA - Garland | TX | Elevated | Existing corporate rollout list; email alias mismatch must be corrected before communications. |
| 3 | Kid City USA - Granbury | TX | Elevated | Existing corporate rollout list; email alias mismatch must be corrected before communications. |
| 4 | Kid City USA - North Richland Hills | TX | Standard | Existing corporate rollout list. |
| 5 | Kid City USA - Corpus Christi | TX | Standard | Existing corporate rollout list equivalent to Corpus Christi 2 naming. Confirm naming before kickoff. |
| 6 | Kid City USA - Canton | NC | Elevated | Existing corporate rollout list; email/name alias should be confirmed. |
| 7 | Kid City USA - Pisgah Forest | NC | Standard | Existing corporate rollout list. |
| 8 | Kid City USA - Lees Summit | MO | Standard | Existing corporate rollout list and only Missouri school in active master. |
| 9 | Kid City USA - Oakleaf | FL | Standard | Existing corporate rollout list; starts Florida validation without overloading Florida wave. |
| 10 | Kid City USA - Holly Hill | FL | Standard | Existing corporate rollout list; Florida validation school. |
| 11 | Kid City USA - Cordera (Colorado Springs) | CO | Standard | Existing corporate rollout list and Colorado cluster anchor. |
| 12 | Kid City USA - Beach Blvd | FL | Standard | Existing corporate rollout list and Jacksonville-area control school. |
| 13 | Kid City USA - Friendswood | TX | Standard | Completes more Texas coverage while Week 1 Texas support context is active. |
| 14 | Kid City USA - Pilot Point | TX | Standard | Texas cluster continuation. |
| 15 | Kid City USA - Terrell | TX | Standard | Texas cluster continuation. |
| 16 | Kid City USA - Tyler | TX | Standard | Completes Texas cluster. |
| 17 | Kid City USA - Woodland Park - Forest Edge | CO | Standard | Colorado cluster continuation. |
| 18 | Kid City USA - Grand Junction | CO | Elevated | Geographic distance and standalone operating context require confirmation. |
| 19 | Kid City USA - Highlands Ranch | CO | Standard | Colorado cluster continuation. |
| 20 | Kid City USA - Woodland Park - East Midland | CO | Elevated | Source location ID appears truncated as `CO | Woodland Par`; confirm before import. |
| 21 | Kid City USA - Columbia | TN | Standard | Tennessee cluster start. |
| 22 | Kid City USA - Lewisburg | TN | Standard | Tennessee cluster continuation. |
| 23 | Kid City USA - Pulaski TN | TN | Standard | Tennessee cluster continuation. |

## Week 2: Indiana Cluster Plus North Florida / Jacksonville-Area Cluster

Purpose: run the Indiana post-Kokomo cluster while the team still has Kokomo lessons fresh, then clear a manageable group of North Florida schools with similar operational and licensing context.

| Order | School | State | Complexity | Rationale |
| --- | --- | --- | --- | --- |
| 24 | Kid City USA - Avon | IN | Standard | Indiana cluster; apply Kokomo lessons. |
| 25 | Kid City USA - Bargersville | IN | Standard | Indiana cluster. |
| 26 | Kid City USA - Brownsburg | IN | Standard | Indiana cluster. |
| 27 | Kid City USA - Elkhart | IN | Elevated | Standalone Indiana geography; confirm staffing and export quality. |
| 28 | Kid City USA - Greenwood | IN | Standard | Indiana cluster. |
| 29 | Kid City USA - Jasper - Baden Strasse | IN | Elevated | Multi-site Jasper market; validate duplicate families/staff across sites. |
| 30 | Kid City USA - Jasper - Truman | IN | Elevated | Multi-site Jasper market; validate duplicate families/staff across sites. |
| 31 | Kid City USA - Paradise | IN | Standard | Indiana cluster. |
| 32 | Kid City USA - Petersburg | IN | Standard | Indiana cluster. |
| 33 | Kid City USA - Southpointe | IN | Standard | Indiana cluster. |
| 34 | Kid City USA - Westfield | IN | Standard | Indiana cluster. |
| 35 | Kid City USA - Whitestown | IN | Standard | Indiana cluster. |
| 36 | Kid City USA - Durbin | FL | Standard | Jacksonville/St. Johns area cluster. |
| 37 | Kid City USA - Fruit Cove | FL | Standard | Jacksonville/St. Johns area cluster. |
| 38 | Kid City USA - Lake City | FL | Standard | North Florida cluster. |
| 39 | Kid City USA - MacClenny | FL | Standard | North Florida cluster. |
| 40 | Kid City USA - Middleburg | FL | Standard | North Florida cluster. |
| 41 | Kid City USA - Starke | FL | Standard | North Florida cluster. |
| 42 | Kid City USA - Glen St. Mary | FL | Standard | North Florida cluster. |
| 43 | Kid City USA - Hampton | FL | Standard | North Florida cluster. |
| 44 | Kid City USA - Palatka | FL | Standard | North Florida cluster. |
| 45 | Kid City USA - Leesburg | FL | Standard | Central/North Florida bridge school. |
| 46 | Kid City USA - Lake Wales | FL | Standard | Central Florida bridge school. |

## Week 3: Remaining Florida Cluster Plus Final Tennessee School

Purpose: finish the largest state cluster after the process has matured for two weeks. Keep the final Tennessee school in Week 3 to balance the week at 23 schools.

| Order | School | State | Complexity | Rationale |
| --- | --- | --- | --- | --- |
| 47 | Kid City USA - Altamonte - Douglas | FL | Elevated | Multi-site Altamonte cluster; validate duplicate families/staff and parent communication names. |
| 48 | Kid City USA - Altamonte - Fruitland | FL | Elevated | Multi-site Altamonte cluster. |
| 49 | Kid City USA - Altamonte - Maitland | FL | Elevated | Multi-site Altamonte cluster. |
| 50 | Kid City USA - Apopka | FL | Standard | Central Florida cluster. |
| 51 | Kid City USA - College Park | FL | Standard | Central Florida cluster. |
| 52 | Kid City USA - Daytona Beach East | FL | Standard | Daytona/Volusia cluster. |
| 53 | Kid City USA - DeLand - Ameila | FL | Elevated | Source spelling says `Ameila`; confirm official school display name before communications. |
| 54 | Kid City USA - DeLand - Orange | FL | Elevated | Multi-site DeLand cluster. |
| 55 | Kid City USA - Deltona - Howland | FL | Standard | Volusia/Seminole cluster. |
| 56 | Kid City USA - Longwood | FL | Standard | Seminole cluster. |
| 57 | Kid City USA - Melbourne | FL | Standard | Space Coast cluster; confirm phone and director contact. |
| 58 | Kid City USA - Oviedo | FL | Standard | Seminole cluster. |
| 59 | Kid City USA - Palm Bay | FL | Standard | Space Coast cluster. |
| 60 | Kid City USA - Port Orange | FL | Standard | Daytona/Volusia cluster. |
| 61 | Kid City USA - St. Cloud | FL | Standard | Central Florida cluster. |
| 62 | Kid City USA - Sanford | FL | Standard | Central Florida cluster. |
| 63 | Kid City USA - Sarasota | FL | Standard | Southwest Florida standalone validation. |
| 64 | Kid City USA - South Daytona | FL | Standard | Daytona/Volusia cluster. |
| 65 | Kid City USA - Vero Beach | FL | Standard | Treasure Coast standalone validation. |
| 66 | Kid City USA - Wekiva | FL | Standard | Seminole/Longwood cluster. |
| 67 | Kid City USA - Winter Park | FL | Standard | Central Florida cluster. |
| 68 | Kid City USA - Winter Springs | FL | Standard | Seminole cluster. |
| 69 | Kid City USA - Soddy Daisy | TN | Standard | Final Tennessee school used to balance Week 3 capacity. |

## Pre-Wave Adjustment Rules

Move a school earlier if:

- Enrollment is low or moderate.
- Director and assistant director are stable and engaged.
- ProCare export is clean and unencrypted.
- Billing is simple and balances are low-risk.
- Stripe payout onboarding is complete.
- Devices are ready.
- No licensing or custody/medical data complexity is expected.

Move a school later if:

- Enrollment is high.
- Director role is vacant or recently changed.
- Staff turnover is high.
- ProCare export is missing, encrypted, or duplicate-heavy.
- Billing has many subsidies, discounts, agencies, credits, voids, or high balances.
- Parent communication risk is high.
- Devices or network are not ready.
- Any P0/P1 issue exists.

## Wave Staffing Model

One implementation specialist can manage 23 schools per week only if:

- Corporate preparation is completed before kickoff.
- Directors use standardized checklist packets.
- Daily office hours are group sessions.
- Support issues are triaged by severity.
- The executive dashboard is updated daily.
- Directors validate data using count reports and samples, not open-ended review.
- Parent invites and payments are gated until the school is ready.

## Required Data Before Finalizing The Order

Collect these for every school and update the order if risk changes:

| Data point | Why it matters |
| --- | --- |
| Current enrollment | Drives data volume, parent adoption, billing risk, attendance load |
| Active staff count | Drives training load and classroom readiness |
| Classroom count | Drives ratio, roster, and tablet setup complexity |
| Director tenure/readiness | Drives validation reliability |
| ProCare export quality | Drives import timeline and duplicate risk |
| Billing complexity | Drives balance and payment reconciliation |
| Stripe readiness | Determines whether payment launch is included |
| Device count/readiness | Determines kiosk/tablet readiness |
| Open operational issues | Determines whether the school should be held |

## Final Approval Rule

This rollout order is a recommended operating sequence, not permission to eliminate ProCare. Each school must still pass the go-live criteria in `MASTER_CORPORATE_ROLLOUT_PLAYBOOK.md` and receive leadership approval before ProCare is retired.
