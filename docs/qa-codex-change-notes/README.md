# QA to Codex Change Note System

Use this system when the testing team reviews The BEE Suite and needs to turn findings into clear Codex change requests.

The main rule is simple: test by user type, then by screen, then by feature. Record one requested change per note. A note is ready for Codex only when it says what role saw the issue, where it happened, what should happen instead, and how we will know the fix is done.

## Files in This Kit

- `role-screen-testing-matrix.md` - the master checklist testers should follow by role, portal, route, tab, and feature area.
- `change-note-template.md` - the note format testers should copy for every issue or improvement.
- `codex-batch-prompt-template.md` - the format used to send a clean batch of approved notes to Codex.
- `active-testing-notes.md` - the working board for the current testing cycle.

## Workflow

1. Pick one role and one environment.
2. Open the matching section in `role-screen-testing-matrix.md`.
3. Move screen by screen, not randomly across the app.
4. For each screen, test access, data, primary actions, edge cases, mobile layout, empty states, and error states.
5. Write one note per change using `change-note-template.md`.
6. Mark urgent privacy, payment, login, data loss, or cross-school access issues as `P0`.
7. At the end of the session, group notes into one Codex batch using `codex-batch-prompt-template.md`.
8. After Codex changes are made, retest the acceptance checks listed in the original notes.

## Required Fields for Every Note

Every note must include:

- Note ID
- Tester name
- Date tested
- Environment
- User type
- Test account
- School, center, classroom, family, child, or invoice used
- Screen or route
- Tab, panel, card, modal, or feature
- Device and browser
- Expected result
- Actual result
- Requested change
- Priority
- Evidence
- Acceptance checks

If any of these are missing, the note is not ready for Codex unless it is a `P0` stop condition.

## Priority Rules

| Priority | Use when | Examples |
|---|---|---|
| P0 - Stop testing | The issue can expose wrong data, block login, damage payments, lose records, or create a safety/compliance risk. | Parent sees another family, director sees another center, wrong invoice marked paid, kiosk accepts wrong PIN. |
| P1 - Must fix before rollout | A key workflow is blocked or confusing enough that live staff cannot use it reliably. | Teacher cannot submit daily report, parent cannot pay, director cannot review incident. |
| P2 - Fix soon | Workflow works, but the UI, copy, validation, or data display causes friction. | Button label unclear, missing empty state, confusing sort order, mobile layout too cramped. |
| P3 - Polish/backlog | Nice-to-have improvement that does not block usage. | Better wording, extra filter, minor visual alignment, shortcut request. |

## Stop Conditions

Stop testing that workflow and escalate immediately if any of these happen:

- A user sees data outside their school, family, classroom, or assigned access grant.
- A parent or guardian sees another family, child, balance, document, message, incident, or media item.
- A payment can be applied to the wrong invoice, applied twice, or marked paid without confirmation.
- A kiosk PIN, QR code, or lookup returns the wrong child, family, or center.
- A child incident, media item, custody note, medical note, or compliance record becomes visible to the wrong role.
- A save action says it succeeded but the record is missing or changed incorrectly.
- Login, password reset, or forced password reset blocks an entire role.

## Screen Review Checklist

Use these checks on every screen before deciding the screen is done:

| Check | What to verify |
|---|---|
| Role access | The role can only see the screens and actions intended for that role. |
| Scope | Data is limited to the correct tenant, brand, owner group, school, classroom, family, or child. |
| Data accuracy | Names, dates, amounts, statuses, counts, and totals match the record being tested. |
| Primary action | The main action on the screen works from start to finish. |
| Validation | Required fields, invalid values, duplicates, and unsafe actions show useful messages. |
| Empty state | The screen explains what to do when there is no data. |
| Error state | Failed network/API actions do not leave the user thinking the task succeeded. |
| Permissions | Hidden, disabled, and read-only controls match the user's role. |
| Notifications | Emails, SMS, push, in-app notices, and audit records are created only when expected. |
| Mobile layout | Buttons, tables, cards, dialogs, and forms are usable on phone and tablet sizes. |
| Copy | Labels use school-friendly language and do not expose internal implementation terms. |
| Evidence | Screenshot, video, console error, route, record ID, or reproduction steps are captured. |

## How to Group Notes for Codex

Use batches that are small enough to implement and test safely:

- Good batch: "Parent portal payment method fixes" with 3 to 6 related notes.
- Good batch: "Teacher daily report mobile cleanup" with notes from one screen.
- Bad batch: "Fix everything from testing today."
- Bad batch: "All parent, teacher, director, billing, and executive changes together."

Recommended batch sizes:

- P0: one issue per Codex request.
- P1: 1 to 4 tightly related notes.
- P2/P3: 3 to 8 notes if they touch the same role or screen.

## Definition of Ready for Codex

A note is ready when another person can reproduce it without asking the original tester for context.

Before sending a batch, confirm:

- The role and account are named.
- The screen, tab, and exact control are named.
- The requested behavior is written as a direct instruction.
- The expected result is separate from the actual result.
- The priority is assigned.
- The acceptance checks are testable.
- The note does not mix unrelated changes.

## Definition of Done

A Codex change is done when:

- The requested behavior is implemented.
- Existing role/data scope rules still hold.
- Automated tests pass where relevant.
- The tester can rerun the listed acceptance checks.
- No new P0 or P1 issue appears in the touched workflow.

## Related Existing Docs

- `docs/user-feature-access-map.md`
- `docs/in-school-testing-runbook.md`
- `docs/ROLE_SMOKE_TEST_CHECKLIST.md`
- `docs/sops/README.md`
- `docs/PRODUCTION_RELEASE_CHECKLIST.md`
