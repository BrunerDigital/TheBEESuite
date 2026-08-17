# ProCare location import preparation workflow

Use this workflow before any school-scoped ProCare roster, balance, tuition, classroom, or staff import. Preparation is evidence only and never authorizes a production mutation.

## Boundaries

- Preserve the original exports byte-for-byte and record SHA-256 fingerprints.
- Classify reports by headers, not filenames.
- Join families, children, payers, guardians, emergency contacts, and authorized pickups only through stable ProCare Account ID, Person ID, Child ID, Row ID, and relationship fields.
- Do not infer ownership from names, dates of birth, addresses, balances, or classroom proximity.
- Resolve an ambiguous account from relationship evidence only when exactly one candidate payer is a guardian explicitly marked `Lives With`; non-household emergency/pickup contacts do not establish ownership.
- Canonicalize a payer/relationship duplicate Person ID only within the same account when the normalized name plus at least one exact email/phone match and no populated contact conflicts. Retain both original source IDs in the review evidence. All weaker contact collisions stay blocked.
- Flag any guardian or payer Person ID that crosses active Account IDs. The current parent portal requires one family scope per user, so a shared parent across separate families needs an explicit household/privacy decision rather than an automatic family merge.
- Keep roster, balances, weekly tuition, staff identity/access, invitations, PINs, payments, and ProCare cutover as separate gates.
- Use `17-bee-suite-migration-source-of-truth.csv` as the BEE Suite migration template. It joins each enrolled child to one stable source Account ID, one stable Child ID, the account opening balance, and one child-level weekly tuition candidate without counting a sibling family's balance twice.
- Restrict active balance preparation to accounts with at least one currently enrolled child; retain historical accounts in a separate review file.
- Never interpret employee ST/OT payroll rates as child tuition.
- A statement-derived weekly tuition candidate requires the same positive tuition charge at least three times at 5-9 day intervals and exactly one enrolled child on the account. Exclude payments, credits, reversals, late fees, payroll rates, and point-in-time balances. A formal child contract/billing schedule remains the preferred source and the effective week always requires review.

## Prepare a location

```powershell
node --import tsx scripts/prepare-procare-location-workflow.ts `
  --location "Greenwood" `
  --source-dir "D:\Brenden Bruner\Documents\The Bee Suite 2" `
  --output-dir "D:\Brenden Bruner\Documents\The Bee Suite 2\output\procare-preparation\2026-08-06\Greenwood"
```

Run the same command separately for each location. The output includes a reviewed roster file, ready and unresolved references, relationship/classroom reviews, current versus historical balance reviews, a tuition review, held staff review, parent-portal/billing-link review, guardian deduplication review, source manifest, and human-readable readiness report.

## In-app review roles

- Directors open **School migration setup** from their dashboard and follow the six guided steps: Upload reports, Parse and match, Families and children, Balances and tuition, Exceptions, and Confirm package.
- Executives open **Migration data workbook** from their dashboard. The workbook combines authorized schools in one table, supports a school filter, shows current and proposed values beside source evidence, and opens the same focused review drawer for corrections.
- Multi-row decisions are limited to low-risk eligible rows and require an exact selection preview. Billing, identity, custody, access, and other high-risk exceptions remain individual-review only.
- Workbook edits are review evidence. They do not directly change families, children, balances, tuition, access, billing, invitations, or launch state. Operational writes remain bound to the unchanged reviewed import package and the separate gates below.

The Baden Strasse report set is the representative ProCare reference package for this workflow. Its rendered filenames omit the separator used by some structured exports, so the location preparer accepts a full exact location prefix followed by a recognized report name while rejecting nearby location-name prefixes.

## Confirm the BEE Suite migration source of truth

1. Keep `17-bee-suite-migration-source-of-truth.csv` unchanged as the generated baseline. Make a copy in the approved secure review location.
2. Review every enrolled child against the source reports. Confirm the exact Account ID, Child ID, family-child relationship, opening balance in cents, weekly tuition in cents, weekly cadence, and ISO effective week such as `2026-W34`.
3. Enter `confirmed` in the three confirmation columns and `ready` in `Disposition`. Do not repair a generated source field inside the template. Correct the source export or parser input and regenerate the package.
4. Run the read-only confirmation step:

```powershell
npm run procare:confirm-source-of-truth -- --package-dir "APPROVED_PACKAGE_DIRECTORY" --reviewed-template "APPROVED_REVIEWED_COPY.csv"
```

The command fails if a child is not in the guarded roster, an account/child ID changes, siblings disagree on the family balance, a balance or weekly rate differs from its source, a guardian relationship is absent, a weekly effective period is missing, or any row is not explicitly ready. On success it writes:

- `confirmed/confirmation.json` with source hashes, reviewed-template hash, counts, totals, and a deterministic confirmation fingerprint;
- `confirmed/confirmed-roster-import.csv` with the confirmed opening balance carried into each family row in the format expected by the guarded importer;
- `confirmed/confirmed-weekly-tuition-source.csv` for exact post-import source-Child-ID reconciliation before any tuition assignment is activated.

The confirmation step does not import records, activate tuition, create an invoice, charge a payment method, invite a family, create a PIN, or approve cutover. After the roster import, re-query each imported child by the retained source Child ID and reconcile the confirmed tuition artifact to the BEE Suite child ID before seeking separate tuition-activation approval.

Two files define the production-safe current-family boundary:

- `13-active-portal-safe-import.csv` contains enrolled child rows only when the complete account is free of relationship, cross-account, and contact-collision blockers.
- `14-active-portal-safe-balance-review.csv` contains balances only for those reviewed account IDs. A row still stays held if its family was disposed by the application dry run, even when its balance is zero.

## Guarded roster import

Run the application importer against the exact center and `13-active-portal-safe-import.csv`. Require:

- a zero-change production preflight proving the exact center scope;
- a dry run bound to the source SHA-256 and review fingerprint;
- explicit disposal of every application warning;
- resumable chunks of no more than 20 rows;
- a completed batch reconciliation showing no unresolved rows;
- post-write family, child, guardian, classroom, and duplicate-contact checks.

An exception blocks its whole account, not unrelated reviewed accounts. Never split siblings from a blocked account merely to increase the imported row count.

## Balance-only reconciliation

After the roster batch is verified, run the balance tool first without `--apply`:

```powershell
npx tsx -r tsconfig-paths/register scripts/reconcile-reviewed-procare-current-family-balances.ts `
  --center "<exact-center-id>" `
  --center-name "<exact-center-name>" `
  --file "<location-output>\14-active-portal-safe-balance-review.csv" `
  --user-id "<authorized-operator-user-id>"
```

Apply only the unchanged fingerprint with `--apply`, `--confirm-fingerprint`, `--confirm-current-families-only`, and `--confirm-preserve-payments-and-invoices`. Use `--hold-missing-zero-balances` only when the dry run proves every unmatched reviewed account is zero and its roster row was deliberately held.

The balance step creates or updates `BillingAccount` and a source-backed `procare_balance_reconciliation` ledger row. It preserves invoices and payments and never submits a payment. Afterward, verify exact totals, one billing account and reconciliation ledger row per imported family, and zero invoice/payment changes.

## Required stop conditions

- Any enrolled child has a missing or ambiguous account link (hold that entire account).
- Any enrolled child lacks a source-backed guardian relationship.
- Any enrolled family lacks a relationship-backed guardian with both email and phone.
- A guardian/payer Person ID crosses active family accounts, or different Person IDs share a contact without meeting the strict same-account alias rule.
- An active classroom is missing or mapped to `Unknown`.
- A current-family balance account is absent, duplicated, or invalid.
- Weekly tuition lacks child-level amount, cadence, description, and effective-date evidence.
- The reviewed BEE migration template changes any generated source column, omits an enrolled child, repeats an account/child pair, or contains a balance/rate that differs from the source package.
- Child Information Tracking is absent when allergies or other child-detail completeness is required.
- A dry run changes after source SHA-256 or review fingerprint confirmation.

After source exceptions are resolved or explicitly held at the account boundary, run the application importer in dry-run mode against the exact intended center. Production commit, balance reconciliation, tuition activation, staff/access creation, invitations, PINs, payment submission, and cutover each require their own approval. A data-only setup must finish with zero guardian user links, setup tokens, invitation deliveries, messages, and tuition-enabled children.
