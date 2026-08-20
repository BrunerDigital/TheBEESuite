# ProCare Migration Evidence Packet

Use one copy per school and one row per import batch. Do not include child, family, staff, medical, custody, or payment details in this document. Link only to the approved secure evidence location.

ProCare remains the operational source of truth until every blocker below is complete and written cutover approval is recorded. A completed import is not cutover approval.

## School and ownership

| Field | Evidence |
| --- | --- |
| School name | |
| BEE Suite center ID | |
| ProCare location ID | |
| Intended live modules | |
| Cutover window and timezone | |
| Data/import owner | Brenden until explicitly delegated |
| Director approver | |
| Corporate approver | |
| Technical approver | |
| Support owner | |

## Secure source custody

| Check | Evidence |
| --- | --- |
| Approved secure handoff used | |
| Untouched export filename and timestamp | |
| Export SHA-256 from import preview | |
| Generated BEE migration template SHA-256 | |
| Reviewed BEE migration template SHA-256 and confirmation fingerprint | |
| Secure archive location and retention owner | |
| Raw-row retention review date and deletion approver | |
| No bank credentials or full payment details collected | |
| Fleet Verification Packet status and secure reference | |

## Mapping and dry-run approval

| Dataset | ProCare source/report | BEE Suite destination | Included / excluded / follow-up | Reviewer |
| --- | --- | --- | --- | --- |
| Families and guardians | | | | |
| Children, classrooms, schedules | | | | |
| Staff and classroom assignments | | | | |
| Pickups, emergency, medical, custody | | | | |
| Tuition, discounts, subsidies | | | | |
| Balances, credits, open invoices | | | | |
| Attendance and documents, if required | | | | |

Record the preview counts, warnings, exclusions, duplicate candidates, and approved resolutions. Files over the duplicate-review safety limit must not be committed unless split into approved batches or the importer is enhanced and retested.

Attach the successful `confirmation.json` from `npm run procare:confirm-source-of-truth`. Its family count must count each source Account ID once even when the family has siblings. Its child count, opening-balance total, and child-level weekly-tuition total must match the reviewed packet. A successful confirmation is preparation evidence, not import, billing, invitation, payment, or cutover approval.

## Import batches

| Order | Source filename | SHA-256 | Preview counts | Duplicate decision | Batch ID/status | Errors/exceptions | Backup filename |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | | | | | | | |

## Reconciliation

| Measure | ProCare total | BEE Suite total | Difference | Approved explanation / correction owner |
| --- | ---: | ---: | ---: | --- |
| Families | | | | |
| Children | | | | |
| Guardians | | | | |
| Staff | | | | |
| Classrooms | | | | |
| Account balances | | | | |
| Child-level weekly tuition assignments | | | | |
| Credits | | | | |
| Open invoices | | | | |

Spot-check at least 10 families, or every family when fewer than 10. Record only secure evidence references here. The director must verify rosters, schedules, allergies/medical notes, custody warnings, pickups, documents, tuition, discounts, balances, and required history.

## Cutover, stop conditions, and rollback

- [ ] All counts and balances reconcile or have written approved exceptions.
- [ ] Import batches, backups, corrections, and spot-check evidence are retained.
- [ ] Role isolation and intended workflows passed.
- [ ] ProCare write-freeze timing is approved; before that time ProCare remains writable and authoritative.
- [ ] Stop conditions and support escalation are acknowledged.
- [ ] Rollback owner will pause BEE Suite writes/invitations/billing, preserve post-import writes, return affected modules to ProCare, and reconcile both systems.
- [ ] Rollback evidence includes batch ID, source SHA-256, backup, affected modules, stop/last-good times, post-import write log, reconciliation owner, and director/corporate decisions.
- [ ] Automated reconciliation report is attached; every mismatch or unavailable measure has a named owner and approved exception or exact retest.
- [ ] Fleet Verification Packet is attached and shows `READY_FOR_DIRECTOR_REVIEW`; a `NOT_VERIFIED` packet cannot proceed to written cutover approval.
- [ ] Every excluded row has an approved category, specific reason, secure evidence reference, authenticated reviewer, timestamp, and signed school-specific exception decision.
- [ ] Parent invitations and payments remain separately gated.

## Written decision

| Approval | Name | Decision | Date/time | Evidence reference |
| --- | --- | --- | --- | --- |
| Director | | GO / NO-GO | | |
| Corporate | | GO / NO-GO | | |
| Technical | | GO / NO-GO | | |
| ProCare cutover | | GO / NO-GO | | |

Final source-of-truth decision: **GO / NO-GO**  
Approved modules:  
Known exceptions and named owners:  
Exact next action:
