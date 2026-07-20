# School Setup Reconciliation Evidence Packet

Copy this file once for each selected school. Keep sensitive child, family, staff, medical, custody, credential, and payment data in the approved secure evidence location; record only references and aggregate counts here.

**Control:** ProCare remains the source of truth until written cutover approval is recorded. Completing setup does not authorize parent invitations, kiosk/PIN activation, billing, live payments, or ProCare retirement.

## 1. School identity and scope

| Field | Expected/approved value | BEE Suite value | Evidence reference | Result/exception owner |
| --- | --- | --- | --- | --- |
| Official school name | | | | |
| BEE Suite center ID | | | | |
| ProCare/CRM location ID | | | | |
| Tenant and organization | | | | |
| Owner group | | | | |
| Active status | | | | |
| Address | | | | |
| Phone | | | | |
| Notification email/recipients | | | | |
| Time zone | | | | |
| EIN/tax receipt details verified | | | Secure reference only | |
| Public inquiry route | | | | |
| Proposed modules | | | | |
| Modules explicitly held off | | | | |

Read-only report command after Brenden selects the school:

```powershell
npm run pilot:check -- --school "CENTER_ID_OR_EXACT_LOCATION_ID" --module setup --module parent-invitations --module kiosk --module billing --json --output "approved-evidence-path.json"
```

The report is an automated signal only. `manual_approval_required` does not mean GO.

## 2. Source custody and batch traceability

| Check | Evidence reference/result |
| --- | --- |
| Approved secure ProCare export handoff | |
| Untouched source filename, timestamp, and SHA-256 | |
| Secure archive and retention owner | |
| Preview/diff report | |
| Mapping, exclusions, and duplicate decisions | |
| Import batch IDs and statuses | |
| Backup/rollback artifact | |
| No bank credentials or full payment details collected | |

## 3. Aggregate reconciliation

| Measure | ProCare approved total | BEE Suite total | Difference | Exception/correction | Named owner | Retest evidence |
| --- | ---: | ---: | ---: | --- | --- | --- |
| Classrooms | | | | | | |
| Staff profiles | | | | | | |
| Staff assigned to classrooms | | | | | | |
| Staff intentionally unassigned | | | | | | |
| Families | | | | | | |
| Children | | | | | | |
| Children assigned to classrooms | | | | | | |
| Children intentionally unassigned | | | | | | |
| Guardians | | | | | | |
| Guardians approved for portal invitation | | | | | | |
| Guardians linked to login users | | | | | | |
| Guardians approved for kiosk/PIN | | | | | | |
| Guardians with PINs | | | | | | |
| Authorized pickups | | | | | | |
| Emergency contacts | | | | | | |
| Active director/assistant/billing grants | | | | | | |
| Teacher grants/accounts | | | | | | |
| Opening balances | | | | | | |
| Credits | | | | | | |
| Open invoices | | | | | | |

Zero difference is expected unless a written exception identifies the exact reason, correction owner, due date, and retest.

## 4. Classroom, staff, child, and guardian assignment review

- [ ] Every classroom has the approved name, age group, capacity, ratio, hours, and schedule.
- [ ] Every staff record matches the approved roster; classroom assignment or intentional non-classroom role is documented.
- [ ] Every child is linked to the correct family and classroom, or has a director-approved exception.
- [ ] No child is linked to a classroom from another center.
- [ ] Every guardian is linked to the correct family with verified contact, relationship, billing responsibility, custody limits, and communication preference.
- [ ] Authorized pickups, restricted pickups, emergency contacts, medical alerts, and custody warnings were spot-checked securely.
- [ ] At least 10 families, or every family when fewer than 10, passed a source-to-app spot check.

Secure spot-check evidence reference:  
Reviewer and date:  
Exceptions and named correction owners:

## 5. Access and ownership evidence

| Responsibility/access | Named person | Scope/role | Acceptance or test date | Evidence/result | Exception owner |
| --- | --- | --- | --- | --- | --- |
| Corporate launch owner | | | | | |
| Director signoff owner | | | | | |
| Data/import reconciliation | | | | | |
| Technical release | | | | | |
| Training | | | | | |
| First-week support | | | | | |
| Stop/rollback authority | | | | | |
| Director credentialed access | | | | | |
| Teacher credentialed access | | | | | |
| Linked guardian test access | | | | | |

- [ ] Credentialed tests prove no cross-school or wrong-family access.
- [ ] Authority to create/remove users, reset passwords, import data, and edit school configuration is documented.
- [ ] Role counts alone are not treated as credentialed access evidence.

## 6. Separate module gates

Each row requires its own written decision. Do not reuse approval from another row.

| Gate | Automated signal | Required human evidence | Decision | Named approver | Date/time | Evidence/holds |
| --- | --- | --- | --- | --- | --- | --- |
| School setup/data | | Reconciliation and director/corporate review | GO / NO-GO | | | |
| Parent invitations | | Approved invite population, family scope, delivery/support plan | GO / NO-GO | | | |
| Kiosk/PIN activation | | PIN policy, custody/pickup tests, device and fallback test | GO / NO-GO | | | |
| Billing/invoices | | Rates, balances, credits, preview, accounting approval | GO / NO-GO | | | |
| Live payments/payouts | | Stripe account, disclosure, payment/webhook/ledger/refund/payout reconciliation | GO / NO-GO | | | |
| ProCare cutover | | All enabled modules reconciled; stop, rollback, training, and support approved | GO / NO-GO | | | |

## 7. Exceptions, stop conditions, and rollback

| Open exception or stop condition | Severity | Affected module | Named owner | Due date | Containment/system of record | Exact retest | Closure evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| | | | | | | | |

- [ ] Data mismatch, unauthorized access, missing training/support, and unresolved critical defects are stop conditions.
- [ ] Invitations, kiosk, billing, and payments can be held or rolled back independently.
- [ ] No BEE Suite records will be deleted or overwritten during rollback.
- [ ] ProCare remains authoritative until the final written cutover decision below.

## 8. Approvals

| Approval | Name | Decision and exact scope | Date/time | Approved evidence reference | Exceptions |
| --- | --- | --- | --- | --- | --- |
| Director | | GO / NO-GO | | | |
| Corporate | | GO / NO-GO | | | |
| Data/reconciliation | | GO / NO-GO | | | |
| Billing/accounting (`NOT ENABLED` allowed) | | | | | |
| Technical/release | | GO / NO-GO | | | |
| ProCare cutover | | GO / NO-GO | | | |

Final decision: `NO-GO` / `GO WITH NAMED HOLDS` / `GO FOR NAMED MODULES`  
ProCare source-of-truth status:  
Exact next action:  
