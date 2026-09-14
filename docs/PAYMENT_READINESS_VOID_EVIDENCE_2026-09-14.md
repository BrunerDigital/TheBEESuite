# Payment readiness: fully voided tuition evidence

The read-only parent payment audit previously treated cancelled tuition charges as unsupported evidence for an imported opening balance, even when the complete invoice ledger proved those charges had been fully reversed.

The audit now excludes positive tuition charges only when the linked invoice is VOID and its complete ledger contains recognized tuition charges and any negative tuition credits plus exactly one matching manual invoice-void entry, all in the same billing account and invoice, without payment links, and totaling exactly zero. Partial reversals, extra adjustments, duplicate IDs, manual debits, and mismatched scope remain reviewable. Ledger balance mismatch checks remain unchanged.

Validation: focused behavioral regressions cover full, discounted, partial and over-reversed tuition, plus scope and history failures. The full `npm run vercel-build` gate is required before merge. A read-only production rerun removed one false-positive review while preserving the remaining manual-debit review and all parent-access and balance-mismatch counts. Private family evidence is retained only in ignored local artifacts.

This change does not write billing records, void invoices, adjust balances, grant access, or send invitations.
