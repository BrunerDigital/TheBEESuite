# School rollout email review packet

Prepared September 25, 2026 for Kid City USA and Miss Honey's Learning Center. **Review copy only. No recipient list, sender approval, provider template publishing, or live send is included.** The school population must be refreshed just before use. Match each recipient to the exact active school and owner/director role. Keep the older August `00_BEE_SUITE_SCHOOL_TRANSITION_ANNOUNCEMENT_EMAIL.md` out of this wave; it says imports, parent invitations, and Stripe links already happened for recipients without current school-level proof.

## Branding and packaging

| Brand | Header artwork | Signature | Audience |
| --- | --- | --- | --- |
| Kid City USA | `public/brand/kid-city-usa/logo-horizontal.png` with The BEE Suite product mark | `The BEE Suite | Kid City USA` | Approved Kid City school owner/director only |
| Miss Honey's Learning Center | `public/brand/miss-honeys-learning-center/logo-transparent.png` with The BEE Suite product mark | `The BEE Suite | Miss Honey's Learning Center` | Approved Centennial or Cuzco owner/director only |

Render the chosen artwork in the email client; do not send raw Markdown as HTML. Use the sender and monitored reply-to address approved for that brand and school. Confirm domain authentication, tracking behavior, a delivered test event, and reply receipt before a wave. The shared six school transition PDFs at `output/pdf/SCHOOL_TRANSITION_EMAIL_PACKET_CURRENT/` are optional attachments after the owner confirms each is appropriate for the recipient. Never attach the internal readiness matrix or source exports.

## A. Kid City school with existing records

**Subject:** Kid City USA: review your school's BEE Suite records

Hello school owner and director,

Your school has family or child records in The BEE Suite. Please compare them with your current source roster before relying on them for daily operations.

Sign in at https://thebeesuite.io/directors and check that the selected school is yours. In School setup, review classrooms, staff, guardians, children, emergency contacts, authorized pickups, schedules, and any information needed for safe daily care. If a ProCare import is planned or underway, coordinate with the import owner before adding records.

Please reply with your school name, the person leading the review, the roster's as-of date, expected and entered family/child totals, unresolved item count, and target completion date. Keep child and family details inside the secure workspace. If access fails, report the school, role, page, and time without sending a password.

Guide: https://thebeesuite.io/resources/director-data-clean-start

Parent invitations, kiosk use, billing, payments, and ProCare cutover are separate school decisions. Continue your current approved process until your school receives its specific launch decision.

The BEE Suite | Kid City USA

## B. Kid City school with no recorded roster

**Subject:** Kid City USA: confirm your school's roster setup path

Hello school owner and director,

The current BEE Suite school record has no family or child roster. Please confirm whether your school will import reviewed current records, begin with a clean workspace, or intentionally have no current families. A zero count alone does not tell us which path is correct.

Sign in at https://thebeesuite.io/directors and verify the selected school. Name the director responsible for setup. Confirm your classrooms and source roster before entering households. Use the secure import process for any ProCare files; never email exports, medical or custody information, or billing files. Enter one complete household and check it before proceeding through the roster.

Please reply with your school name, setup owner, chosen path, source roster as-of date, expected family/child totals, and target director-review date. If access fails, report the school, role, page, and time without sending a password.

Guide: https://thebeesuite.io/resources/director-data-clean-start

Roster setup does not activate invitations, kiosk use, billing, payments, or ProCare cutover. Continue your current approved process until your school receives its specific launch decision.

The BEE Suite | Kid City USA

## C. Miss Honey's Centennial record review

**Subject:** Miss Honey's Centennial: review your BEE Suite school records

Hello Centennial owner and director,

Centennial has family, child, and classroom records in The BEE Suite. Please compare these records with your current source roster before relying on them for daily operations.

Sign in at https://thebeesuite.io/directors and verify that Centennial is selected. In School setup, review classrooms, staff, guardians, children, emergency contacts, authorized pickups, schedules, and safety information. Coordinate with the import owner before adding records when a ProCare import is planned or underway.

Please reply with the review owner, source roster as-of date, expected and entered family/child totals, unresolved item count, and target completion date. Keep personal details in the secure workspace. Report any login issue with the role, page, and time, without sending credentials.

Guide: https://thebeesuite.io/resources/director-data-clean-start

Parent invitations, kiosk use, billing, payments, and ProCare cutover each require a separate Centennial decision. Continue the current approved process until then.

The BEE Suite | Miss Honey's Learning Center

## D. Miss Honey's Cuzco setup review — hold until school identity is confirmed

**Subject:** Miss Honey's Cuzco: confirm your BEE Suite setup plan

Hello Cuzco owner and director,

Before setup begins, please confirm Cuzco's operating identity, school owner, and current roster source. The BEE Suite record currently has no family, child, classroom, or staff profiles. Tell the implementation owner whether this is an intentional clean start or whether reviewed records must be imported. No roster or staff record should be invented from the absence of data.

After the school identity and access are confirmed, sign in at https://thebeesuite.io/directors, select Cuzco, and follow the School setup review with your implementation owner. Use the approved secure process for source files. Reply only with the named owner, selected setup path, expected family/child totals, and target review date; keep personal records inside the secure workspace.

Guide: https://thebeesuite.io/resources/director-data-clean-start

Invitations, kiosk use, billing, payments, and ProCare cutover remain separate Cuzco decisions.

The BEE Suite | Miss Honey's Learning Center

## Final send review

1. Re-run the live school status and roster counts. Move schools between A and B if records changed; validate Centennial and Cuzco independently.
2. Approve exact recipients, sender, reply-to inbox, subject, rendered body, logo, links, and optional six-PDF attachment set for the chosen school. Never include an internal CSV or sensitive source file.
3. Send one approved non-family test to verify rendering, link safety, delivered event, and monitored reply receipt. Provider `202` means accepted, not delivered.
4. Only then seek the distinct authorization for a live school wave. This packet does not authorize invitations, account changes, billing activation, provider setup, or messages to schools.
