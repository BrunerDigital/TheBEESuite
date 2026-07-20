# Reporting and Analytics Per-School Reconciliation Packet

Copy this file once per selected first-wave school. Do not enter unapproved production totals into source control; store the completed evidence in the approved restricted evidence location and retain only its reference here.

## Control record

- School name:
- BEE Suite center ID:
- Time zone:
- Reporting cutoff date and local closing time:
- Intended live modules:
- Evidence location/reference:
- Reconciliation run timestamp:
- Reconciliation runner/version:

## Approved sources and definitions

| Report | Approved source | Definition accepted | Source-total approver | Approval timestamp |
| --- | --- | --- | --- | --- |
| Lead funnel | CRM lead records created through cutoff; current enrollment stage |  |  |  |
| Attendance | Attendance statuses plus check-in/out events in the selected local-date range |  |  |  |
| Billing activity | Invoices selected by creation/due date; successful payments paid in range |  |  |  |
| Open/overdue | Current implementation is limited to selected invoices and is not all-time as-of AR |  |  |  |
| Messages | Parent messages created in range; next non-parent message in the same thread is the response |  |  |  |
| Staff hours | Closed shifts plus elapsed open-shift time in the selected center-local range |  |  |  |
| FTE | Submitted weekly value; derived default is full-time 1.0 plus part-time 0.5 |  |  |  |

## Source-total reconciliation

| Metric | Approved source total | BEE Suite total | Variance | Tolerance | Pass/fail | Evidence |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| Leads |  |  |  | 0 |  |  |
| Tours |  |  |  | 0 |  |  |
| Applications/enrollments |  |  |  | 0 |  |  |
| Present/absent |  |  |  | 0 |  |  |
| Check-ins/check-outs |  |  |  | 0 |  |  |
| Invoice activity cents |  |  |  | 0 |  |  |
| Successful payment cents |  |  |  | 0 |  |  |
| Parent messages/replies |  |  |  | 0 |  |  |
| Staff minutes |  |  |  | 0 |  |  |
| Weekly FTE/enrollment |  |  |  | 0 |  |  |

## Filter, isolation, export, and freshness evidence

- [ ] Exact cutoff includes records at the final allowed instant and excludes the next instant.
- [ ] School filter returns only this center ID.
- [ ] A second authorized school is excluded when this school is selected.
- [ ] An inaccessible or other-tenant center ID returns no report data or a 403.
- [ ] All-accessible-centers totals equal the sum of the individually reconciled schools.
- [ ] CSV data rows equal the displayed report rows and include generated-at, range, centers, source, and definition metadata.
- [ ] PDF identifies generated-at, range, center scope, source, and definition; record any row-limit exception.
- [ ] Dashboard FTE link opens `/fte-reports?centerId=<CENTER_ID>&weekStart=<YYYY-MM-DD>` with both filters selected.
- [ ] Analytics data-as-of equals the server query timestamp and is within the approved maximum age.
- [ ] Each FTE row displays its own Updated timestamp; stale-source behavior matches the approved threshold.

## Automated harness input

Create a restricted JSON input matching `SchoolReportingReconciliation` in `src/lib/reporting-reconciliation.ts`, then call `evaluateSchoolReportingReconciliation`. The result must have `passed: true`, zero out-of-tolerance variances, no failures, and an age within `maximumAgeMinutes`. Never commit real source totals unless the evidence location is approved for them.

## Human acceptance

- Director acceptance — name/date:
- Corporate operations acceptance — name/date:
- Accounting acceptance for billing definitions — name/date or `NOT ENABLED`:
- Technical acceptance — name/date:
- Exceptions, owner, due date, and exact retest:

No school is approved by this packet alone. All shared rollout signoffs must also pass.
