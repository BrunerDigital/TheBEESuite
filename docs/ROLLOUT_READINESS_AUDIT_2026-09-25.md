# Kid City USA and Miss Honey's rollout readiness audit

Read-only checkpoint, September 25, 2026 (about 23:54 UTC). Scope: 57 active Kid City USA school records and both active Miss Honey's school records. Demo, unassigned, closed, and trial records are excluded. The separate school matrix in the shared checkout covers the 57 Kid City schools and Centennial; **Cuzco must be added** before using it as a complete outreach or activation list.

## Decision

**Fleet rollout is not yet verified ready.** All 59 schools have a structurally usable director or assistant account (active center grant plus active application user and confirmed, unbanned Supabase Auth user). This is not a successful password login or authenticated dashboard test for each person. Data, provider, email, and operational gates below remain open.

| Area | Current evidence | Readiness conclusion |
| --- | --- | --- |
| Production app | Vercel production commit `ff790327` is Ready on `thebeesuite.io` and `www.thebeesuite.io`; canonical health returned 200 with database connected. | App reachable; this does not prove school workflows. |
| Director access | 57/57 Kid City and 2/2 Miss Honey's schools have a confirmed director or assistant Auth account attached to an active center grant. | Account structure present; actual sign-in, password recovery, and role navigation need credentialed school tests. |
| School data | Kid City: 39/57 no family records, 38/57 no classrooms, 1/57 no staff. Miss Honey's: 1/2 no family records, 1/2 no classrooms, 1/2 no staff; the empty school is Cuzco. | Source roster, classroom, staff, and director review required. A zero count may be an intentional clean start; record that decision before entry. |
| Billing | Earlier same-day active-account review: 18/58 saved school Stripe accounts had charges and payouts enabled; 40 were blocked. That 58-school review omitted Cuzco. | Do not activate payments by fleet or infer Cuzco's state. Validate exact school account, payout ownership, invoice rules, cutover, and approvals. |
| Webhooks | Last 14 days: 1,571 SendGrid delivered-event receipts and 775 processed Stripe webhook events. Stripe also has 43 `checkout.session.completed` receipts marked pending, including two in the last 14 days. A September 25 read-only join found 36 tied to currently paid payments, four void, one failed, and two still draft; all 43 Checkout snapshots said `unpaid`. The two draft family-balance receipts had no processed async terminal receipt in the local receipt table. | Pending Checkout receipts can reflect asynchronous payment processing; they are not 43 failed payments. Reconcile the two draft cases with Stripe and the ledger before payment-flow signoff, without replaying or changing money from the receipt count alone. |
| Email delivery | Last 14 days: Kid City SendGrid deliveries 877 delivered/79 failed; Miss Honey's 34 delivered/9 failed. Recent failures include Cuzco's FTE reminder and several Kid City school notices. | Delivery is active, but failed purposes, reply routing, suppression, and exact test-recipient delivery must be reviewed before rollout. |
| Email templates | All 57 active Kid City schools have 12 active, saved email templates. Centennial and Cuzco have **zero** saved email templates, but built-in templates remain available in their dashboards. The production version at this checkpoint hides built-in portal reply and broadcast choices in schools with any saved template. | Release the template merge and school-branded communication HTML, then verify rendering. The older manual announcement contains unverified claims. Saved Miss Honey's custom copy should be created only after content approval. |
| API errors | In the last 24 hours, nine 502 responses occurred on a previous production deployment: teacher setup, parent invitations, and family payment. The current deployment includes the teacher onboarding fix and had no 5xx runtime logs in the checked two-hour window. A seven-day runtime error review also found family-payment Stripe Checkout provider rejections on September 23 and 25 with 400 responses. | Re-exercise those exact paths with approved synthetic identities and investigate the exact provider rejects; absence of 5xx without those flows being used does not close them. |

## Technical validation

- Clean `origin/main` worktree at `ff790327`: 208 focused family, billing, readiness, email, and Stripe webhook tests passed after Prisma client generation.
- Local intercepted browser QA passed family entry at 390px and 1280px across success, network, invalid-JSON, and validation outcomes; school-setup save QA passed four Chromium cases.
- `npm run ops:check` passed: 9 configured cron handlers, 46 Prisma migration mirrors, and 49 deployable Supabase migrations. It is a static check and does not prove recent cron execution or database migration state.
- `npm run vercel-build` passed on clean `ff790327`: Prisma generation, lint, typecheck, all 2,537 tests, and the Next.js production build completed.

## What must happen next

1. Use an approved synthetic director/assistant account in **two distinct schools, including one Miss Honey's school**, to test sign-in, school selection, setup save, classroom/staff entry, household entry, duplicate prevention, document and contact entry, billing preview, and school isolation. Test mobile and desktop. Never use real family records as test data.
2. Confirm each school's source roster and setup path. Review existing families before entry; for empty schools, confirm clean start versus approved import. Resolve Cuzco's school identity, absent roster/classrooms/staff, and the missing Vero Beach staff profile before declaring either school operational.
3. Reconcile the two still-draft Stripe family-balance checkout cases and recent 502 family-payment response against provider state without charging or changing ledgers. Review historical pending receipts in context of their terminal payment state. Re-check each saved Connect account and business approval separately from data-entry readiness.
4. Investigate recent failed SendGrid purposes and the parent-invitation 502 responses. Verify approved sender domain, school-specific From/reply-to, branded rendered template, test delivery event, and monitored reply inbox. Do not treat provider acceptance as delivery.
5. Review the school-specific copy in `docs/ROLLOUT_EMAIL_REVIEW_PACKET_2026-09-25.md` and inspect the rendered email for both brands. Built-in dashboard templates are available without seeding saved copies. Confirm exact school/recipient scope and wording before any send.
6. Record per-school director, finance, parent-invitation, kiosk, and ProCare cutover decisions independently. No technical check here grants business activation.

## Evidence limits and safety

Production Supabase queries returned aggregate counts, school names, and non-sensitive status only. No identity, grant, billing, family, provider, or message writes occurred. The clean build and local QA do not substitute for authenticated production workflow evidence. The shared checkout's unrelated edits remain untouched; this audit added only the two review documents.
