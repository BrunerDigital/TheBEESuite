# Selected-School Credentialed UX and Device Evidence Checklist

Use one copy per selected school after Brenden approves the scoped test accounts and real launch devices. This checklist does not authorize parent invitations, live billing, production-data changes, or deployment. Use approved test families and Stripe test mode only.

## Evidence header

- School / center ID:
- Intended live modules:
- Test date and build/commit:
- Tester and technical witness:
- Approved test family identifier (non-live):
- Director/billing account:
- Teacher account:
- Linked guardian account:
- Desktop device, OS, browser, viewport, zoom:
- Phone device, OS, browser/app shell, text/zoom setting:
- Tablet/kiosk device, OS, browser, orientation:
- Evidence location:

For every check, record `PASS`, `FAIL`, or `NOT IN SCOPE`, the device/account, timestamp, screenshot or recording reference, observed result, defect ID, workaround, owner, and retest result.

## Stop conditions

Stop and mark the school `NO-GO` for the affected module if any test shows another school's or family's data, an incorrect payment/invoice application, an unauthorized check-in/out, missing custody/medical warning, an unrecoverable onboarding/payment dead end, or a critical control that is unusable with keyboard or the actual launch device.

## Public and account recovery flows

- [ ] Parent login has correct accessible names, logical keyboard order, visible focus, 44 px primary controls, password-manager attributes, and an announced invalid-login error.
- [ ] A rejected/offline login request preserves email, shows a plain-language retry message, and permits retry without reload.
- [ ] Forgot-password preserves email on failure, uses the same privacy-safe confirmation for active/unknown emails, and returns to the correct role login.
- [ ] Missing, malformed, and expired reset links explain the problem and link to request a fresh reset.
- [ ] Password mismatch and provider failure preserve both password fields, announce the error, and allow correction/retry.
- [ ] Successful reset returns to the intended role/parent destination without an unsafe open redirect.

## Parent setup and family scope

- [ ] Parent setup displays only the approved guardian, family, school, and children.
- [ ] Name, phone, relationship, communication preference, and PIN have accessible labels and usable input modes.
- [ ] Validation and offline/provider failures are announced; entered values remain available for retry.
- [ ] Successful setup reaches the parent portal and the PIN works only for the linked children at the selected school.
- [ ] Password reset, sign-out/sign-in, browser back/forward, and session expiry have clear recovery paths.

## Payment link and checkout recovery

- [ ] Invalid/expired payment link requests a new school-issued link, warns against entering details elsewhere, and returns to parent sign-in.
- [ ] Link displays the correct school, family, recipient, open invoice, amount, and due date using the approved test family.
- [ ] Bank and card setup controls are keyboard operable, visibly focused, correctly named, and at least 44 px high.
- [ ] Cancelling payment-method setup returns with `Setup was cancelled`, confirms nothing was saved, and offers retry.
- [ ] Cancelling invoice checkout returns with `Payment was cancelled`, confirms nothing was submitted, and offers retry.
- [ ] Provider/session failure states state that no completed payment was recorded and permit retry without losing the invoice context.
- [ ] Successful test-mode payment returns with confirmation; the correct invoice/ledger status and receipt/processing state reconcile before another attempt.
- [ ] Refresh/back/reopen after success does not create or imply a duplicate charge.
- [ ] ACH processing is not described as settled until webhook/bank settlement confirms it.

## Keyboard, assistive technology, zoom, and responsive evidence

- [ ] Keyboard-only: skip/navigation order is logical; every interactive control is reachable; no trap occurs; Enter/Space work as expected.
- [ ] Screen reader: page title, heading structure, labels, descriptions, alerts, status changes, and link/button names are understandable without visual context.
- [ ] Desktop: test normal width and 200% browser zoom with no horizontal page trap, clipped control, hidden error, or overlapping content.
- [ ] Phone: test portrait at the device's larger-text setting and 200% zoom/reflow where supported; primary controls remain visible and operable.
- [ ] Tablet/kiosk: test intended orientation, on-screen keyboard, focus retention, safe-area spacing, and touch targets.
- [ ] Error, cancellation, loading, disabled, success, and retry states are visually distinct without relying on color alone.

## Final selected-school decision

- [ ] All critical flows passed on every actual launch device.
- [ ] Every failure has one owner and a passing retest or the affected module remains disabled.
- [ ] Director confirms the visible family/invoice/school data is correct for the approved test records.
- [ ] Billing owner confirms test-mode payment, cancellation, retry, receipt, and reconciliation evidence when payments are in scope.
- [ ] Technical owner records `GO` or `NO-GO` for UX/device readiness, with scope, name, and date.

