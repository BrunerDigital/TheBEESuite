# Kokomo production triage — September 28, 2026

Status: diagnosis with confirmed production evidence and synthetic route reproduction. No live repair, invitation resend, password change, PIN change, family/guardian mutation, attendance mutation, or deployment was performed. Exact reporter resend correlation and repair review remain open.

## Production and investigation boundaries

- Canonical production was Vercel Ready at commit `76fa2604688feb46c6a3281e7fc7a8a06962b7b0`, deployment `dpl_B11qsEkH9sA8vkYSQTYkjho8GrFs`, with `thebeesuite.io` and `www.thebeesuite.io` aliases.
- Current Supabase project: `nqjrlktoewiueiwrubas`. Kokomo center: `cmp4ewela003u6alw9ii7uffs`.
- Live inspection used SELECT queries, retained Auth logs, audit metadata, delivery state, and the existing signed-in brand-admin browser session. Only the session workspace selection was changed to Kokomo.
- The shared checkout has unrelated dirty work and is behind origin/main. It was preserved. Diagnostic tests and this report were created in an isolated worktree at the current production source commit.
- No affected family or resend time was provided. Wash Family was selected because it has an exact production guardian-provisioning failure correlated with Auth logs. This is a demonstrated diagnostic case, not confirmation that Wash is the reporter's named resend case.

## Exact family trace

Family `cmueezwwz0000le04jerh87nj` (Wash Family), created September 23 at 18:06:36.900 UTC.

| Stage | Current evidence | Interpretation |
| --- | --- | --- |
| Enrollment | Child `cmueezwxv0004le04u5os80n5` is enrolled and has a classroom whose center is Kokomo | No school/classroom mismatch in this case |
| Family/guardian association | Guardians `cmueezwxa0002le04bfrhlk8d` and `cmuefgztj0010l304jwxqglfo` both belong to that same family | Relationship records exist |
| Parent account | Both guardian userId values are null; no corresponding Auth user was found by guardian email | Parent login is not provisioned |
| Access grant | No grant linked through either guardian userId | Consequence of missing application identity; not evidence that a broad grant should be added. Parent family authorization is resolved through guardian links and tenant scope |
| Invitation | Zero parent_invitation_email delivery records and zero ParentPortalSetupToken records for either guardian | No recorded invitation attempt reached delivery tracking for these guardians |
| Kiosk credential | Both checkInPinHash values are null | Neither guardian can authorize a PIN lookup; no corresponding guardian QR credential can be generated |
| Attendance | One AttendanceRecord exists for the child | Existing attendance must be preserved; its existence does not establish successful guardian kiosk authorization |

Live UI at the exact Wash family profile showed:

- “0 of 2 guardian profiles have a linked Parent Portal account record.”
- Jillian Jacobs and Joseph Wash invitation cards: “Not linked,” “Not invited,” “Send Parent App Invite.”
- Selected guardian: “No PIN,” “Family PIN needed,” “Set a 4-Digit Family PIN to create the matching QR code.”
- The parent portal login checkbox is enabled in saved guardian metadata even though provisioning failed. That intent flag does not prove an account exists.

## Provider, server, endpoint, and UI errors

Exact production correlation:

- Guardian `cmuefgztj0010l304jwxqglfo`: `operations.guardian.created` audit at `2026-09-23T18:19:54.891Z`, with `parentPortalLogin.status=failed` and error “Password is known to be weak and easy to guess, please choose a different one.”
- Supabase Auth at `2026-09-23T18:19:54Z`: `POST /admin/users`, HTTP **422**, same error, request ID `01a0cf7e-e45a-76e5-80b9-1caee5923bf9`.
- The operations guardian path saves the guardian before provisioning and catches the provisioning exception into audit metadata. The historical HTTP response/UI banner for that specific save was not retained in this investigation.

Safe synthetic replay against the current production route source:

| Endpoint | Result | Exact response error |
| --- | --- | --- |
| POST /api/parent/invitations | 502 on the mocked provider weak-password exception | “We couldn't confirm whether the invitation finished. Refresh this family before trying again. If the status is still unclear, contact support.” |
| POST /api/kiosk/lookup | 401 for a guardian with no stored PIN | “PIN was not recognized for this school.” |
| POST /api/kiosk/check, check_in | 401, before attendance writes | “PIN was not recognized for this school.” |
| POST /api/kiosk/check, check_out | 401, before attendance writes | “PIN was not recognized for this school.” |

The invitation button displays the API's error under “Needs attention.” This exact error mapping was reproduced in the server route and verified against UI source. A real production resend was deliberately not submitted, so this is not a captured historical reporter UI error.

The invitation route uses the fixed school-issued initial credential for new accounts. Supabase rejects that credential before an application User is created, guardian userId is linked, or SendGrid is called. Its catch discards the provider exception and returns the generic 502. Existing-account resends can take a different branch and need their own exact family/time correlation; the new-account failure does not prove every resend has the same cause.

## September 25 and fleet comparison

- Kokomo Perez-family guardian provisioning failed at `2026-09-25T14:44:59.548Z`; Auth request `01a0d906-d7eb-7a2b-a176-d3d816049bab` returned 422 at 14:44:59 UTC.
- Kokomo Smith-family guardian provisioning failed at `2026-09-25T17:23:57.934Z`; Auth request `01a0d998-6352-7deb-878f-954962215d74` returned 422 at 17:23:57 UTC.
- These records support an account-provisioning explanation for some missing welcome emails: the flow stopped before sending. They do not establish the cause of every September 25 missing email report.
- The same weak-password failure is confirmed in Pisgah Forest audit records on September 24 and September 28. Therefore it is **not school-specific**.
- Seven new Kokomo families with enrolled children since September 23 had ten email-bearing guardians without userId links; eight guardian rows lacked PINs. Three new Pisgah Forest families with enrolled children had five email-bearing unlinked guardians and five missing PINs. These are review candidates, not a blanket repair target set or proof that every record experienced an invitation failure.
- Kokomo and Pisgah Forest share the Kid City tenant. A different tenant, Centennial/Miss Honey's, had seven parent invitation delivery records marked delivered on September 25. The shared Auth project and shared provisioning code make the failing credential path a cross-tenant technical exposure, but an actual failing invitation in another tenant was **not demonstrated**. Successful alternate flows do not prove that tenant is immune.
- Separate delivery failures exist: Kokomo's Valdez invitation on September 22 has `SendGrid bounced event.`; Cordera's September 28 invitation has `SendGrid suppressed event.` Neither is the Wash provisioning failure, and neither authorizes suppression removal or a resend.

## Change comparison

- `b65de0c3`, September 8, PR #318: removed phone-derived default kiosk PIN creation. Existing hashes were retained. New guardians now require an explicit private PIN. Current welcome copy instructs parents to choose a PIN. Restoring a phone-derived default would reverse an intentional security control.
- `dac12a16`, September 8, PR #327: reserved review-identity safeguards in invitation/account paths; no evidence of a reserved identity in the Wash case.
- `e9b36156`, September 25, PR #426: duplicate-child intake safeguards. It did not modify parent invitation provisioning or kiosk credential generation.
- September 25 teacher credential fixes affect staff account creation; the parent path still uses the rejected fixed initial credential.
- `f73c592c`, September 1, PR #283: parent setup-link lifetime fixes. Wash has no setup-token record, so token expiration is not this case's failure.
- Parent family scope history includes September 2 past-family payment access and August 14 multiple-linked-family support. Wash's two guardians are in one current family; no demonstrated multi-family access ambiguity here.
- The exact timing of a Supabase password-policy change was not verified. Logs prove rejection by September 23; do not attribute its onset to a particular release without configuration/audit evidence.

## Safe reproduction and verification

Run `node --import tsx --test tests/kokomo-production-triage.test.ts`.

The helper mocks database, Auth, email, audit, checkout-report delivery, and rate limiting. Every unexpected application write or send fails the test. The failing invitation replay asserted zero application writes and zero sends. Kiosk lookup/check-in/check-out replay asserted 401 responses before writes.

Also passed 31 focused existing tests across invitation readiness, family-link safety, private PIN controls, kiosk child selection/isolation, and attendance state. The kiosk suite includes successful same-school enrolled-child check-in and rejected cross-family, cross-school, unassigned, and inactive-child cases. These tests verify current guards, not a repaired invitation flow or real production attendance action.

Vercel's grouped error view returned no error clusters for the selected routes. Unscoped runtime-log retrieval timed out; a deployment-scoped narrow query returned no matching 502 rows. These results do not negate the exact Supabase and application audit failures and do not prove clean production logs. A swallowed provisioning exception need not appear as a runtime error cluster.

## Concrete repair requirements at diagnosis

At the end of diagnosis, no live repair had been applied. The following requirements were recorded before the user authorized the technical fix and production release.

1. Code repair: replace the rejected shared credential on the new-parent path with provider-compatible per-account credentials or the existing tracked one-time password-setup flow. Existing Auth IDs, application User IDs, existing passwords, guardian associations, and audit records must remain intact. Do not weaken provider password policy.
2. Make account linking repeatable without resetting existing passwords or incrementing sessionVersion unnecessarily. Fail closed for cross-tenant, staff/parent collisions, disabled access, and multi-family ambiguity. Validate the target and identity state again immediately before any write; handle concurrent creation without duplicates.
3. Return a useful sanitized provisioning error and request reference instead of swallowing the provider failure. Distinguish saved guardian, linked account, email accepted, confirmed email delivered, and missing PIN in the UI.
4. Review an exact-target dry-run manifest for real repairs. Include family/guardian IDs, current identity/link/role/tenant/PIN/delivery fingerprints, proposed actions, and preconditions. Reuse existing identities; no delete/recreate strategy. Retain current audit and append repair audit records. Rerun must be a no-op for completed linkage/PIN steps. An invitation resend remains an explicit send, not an automatic retry side effect.
5. Missing PINs require an explicitly chosen private PIN in the approved school/parent flow. Do not derive PINs from contact data. Do not alter attendance to make the kiosk appear successful.
6. Before release, exercise a synthetic new-family invitation through a safe mail sink; parent setup/sign-in; private PIN creation; kiosk lookup; check-in then check-out; repeated provisioning; existing-account resend preserving its password; provider rejection and email failure recovery; and cross-school/cross-tenant denial. Verify the repaired flow, then obtain code review and run `npm run vercel-build` before protected release.
7. Require intended-commit Vercel Ready, canonical aliases, health, relevant logs, and safe changed-flow verification. Business data repair and actual family invitation sends are separate from code deployment.

Outstanding evidence: the reported resend's exact family, timestamp, UI message, endpoint response/request ID; whether that family's attempted attendance was kiosk PIN, QR, or parent-app check-in; exact cross-tenant failure incidence; and password-policy change timing.

## Authorized technical repair

The user subsequently requested "Get it fixed and live." The scoped code change replaces the rejected shared initial credential with a high-entropy per-account credential and uses the existing tracked, one-hour, single-use private password setup flow for new or incomplete parent accounts. Existing Auth credentials are never rotated by a normal invitation, including Auth identities that precede the application record. Completed application links are a no-op on repeat provisioning; existing user names, IDs, roles, PINs, custom fields, and audit history are preserved. Conflicting identity links fail closed. Database uniqueness prevents duplicate application email identities; a failed concurrent attempt can safely retry against the preserved identity.

Provider failures return a sanitized stage-specific error with a support reference. Private setup URLs are removed from persisted email payloads and are never replayed by generic mail retries. Provider acceptance remains separate from webhook-confirmed delivery. The invitation UI explains private setup and PIN requirements and refreshes saved linkage after success or failure.

`tests/parent-invitation-repair.test.ts` drives the real invitation, password-reset, parent-profile/PIN setup, and kiosk route handlers with synthetic in-memory database, Auth, session, token, and email boundaries. It verifies token replay denial, private PIN hashing, check-in followed by check-out, repeated provisioning, existing-account reminders, orphaned Auth preservation, provider/setup/email failures, and tenant/school/identity conflict denial. No real family, provider, or attendance record is used. This is a safe automated flow; it does not claim real production parent sign-in or message delivery.

No bulk repair script, data migration, real invitation resend, password reset, PIN assignment, family change, or attendance mutation is included in the release. Affected families still need the authorized school/parent invitation and privately chosen PIN flow. Release completion requires the full production gate, protected PR checks/review, intended-commit deployment, canonical health/log review, and authenticated read-only UI verification.
