# Payment and family navigation recovery — September 17, 2026

## Confirmed shared defects

- The shared Base UI Select styled the popup as the scrolling element but registered an unconstrained inner List. Base UI scroll arrows tracked that inner element, so long lists lost their scroll controls. Render options directly in the bounded popup, which Base UI explicitly supports as the listbox/scroller.
- A Checkout request could return a definitive provider rejection recorded as FAILED while the client received a 502 and correctly held the uncertain attempt. Status observation then classified every FAILED receipt as unresolved, leaving that local warning indefinitely. The observation now recognizes only an exact FAILED Stripe checkout with recorded HTTP 400 rejection, failure timestamp, no provider object IDs, and no earlier uncertainty. It releases only that client hold. Unrelated pending attempts, successful payments, ACH processing, returns, and ambiguous failures retain their safeguards.

## Production investigation

Baseline canonical production was Ready at `d426ed31f4d84158091cc7e57ec091ab961ca8fe`, deployment `dpl_88Xn8Ed6gVLuc2boaRZE5EW3JkDL`, including #402 and #403. Supabase access and existing Stripe credentials permitted direct read-only investigation. A database snapshot showed ten idle application connections against the database's 60-connection maximum, substantially below the earlier 40. No connections were terminated.

Both reported school payment accounts were enabled at Stripe with details submitted and no currently due requirements. The named parent's exact school/family, successful provider outcomes, processed webhook receipts, and one ledger entry per successful payment were verified privately. No payment repair was required for that family. Pending ACH transfers and an open unpaid Checkout at the reported schools were preserved. Read-only fleet inspection identified rejected Checkout attempts across ten locations; no bulk updates were performed.

Vercel exposes production database URLs as redacted sensitive values, including through its single-variable API. No PRISMA connection/pool overrides were listed. The available local database URL uses transaction pooling, but that does not establish the captured production URL. Public health and deployment logs cannot prove a specific director's authenticated UI. The saved synthetic director credential was rejected; no identity or permission was changed to bypass authentication.

## Verification

- Focused observation/receipt tests cover rejection, unknown outcomes, existing provider objects, successful/processing states, foreign family/invoice access, and another active payment.
- Local browser fixture uses the real Select and recovery hook with 80 synthetic families and no backend. Verify last-family selection, reopening, wheel/keyboard navigation, and continued navigation after failed/successful/unresolved observations.
- Start with `node --import tsx scripts/serve-select-scroll-qa.ts`. `/baseline` uses the pre-fix Select, `/` uses the current Select, and `?outcome=not_submitted`, `?outcome=unresolved`, or `?outcome=settled` exercise synthetic recovery.
- Run the canonical `npm run vercel-build` and protected PR checks before merge. Verify the resulting production SHA, canonical aliases, health and logs separately from authenticated workflow evidence.

No charges, retries, refunds, credits, invoice edits, enrollment creations, notifications, or access changes are part of this repair.
