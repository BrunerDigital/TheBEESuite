# School owner logins

School owners use director capabilities with a server-managed `school_owner` account type and explicit CENTER grants. No new database enum or migration is required. Existing directors, executives, families, billing settings, connected Stripe accounts, and school activation gates retain their current behavior.

## Administrator setup

Open the executive administration console and the Owner / tenant logins panel. Verify the owner's name, email, and exact school list against the current directory. Enter a unique temporary password of at least 12 characters and select the schools. Create a separate owner login; the action refuses to convert an existing application or Auth login and does not send email.

Owner authentication and application identity are separate records. The application record stays inactive until Auth creation succeeds and the CENTER grants plus activation audit commit together. If creation fails, the pending application reservation stays inactive with no grants. Review the reserved application identity and its Auth identity before recovery. Never attach an unrelated existing Auth identity or reset an existing person's password to recover a reservation.

Owners must change the temporary password on first login. Default sign-in goes to `/owner`. Owners with multiple schools must select one assigned school; all-location views are unavailable. A single-school owner goes straight to that school. School access is checked from server-held application data, not editable Supabase user metadata.

## Owner work

The owner workspace links to School setup, Stripe billing and payouts, family records, data readiness/imports, and the daily school dashboard. These are the existing director tools and their existing server authorization, school scope, import review, payment consent, and activation checks.

Stripe onboarding and payout bank selection continue through the existing secure Stripe flow. Creating an owner login does not create or replace a Stripe account, activate billing, create invoices, charge a parent, or move money. Imported financial history, starting balances, tuition rates, family responsibility, and duplicates still require the existing reviewed import process.

## Rollout source review — 2026-10-07

The current 2026 Kid City USA Full Directory in Drive was last modified September 28. Comparison with current active/trial/paused production records excludes demo, generic seed records, and the unassigned lead queue. It finds 47 named schools; 42 match a directory entry and 29 have a primary-contact email candidate. These are candidates, not approved owner assignments: the directory mixes owners and directors and contains mismatched school contact emails.

No unambiguous directory match was found for Bargersville, Loogootee, Whitestown, Miss Honey's Centennial, or Miss Honey's Cuzco. Confirm their owner contacts separately. Existing corporate executive accounts must not be converted into school-owner accounts. Owners spanning different tenant identities require separate reviewed tenant-scoped accounts; this change does not create cross-tenant grants.

The private mapping review is intentionally excluded from the repository. No production owners have been provisioned during development.

## Validation

Focused authorization tests cover selected-school-only access, foreign/revoked school rejection, denial of all-location selection, preserved director behavior, input validation, caller authorization, existing identity preservation, disabled reservations on failure, atomic CENTER grants, and omitted passwords in responses. Browser fixture QA at 1280px and 390px exercises blocked incomplete submissions, school selection, one mocked submission, and cleared credentials after success. It does not exercise live Stripe or create production Auth users.
