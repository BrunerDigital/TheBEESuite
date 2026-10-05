# Alivia billing investigation — October 5, 2026

## Live account evidence

School: Kid City USA - Holly Hill (`cmp4ew8u4001c6alwq674ue16`). Household: Hernandez (`cms3lja9r00dv6avw6mvqc4n5`), child Caiden Hernandez (`cms3ljb7000e96avwaa2sxii5`). Account: `cmsdj2f0g00oa6aio6c9gzpby`.

The application enrollment status is withdrawn. The school disabled recurring tuition on October 2 at 12:10:16 UTC, reason `enrollment_closed`; the corresponding operations audit exists. The imported enrollment end date remains stale, so it is not reliable withdrawal evidence.

The account balance and signed ledger sum independently reconcile to $240. There are no pending payments. The sole outstanding invoice is `INV-20261001-768141A6` (`cmupk4faa01bkl304k7r8lkki`), generated October 1, covering `2026-W41` (October 5–11). The previous week's invoice is paid; the September 28 payment is preserved.

Alivia reports the final day was October 2 after two weeks' notice and that the $240 is not owed. No saved notice or notice-policy confirmation was established during this investigation. Confirmation was requested from the user. The $240 has not been reversed pending that evidence. Once confirmed erroneous, use the guarded invoice-void workflow: retain the invoice, payment history and original charge, append the invoice reversal and audit; never create a payment to clear it.

## Scoped implementation

- Authorized billing workspaces include historical families and their withdrawn children. Parent access scope and current receivables scope remain separate.
- Recurring billing rechecks and locks the child inside invoice creation, preventing a stale preflight candidate from billing after withdrawal/disablement.
- Parent and director online payments accept explicit advance intent with a positive, custom amount, including a zero household balance. Ordinary payment limits, school readiness, identity/grant checks and autopay consent remain in force.
- Success reduces the account once; excess becomes negative household balance (credit). Future fully covered invoices receive a zero-dollar credit allocation marker. Partial coverage remains in the net balance and existing credit-first allocation. Director checkout uses the net balance when credit exists; invoice checkout rejects a full charge in that situation.
- Refund reconciliation locks payment/account, uses a cumulative high-water mark, validates invoice ownership, handles payments with no invoice and reopens credit-settled future invoices when refunded credit restores debt. Duplicate and older notifications do not add another refund.

## Verification boundaries

Focused tests cover withdrawn-family selection and isolation, invoice reversal safeguards, explicit zero-balance advance validation, successful payment deduplication, full/partial credit, duplicate/out-of-order refunds and consumed-credit refunds. The production gate includes the complete suite and Next build.

No payment was initiated, no message sent, and no identity, grant, consent, provider connection or rollout was changed. Production browser authentication was unavailable in the existing browser session; public health, live database evidence and deployed-source checks are distinct from authenticated UI verification.
