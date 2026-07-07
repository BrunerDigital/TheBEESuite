# Codex Batch Prompt Template

Use this when sending approved QA notes to Codex. Keep the batch focused on one role, one workflow, or one closely related set of screens.

```md
We need to implement the following QA change notes for The BEE Suite.

Scope:
- Role:
- Portal/dashboard:
- Screens/routes:
- Environment where issue was found:
- Priority:

Do not change:
- Existing tenant/brand/school/family/classroom scoping rules.
- Unrelated role dashboards or unrelated workflows.
- Existing dirty worktree changes that are not needed for this request.

Source QA notes:

## QA-YYYYMMDD-ROLE-001
Priority:
URL/route:
User type:
Test account:
Scope record:
Device/browser:
Screen:
Tab/section/card/modal:
Feature/control:

Expected:

Actual:

Requested change:

Reproduction steps:
1.
2.
3.

Evidence:

Acceptance checks:
- [ ]
- [ ]
- [ ]

## QA-YYYYMMDD-ROLE-002
Priority:
URL/route:
User type:
Test account:
Scope record:
Device/browser:
Screen:
Tab/section/card/modal:
Feature/control:

Expected:

Actual:

Requested change:

Reproduction steps:
1.
2.
3.

Evidence:

Acceptance checks:
- [ ]
- [ ]
- [ ]

Please:
1. Inspect the relevant code first.
2. Make the smallest safe change that satisfies the acceptance checks.
3. Add or update focused tests when the change touches data scoping, payments, auth, billing, attendance, parent visibility, incidents, media, documents, or API behavior.
4. Run the relevant verification commands and summarize what passed or could not be run.
5. List the files changed and any follow-up risks.
```

## Good Batch Examples

- Parent portal invoice payment and payment method display issues.
- Teacher portal daily report mobile layout and submit validation issues.
- Director CRM lead detail status and notes issues.
- Billing admin Stripe Connect readiness and failed payment messaging issues.
- Kiosk PIN validation issues.

## Poor Batch Examples

- Everything from parent portal, teacher portal, billing, and director testing.
- A visual polish request mixed with a payment reconciliation bug.
- A P0 data visibility issue bundled with unrelated copy changes.
