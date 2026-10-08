# Review school and staff setup

Category: Setup and support

Before you start: confirm the correct school and role. Use approved source records; perform live changes only within your assigned authority.

The director validates the operational workspace before teachers, parents, or the lobby kiosk depend on it.

1. Sign in at `https://thebeesuite.io/directors` with the approved director account.
2. Confirm the correct school and role. Stop immediately if another school is visible.
3. Verify the official school name, address, time zone, phone, email, hours, director contact, notification recipients, and parent-facing name.
4. Verify every classroom name, age group, capacity, ratio, schedule, and active child assignment.
5. Verify current staff, role, school assignment, classroom assignment, and employment status.
6. Reconcile access in both directions against the school's approved staff roster. For each staff member expected to sign in, match the active application user, normalized email, Supabase Auth identity, and exact school/role grant. Verify the Auth account is not banned or disabled and has a usable password-login credential, since the application signs in with email and password; have the account holder prove login where needed without sharing their password. Record any unverified or unusable account as an access-GO blocker. Inventory **every active Prisma user with potential school access**, whether or not Auth currently permits a new login, including portfolio or elevated roles and accounts absent from the expected-login list. Review active `DeviceSession` records and the user's application `sessionVersion`; a prior signed application cookie can remain usable after an Auth ban, and a cookie without a device-session ID cannot be found by inventory. Before access GO, invalidate older cookies for every in-scope account by incrementing its session version through the separately approved identity/session gate and verifying old cookies are denied, or prove that issuance of cookies without device sessions has stopped and the full 12-hour cookie lifetime has elapsed. Merely reading the current version or revoking listed device sessions does not prove the untracked cookies expired. Treat any unexpected access or outstanding session as an access-GO blocker until its scope is approved or revoked and denial is verified. Review all active grants; the Prisma `User.role` and effective `UserAccessGrant.role` for this school must both match approved duties and scope, with any other grants separately justified. A grant alone does not constrain a wrong application role. Classify missing Auth identities as intentionally uninvited or blockers with the school owner. An active staff profile or grant alone does not prove login readiness. Do not create accounts, change access, or send invitations from this review.
7. Remove former staff from active operational lists through the approved staff process; do not change Auth access unless that separate gate is authorized.
8. Test one director and one teacher session. Each user must see only the correct school, classroom, children, documents, messages, attendance, and billing scope.

Wrong-school, wrong-classroom, or wrong-family visibility is an immediate stop condition.

## Verify the result

School facts, rooms, roles and operating processes have verified owners.

## If something goes wrong

Do not change access or provider settings merely to complete a checklist. Wait for pending actions; reopen the record before retrying an uncertain save or send.

Source: sources/SCHOOL_TRANSITION_SETUP_AND_CUTOVER_SOP.md — 5. Director School And Staff Setup. Prepared October 8, 2026. SOP snapshot e06ad8d5; current source corrections are identified above. Written procedure; not a recording of a completed live action.
