# Cron Execution Evidence Template

Repository configuration proves scheduling and authorization, not execution. Complete one row per production schedule after separate authorization and retain redacted logs/screenshots.

| Job and schedule (UTC) | Owner | Expected result/invariant | Last start/success | Duration | Processed/skipped/failed | Request/deployment ID | Alert tested | Evidence | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| FTE reminders — Fri 14:00 and 22:00 | ______ | No duplicate escalation; correct window | ______ | ______ | ______ | ______ | ______ | ______ | PASS/FAIL |
| Integration retries — daily 14:30 | ______ | Eligible retries only; dedupe retained | ______ | ______ | ______ | ______ | ______ | ______ | PASS/FAIL |
| Campaign scheduler — every 15 min | ______ | Due campaigns once; future/paused untouched | ______ | ______ | ______ | ______ | ______ | ______ | PASS/FAIL |
| Tuition billing — daily 13:15 | ______ | Only eligible approved assignments; idempotent | ______ | ______ | ______ | ______ | ______ | ______ | PASS/FAIL |
| Tuition reminders — Fri 23:15 and weekdays 12:30 | ______ | Correct recipients/state; no duplicates | ______ | ______ | ______ | ______ | ______ | ______ | PASS/FAIL |
| Document expiration — daily 14:45 | ______ | Correct due window and recipients | ______ | ______ | ______ | ______ | ______ | ______ | PASS/FAIL |
| Payment dunning — daily 15:00 | ______ | Eligible failures only; state recorded | ______ | ______ | ______ | ______ | ______ | ______ | PASS/FAIL |
| Autopay invoices — daily 15:30 | ______ | Ready accounts/invoices only; idempotent | ______ | ______ | ______ | ______ | ______ | ______ | PASS/FAIL |

For every row also confirm: bearer authorization rejected an invalid request; `CRON_SECRET` was not exposed; logs contained no personal/payment data; failure alert and retry ownership are known; school/time-zone expectations were reconciled; and any side effects were approved before the run.

Overall owner acceptance/date: ____________________  Exceptions and retest: ____________________
