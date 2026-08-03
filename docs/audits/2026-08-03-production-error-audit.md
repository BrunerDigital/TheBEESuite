# Production error and school issue audit — 2026-08-03

Scope: production runtime errors from 2026-08-03 00:00–24:00 ET, school-support email received in that window, affected production records, and a follow-up security/configuration review. Read-only production inspection was used; no family, identity, billing, invitation, messaging, or provider data was changed.

## Addressed in this change

- [x] Parent accounts linked to more than one family now fail closed before family or child data is rendered.
- [x] Parent setup, kiosk credential management, product purchase, and payment checkout use the same unambiguous-family guard.
- [x] Parent provisioning rejects an email already mapped to a different family in the tenant before any Auth or application-user mutation.
- [x] Bulk parent-invitation preflight blocks same-school emails mapped to multiple families, including privileged wave scopes.
- [x] Permanently rejected web-push subscriptions (HTTP 400, 404, or 410) are deactivated so they do not generate recurring delivery failures.
- [x] Focused family isolation and push tests pass.
- [x] Full lint, TypeScript, 807-test suite, and Next.js production build pass in an isolated worktree.

## School reports reconciled

- [x] Oakleaf: the two same-last-name child records inspected are currently assigned to separate families.
- [x] Centennial: billing activation is currently enabled; the earlier processor-disabled report predates that activation.
- [x] Longmont and Centennial: the cross-family-link pattern was reproduced and contained globally by the guards above.
- [x] Winter Park: billing, payouts, live payments, and tuition billing remain disabled. No rollout or access state was changed.
- [ ] Existing ambiguous family links need evidence-based review before records are unlinked or merged. The audit found 83 parent users linked to multiple family records and 114 duplicate-email groups across the six reviewed locations. Some may be legitimate; automatic repair would risk removing valid guardian access.
- [ ] Granbury’s new import package needs validation and an explicit import gate before any production import.
- [ ] Garland and Lees Summit still need a user-session reproduction if their navigation/connection symptoms continue after this release; no persistent route-specific application exception was found for those reports.

## Runtime errors and configuration

- [x] Two transient Prisma P1001 connection failures were isolated; later health and database reads succeeded. No destructive database action was taken.
- [x] Web-push HTTP 400 recurrence is fixed by deactivating permanently invalid subscriptions.
- [ ] Supabase Auth password-reset requests returned project-wide HTTP 429 responses. Production requires custom SMTP and an Auth email rate limit sized for the rollout; the built-in provider is intentionally limited and unsuitable for this traffic.
- [ ] Four FTE emails were transmitted on Monday with a stale 2026-06-22 reporting week. The current Friday-only application route created no delivery records and had no matching request at send time. Disable the legacy/external sender or automation that still has SendGrid access.
- [ ] The `web-push` dependency emits Node `url.parse()` deprecation warnings. Plan a focused dependency upgrade after confirming browser/push compatibility; do not use a broad automated dependency fix.

## Additional audit recommendations

- Add centralized exception monitoring with school, role, route, deployment, and request correlation while excluding child/family PII.
- Alert on Prisma P1001, Auth 429, repeated push rejection, and any external email whose dedupe key/week is outside the current service window.
- Add an internal review queue for ambiguous guardian-family links with source IDs, active enrollment evidence, and explicit approve/unlink actions.
- Reconcile SendGrid API keys and scheduled senders so all operational email is recorded in `IntegrationDelivery`.
- Add synthetic parent-login checks for one known-safe account per pilot school and a no-data-leak assertion for ambiguous accounts.
