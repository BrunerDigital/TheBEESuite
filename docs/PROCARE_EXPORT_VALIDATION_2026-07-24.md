# ProCare Export Validation — July 24, 2026

## Safety boundary

- This validation was local and file-only. It did not connect to the database, create an import batch, modify a family, or activate a school.
- Raw exports and generated import packages contain private family information and are excluded from Git by `.gitignore`.
- ProCare remains authoritative until the applicable school completes preview, reconciliation, signoff, and written cutover approval.
- Payment reports and legacy immunization workbooks are reconciliation evidence only. They are not recreated as BEE Suite payments, charges, or medical records.

## Oakleaf

| Check | Result |
| --- | --- |
| Rendered account children | 58 |
| Registration/relationship records | 66 |
| Import-ready records | 58 |
| Records requiring account resolution | 8 |
| Resolution reason | The child is absent from the supplied account-information report. |
| Structured medical import | Not available from the supplied reports |

Next source action: export an all-accounts Account Information Sheet that includes the eight unresolved children, replace the local source report, regenerate the package, and require zero unresolved account links before previewing a commit.

## Canton

| Check | Result |
| --- | --- |
| Rendered account children | 73 |
| Registration report rows | 208 |
| Import-ready records | 73 |
| Records requiring account resolution | 7 |
| Missing from account-information report | 6 |
| Unique-name fallback caused by missing matching DOB | 1 |
| Legacy immunization workbook | Evidence only; export flat CSV for structured medical review |
| Historical payment report | Evidence only; never recreate as Stripe activity |

Next source action: export an all-accounts Account Information Sheet containing the six missing children and matching DOB data for the remaining child. Re-run preparation and require zero unresolved account links before previewing a commit.

## Reproduction

```powershell
npm run procare:prepare-rendered -- "docs/Oakleaf procare export" "docs/Oakleaf procare import prepared"
npm run procare:prepare-rendered -- "docs/cantonnc procare exports" "outputs/cantonnc-procare-import-prepared"
```

The generated `01-procare-import-ready.csv` retains the source coverage manifest on its first row so the application preview can show the reviewed source inventory. The manifest is intentionally omitted from subsequent rows to avoid duplicating a large evidence payload.

## Acceptance gate before any import commit

1. The source folder represents the correct school and the intended all-accounts scope.
2. The preparation output reports zero records requiring account resolution.
3. The import preview identifies the correct school and shows the source inventory.
4. Family, child, guardian, classroom, pickup, custody, medical, billing-contact, and balance counts are reconciled.
5. Duplicate candidates and every warning are resolved by an authorized reviewer.
6. The exact preview hash and review fingerprint are retained.
7. A backup/import-batch identifier and rollback owner are recorded.
8. Written import authorization is distinct from parent invitations, billing activation, payments, kiosk activation, and ProCare retirement.
