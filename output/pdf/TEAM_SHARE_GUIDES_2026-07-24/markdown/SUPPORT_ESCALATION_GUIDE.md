# Support Escalation Guide

Last updated: July 20, 2026

> TEAM SHARE SNAPSHOT - JULY 24, 2026
>
> This copy was refreshed after production release `7e64b926`. The release is live and verified, but it did not activate a ProCare import, billing, payments, invitations, communications, kiosk, or a wider school wave. Kokomo may continue its approved normal production use. Confirm the named school and module have a dated GO before treating a workflow as live.

Use this for live-school support during the Kid City USA pilot and future customer rollouts.

## Severity Levels

### P0: Live System Down Or Data Exposure

Examples:
- Users cannot log in across multiple schools.
- Public inquiry intake is down.
- Location users can see another location's private data.
- Parent/child/custody/medical/billing data is exposed to the wrong user.
- Payment or payout flow behaves incorrectly in production.

Response:
- Stop related rollout work.
- Capture affected user, school, URL, timestamp, and screenshot.
- Check Vercel deployment/logs and Supabase status.
- Roll back or disable the affected feature if the issue is confirmed.
- Document the incident and follow up with affected stakeholders.

### P1: Critical Workflow Broken For One Or More Schools

Examples:
- A school cannot submit FTE.
- Leads are not creating for a selected location.
- ProCare import fails for a school during cutover.
- Kiosk check-in cannot be used at a live school.

Response:
- Confirm whether the issue is role-specific or location-specific.
- Reproduce with the affected role if possible.
- Check API logs and recent deployment changes.
- Apply a targeted fix or documented workaround.
- Confirm resolution with a production smoke test.

### P2: Important But Workaround Exists

Examples:
- Report export has a formatting problem.
- Notification dropdown is missing a non-critical item.
- A dashboard card has stale data but the underlying module works.

Response:
- Log the issue with module, role, expected behavior, and actual behavior.
- Prioritize in the next patch release.
- Avoid risky production changes unless it blocks school operations.

### P3: Cosmetic Or Future Enhancement

Examples:
- Layout polish.
- Copy changes.
- New filters or convenience actions.

Response:
- Add to the backlog.
- Batch with related UX improvements.

## Information To Capture

- School/location name and location ID.
- User email and role.
- Page URL.
- Time and timezone.
- Steps to reproduce.
- Expected result.
- Actual result.
- Screenshot or screen recording if available.
- Whether the same issue happens for executive users.

## First Checks

- Confirm the user is signed into the correct account.
- Confirm the user is assigned to the expected center.
- Confirm the record belongs to the same center.
- Check `/api/health`.
- Check `/api/system/readiness` with an executive account.
- Check Vercel function logs for the affected route.
- Check Supabase database/API status.

## Data Safety Rules

- Never manually move production data across centers without confirming location ID and tenant.
- Never expose child, medical, custody, billing, or parent contact data in support screenshots beyond the minimum needed.
- Do not paste production secrets into tickets, docs, chat, or code.
- For imports, keep the source file, dry-run output, final batch ID, and rollback notes.
