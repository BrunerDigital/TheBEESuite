# Wave 1 Kokomo and Centennial Baseline

Generated: August 31, 2026

Mode: read-only production inspection

Primary full-workflow school: **Kid City USA - Kokomo**

Cross-brand isolation school: **Miss Honey's Learning Center - Centennial**

## Decision and purpose

Brenden selected Kokomo and Centennial because they belong to different brands but should use the same BEE Suite workflows. Kokomo is the primary end-to-end role and device target. Centennial is the second tenant/brand used to prove that the same behavior works without crossing school, brand, tenant, family, or provider boundaries.

No account, invitation, PIN, billing, payment, message, import, provider, or cutover state was changed during this baseline.

## Shared platform checks

- Database connectivity: pass.
- Auth secret and PIN hashing configuration: pass.
- Supabase Auth and Storage configuration presence: pass.
- Stripe secret and webhook configuration presence: pass.
- Cross-school classroom mismatch signal: zero for both schools.
- Both schools have active director access and active teacher/staff coverage.

These are configuration and database signals only. They do not prove credentialed user behavior, Stripe live readiness, provider delivery, or business activation.

## Kokomo baseline

Overall automated result: **BLOCKED** for the selected four-module set.

### Data and access signals

- 12 classrooms.
- 26 families and 39 children.
- No centerless families.
- No current children missing classroom assignments.
- 46 guardians in the school-scoped readiness row; 42 have linked parent login users.
- All school-scoped guardians counted by the readiness row have kiosk PINs.
- Active center grants: one center director, one billing admin, and eleven teachers.
- 12 active staff profiles.

### Module gates

- Setup: automated data-ready; human reconciliation/cutover evidence remains separate.
- Parent invitations: blocked because one guardian lacks a phone with at least four digits.
- Kiosk: automated data-ready but requires separate custody, pickup, device, and workflow approval.
- Billing: requires separate balance, Stripe, accounting, payment, and payout approval.

### Immediate Kokomo work

- [ ] Identify the one affected guardian record without exposing it in committed evidence.
- [ ] Determine whether the missing/invalid phone should be corrected from authoritative evidence or intentionally excluded from invitation readiness.
- [ ] Reconcile the four guardians without linked parent login users against enrollment, relationship, invitation, and Supabase Auth evidence.
- [ ] Prepare non-customer director, billing, teacher, parent, pickup, executive/regional, and auditor smoke-account plan.
- [ ] Complete actual kiosk-device and parent/teacher installed-app verification.
- [ ] Run separate Stripe, balance, invoice, ledger, webhook, refund, and payout readiness audits before any billing decision.

## Centennial baseline

Overall automated result: **BLOCKED** for the selected four-module set.

### Data and access signals

- 7 classrooms.
- 163 family records and 146 child records.
- No centerless families.
- No current children missing classroom assignments.
- 94 guardians in the school-scoped readiness row; 92 have valid invitation emails, 89 have usable phones, 88 have linked parent login users, and 80 have kiosk PINs.
- Active center grants: one center director and fourteen teachers.
- 14 active staff profiles.
- No center-scoped billing-admin grant was found.

### Module gates

- Setup: automated data-ready; human source reconciliation/cutover evidence remains separate.
- Parent invitations: blocked by incomplete or unresolved linked source-import evidence, missing source-inventory confirmation, incomplete required source-report coverage, two invalid/missing invitation emails, and five invalid/missing phones.
- Kiosk: blocked because fourteen guardians do not have kiosk PINs.
- Billing: requires separate balance, Stripe, accounting, payment, and payout approval.

### Immediate Centennial work

- [ ] Reconcile the current linked import batch, exact source files/hashes, errors, warnings, disposed rows, and required-report coverage.
- [ ] Identify the two email and five phone exceptions from authoritative school/source evidence; do not infer replacements.
- [ ] Reconcile the six guardians without linked parent login users against enrollment, relationship, invitation, and Supabase Auth evidence.
- [ ] Review the fourteen missing kiosk PINs against current-family, custody, pickup, and phone evidence before proposing creation.
- [ ] Decide whether Centennial needs a center-scoped billing admin or whether billing remains director/executive-only.
- [ ] Prepare non-customer director, billing, teacher, parent, pickup, executive/regional, and auditor smoke-account plan.
- [ ] Run separate Stripe, balance, invoice, ledger, webhook, refund, and payout readiness audits before any billing decision.

## Two-school credentialed verification design

Use synthetic/non-customer accounts stored in the approved credential manager. Do not reuse a real director, teacher, parent, or family credential for broad testing.

For each supported role, prove:

- the intended dashboard and module destinations open;
- ordinary actions work inside the assigned school and role;
- Kokomo credentials cannot read or mutate Centennial records;
- Centennial credentials cannot read or mutate Kokomo records;
- parent and pickup credentials remain limited to exact linked family/children;
- teacher writes remain limited to assigned classroom and school;
- billing actions remain limited to assigned school and do not imply payment authorization;
- auditor accounts cannot mutate through UI, API, direct URLs, exports, bulk actions, or AI;
- tenant-wide roles switch school context deliberately and preserve brand-specific presentation and provider scope;
- logout, session revocation, password recovery, device sessions, installed-app caches, and retry behavior remain isolated.

## Authorization still required before smoke-account creation

The selected schools are now exact. Before creating real production smoke identities, retain an execution preview containing:

- exact proposed email aliases and display names;
- role and school/tenant grant for each account;
- whether the account needs a staff profile, classroom, guardian, family, or authorized-pickup fixture;
- confirmation that every linked fixture is synthetic and financially inert;
- Supabase Auth and Prisma records to be created;
- password/secret-manager and forced-reset policy;
- invitation/email behavior (prefer no live email unless explicitly approved);
- expiry, cleanup, and post-test verification.

## Release/setup status

The master setup PR is green in CI and Vercel preview but branch policy requires an approving review. Auto-merge is disabled and no administrator bypass was used. Wave 1 analysis may continue read-only while that approval is pending.
