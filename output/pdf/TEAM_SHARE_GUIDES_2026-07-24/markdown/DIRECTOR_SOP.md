# Director SOP - The BEE Suite

Last updated: July 20, 2026

Audience: center directors, assistant directors, and school operators responsible for daily use of The BEE Suite.

> TEAM SHARE SNAPSHOT - JULY 24, 2026
>
> This copy was refreshed after production release `7e64b926`. The release is live and verified, but it did not activate a ProCare import, billing, payments, invitations, communications, kiosk, or a wider school wave. Kokomo may continue its approved normal production use. Confirm the named school and module have a dated GO before treating a workflow as live.

## Visual Overview

![Director dashboard guide](../assets/bee-suite-director-dashboard-guide-2026-06-25-7ff189b3e5.png)

Use `SCHOOL_SYSTEM_OPERATING_MANUAL.md` for the full launch map and `BILLING_ADMIN_SOP.md` for deeper billing/payment procedures.

## Purpose

This SOP explains how directors should use The BEE Suite for the workflows that affect live school operations: families, children, classrooms, teachers, attendance, parent portal access, billing, documents, incidents, communications, and support escalation.

## Before You Start

Confirm these items before staff or parents are trained:

- Your director account opens the correct school at `https://thebeesuite.io/login`.
- Every classroom has the correct name, age group, capacity, and ratio expectations.
- Teacher accounts are active and assigned to the correct classroom.
- Family profiles have the correct guardians, children, emails, phone numbers, custody notes, allergies, medical notes, and authorized pickups.
- Open balances and invoices have been reviewed before parent payments are enabled.
- Stripe payout onboarding is complete for the school before parents are asked to pay online.
- Parent-paid processing recovery is not enabled unless ownership has approved the disclosure and policy.

## Daily Opening Routine

1. Log in at `https://thebeesuite.io/login`.
2. Confirm the school shown in the app is your school.
3. Open the dashboard and review alerts, attendance, ratios, messages, billing follow-ups, document requests, and incident review items.
4. Check teacher coverage and classroom assignments before children arrive.
5. Confirm the kiosk or tablet is on the correct school check-in screen.
6. Review any unresolved support issues from the prior day.

Do not enter operational data if the wrong school, classroom, or family scope appears.

## Families, Children, And Guardians

Use the family profile as the source of truth for parent portal access and child visibility.

1. Open the family record.
2. Read the sticky `Currently editing family data` header before changing anything. Confirm the school, family, selected child, selected parent, billing account, and record counts.
3. Use `View full profile` for the complete record and `Open billing` when the selected family or child needs billing work. These links preserve the current context.
4. Confirm all guardians are listed with the correct relationship.
5. Confirm each guardian's personal email address is accurate.
6. Confirm each child is linked to the correct family and classroom.
7. Review custody, pickup, allergy, medication, and media permission notes.
8. Follow the school's approved access-removal process for outdated contacts; do not remove a guardian, payer, pickup, or emergency contact merely because the record looks duplicated.
9. Save the specific section and confirm the success state before switching to another family, child, or guardian.
10. Refresh or reopen the full profile before inviting or training the family.

Stop and escalate if custody, pickup, or medical information conflicts with school paperwork.

Weekly tuition is read from the selected child's billing assignment. The family view shows the total of active child assignments and a per-child breakdown. Directors should open Billing to change the assignment rather than typing another tuition amount into family or enrollment notes.

## Parent Portal Access

Parents log in from the same web app login screen as staff:

```text
https://thebeesuite.io/login
```

Parent login rules:

- Username/email: the parent's personal email address on the guardian profile.
- First access: the parent creates a private password from the one-time setup link sent to that email.
- The setup link expires after one hour and cannot be reused; sending a new setup link revokes the prior unused setup link.
- If the parent cannot log in, confirm the guardian email is correct and use a fresh setup/recovery link. Never send or request a password.

Director steps:

1. Open the family profile.
2. Confirm the guardian email is present and spelled correctly.
3. Confirm the guardian is connected to the correct family.
4. Confirm the parent portal access action has been completed or send the parent portal invite.
5. Tell the parent to open the private one-time setup link, create a password, and then use their guardian email at `https://thebeesuite.io/parents`. If the link expires, send a fresh link; never send or request a password.
6. If the parent sees no family after login, verify the guardian-to-family link.

Never give one guardian another guardian's login.

## Billing, Ledger, And Payments

Billing users should review the ledger before sending payment instructions.

1. Open the family billing or invoice view.
2. Confirm the header shows the intended school, family, billing account, and selected child.
3. Confirm the current balance, active per-child weekly tuition, family weekly total, open invoices, credits, and recent payments.
4. If the family owes money, open the invoice or payment action connected to that balance.
5. Confirm the payment method offered to parents matches the school policy:
   - ACH/bank payment is preferred when enabled.
   - Card payment is optional if enabled.
   - Any fee or recovery disclosure must be shown before payment.
6. For failed or pending payments, review the payment status before retrying.
7. Do not mark an invoice paid manually unless the payment has been verified outside the app.
8. Do not use `Charge This Child Now` unless an immediate invoice is intended and approved.

If Stripe checkout shows an error, capture the family name, invoice number, amount, payment method, time, and screenshot before escalating.

## Teacher Workflow Oversight

Directors are responsible for roster and classroom accuracy.

1. Confirm each teacher account is active.
2. Confirm each teacher has the correct classroom assignment.
3. Confirm teacher kiosk codes are assigned if staff clock-in/out is used.
4. Review daily reports for completeness and tone before parents rely on them.
5. Review incident reports before they are visible to parents.
6. Review child media before sharing when school policy requires approval.
7. Watch for offline queue warnings on classroom tablets.

Teachers should not work from another teacher's account or from a wrong classroom roster.

## Documents, Forms, And Signatures

Use documents for records that must be requested, reviewed, acknowledged, uploaded, or retained.

1. Open the document or checklist view.
2. Confirm the document is assigned to the correct family, child, or staff member.
3. Send the request only to the correct guardian or staff member.
4. Review submitted documents before marking them complete.
5. Reject incomplete or incorrect submissions with a clear note.
6. Keep expired, missing, or rejected records visible until resolved.

Do not upload sensitive documents to the wrong child or family record. If that happens, stop and escalate as a privacy incident.

## Incidents, Media, And Parent Acknowledgements

Incident and media workflows must stay factual and child-specific.

1. Confirm the child and classroom before reviewing an incident.
2. Check that the teacher description is objective and complete.
3. Confirm action taken, staff notified, and parent notification details.
4. Approve only when the report is ready for parent acknowledgement.
5. For photos or media, confirm permission before sharing.
6. If a child has a restriction, do not share media until the director resolves it.

Do not use AI output as the final decision for safety, custody, medical, or licensing matters.

## Communications

Use the smallest appropriate audience.

1. Choose the right channel: family message, classroom message, announcement, billing notice, or support escalation.
2. Confirm the recipients before sending.
3. Keep messages professional, clear, and short.
4. Review AI-suggested text before sending or copying.
5. Avoid including sensitive information in broad announcements.
6. Save or log important parent follow-up when the workflow supports it.

## End-Of-Day Routine

1. Confirm all classrooms have completed attendance updates.
2. Review missing daily reports.
3. Review unresolved incidents and media approvals.
4. Check parent messages and contact requests.
5. Review billing follow-ups that need tomorrow's attention.
6. Confirm queued offline classroom actions have synced.
7. Document any unresolved operational issue for the next opening director.

## Escalation Checklist

Escalate with the following information:

- School name.
- User email.
- Role.
- Page or workflow.
- Family, child, invoice, or document involved.
- Exact action attempted.
- Expected result.
- Actual result.
- Screenshot if available.
- Time of issue and whether it is blocking live operations.

Use urgent escalation for login outages, wrong-school visibility, payment failures, privacy exposure, missing children, custody conflicts, or incorrect incident/document visibility.
