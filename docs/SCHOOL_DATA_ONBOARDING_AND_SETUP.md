# School Data Onboarding and Setup

This is the operating guide for bringing a school into The BEE Suite. It covers both established schools moving records from another system and new schools starting with an empty workspace.

## What The BEE Suite prepares

The setup team can prepare the organization, every school profile, approved business contact information, branding, school-specific inquiry forms, setup checklists, configuration placeholders, source mapping, import review, technical verification, forms, templates, and integration handoffs from authorized business information.

The school only needs to supply or confirm facts that cannot be safely inferred:

- Family, guardian, child, custody, medical, allergy, emergency-contact, pickup, and schedule facts.
- The disposition of a source exception that cannot be proven from stable source evidence.
- Payout-bank details entered only on the provider-hosted page.
- The exact recipients and timing for invitations or messages.
- Final billing, payment, kiosk/PIN, launch, and prior-system retirement decisions.

Do not put family data, child data, credentials, bank information, or verification codes in setup notes or ordinary email.

## Already-created Kid City locations

An existing Kid City location does not submit the public workspace intake and must not be recreated. An authorized setup-team member, owner, or director selects the existing location once with the global workspace switcher and opens **School Setup**. Every save remains scoped to that selected school.

The shortest setup path is:

1. BEE prepares the school profile, standard configuration, templates, forms, source mapping, and technical checks available from authorized business information.
2. The school reviews the prefilled business profile, corrects only what changed, and selects **Save & confirm school profile**. This creates a versioned confirmation receipt; a later profile edit makes the confirmation visibly stale until it is reconfirmed.
3. BEE and the school choose the correct data path for that location. Existing operating schools use the guarded import and verification flow. A genuinely new location can explicitly choose a clean start without fake records.
4. The setup page routes the first unfinished area and shows the remaining inputs. Evidence-backed items complete automatically; notes cannot substitute for required records.
5. The owner supplies the small set of protected facts or approvals BEE cannot provide: payout-bank entry on Stripe, source truth for family/child records or unresolved exceptions, exact invitation/message recipients, and activation approval.
6. BEE runs the role-by-role verification. Launch, invitations, billing, payments, messaging, and prior-system retirement remain separate approvals.

The setup page must always identify itself as an existing school workspace. Saving its business profile cannot change the school identifier, create another location, grant access, send invitations, activate payments, or enter payout-bank details.

## Workspace intake

The public onboarding flow saves a resumable business-information draft on the current device. Launch notes are intentionally excluded from that browser draft. For multiple locations, paste one complete row per school using spreadsheet tabs, pipes, or commas:

`Name | Address | City | State | ZIP | Phone | Email | Licensed Capacity | Data Path | Source System`

`Data Path` (`import_existing` or `start_clean`) and `Source System` (`procare` or `other`) can override the organization-level default for a location.

The submitted row count must exactly equal the requested school count. The workspace creator makes each school profile, applies its own address/contact/capacity values, creates a school-scoped inquiry-form integration record, and records which business fields were prepared. Placeholder locations are not created for a multi-location intake.

The owner account receives owner-group access across its schools. This does not invite staff or families, enable parent engagement, activate payments, or complete payout onboarding.

Inside School Setup, an authorized setup-team member, owner, or director can correct the selected school's structured name, address, city, state/region, postal code, phone, email, timezone, and licensed capacity. Saving a draft refreshes the prepared values while **Save & confirm school profile** binds the confirmation to that exact profile revision. It does not change location identifiers, access, invitations, payment activation, or payout-bank details.

## Choose one data starting point per school

### Move existing records

1. Select `ProCare export package` for a complete ProCare report set, or `Another system / mapped flat file` for one CSV, TSV, spreadsheet, or pasted table.
2. Upload the unchanged school-scoped source. A preview hashes the source, maps columns, detects duplicates, and proposes changes without writing records.
3. Confirm the detected source inventory and required correlations. Stable source IDs establish identity; names alone never establish household ownership or financial responsibility.
4. Commit the exact reviewed source. A changed file, mapping, adapter, duplicate mode, or warning set invalidates the review fingerprint.
5. Resolve every held row by correction or an evidenced exclusion. The retained batch and rows remain recoverable source evidence.
6. The app automatically runs the latest whole-school verification once a completed batch has zero unresolved rows and the required fingerprints.
7. Review current and prospective families, guardians, children, relationships, emergency contacts, pickups, safety records, schedules, classrooms, staff, tuition evidence, opening balances, and ledger results.
8. Record the school-scoped confirmation. The confirmation stores domain fingerprints and a downloadable source-evidence receipt.

### Start with a clean workspace

1. Finish the business profile, classrooms, capacities, ratios, programs, operating calendar, and staff setup.
2. Add real family records as enrollment begins. Do not create placeholder people.
3. The readiness check includes current and prospective families and blocks on missing guardians, reachable guardian contacts, emergency contacts, current-child schedules, and required current-child classroom assignments.
4. If no families are expected yet, explicitly confirm the intentional empty state.
5. Review and confirm the exact school starting point.

A clean-start school does not need fake people, placeholder invoices, guardian login accounts, family documents, or an FTE report to complete setup. The applicable policy and configuration can be reviewed before those records exist. Invitations, live billing, and other activation gates remain separate.

## Readiness behavior

- A section is complete only when its required record evidence is complete. Typed notes without the required records remain `in progress` and continue blocking launch readiness.
- Director checklist progress is stored per school. Completing a task for one location cannot complete it for another location.
- Automatic checklist completion accepts explicit readiness evidence, not the mere existence of one classroom, document, invoice, guardian login, event, message, or lead.
- Integration readiness uses only tenant-wide integrations and integrations assigned to the selected school; another location cannot satisfy the selected school.
- After an active school confirms its launch data, the approved baseline is frozen. Later normal operations do not erase the approval. The app reports which domains changed while preserving the original source receipt.
- A newly committed replacement import is not normal operations. It invalidates the prior import baseline and requires a new whole-school verification and director confirmation.
- Families without children and children with missing or unrecognized enrollment states remain blocking, including on an otherwise empty clean-start workspace.
- `Request Setup Help` sends the setup team a rate-limited, school-scoped internal alert with a reference and evidence fingerprint. It omits family and child details.

## Independent activation gates

Technical setup does not activate any of the following. Each requires its own explicit approval and post-check:

- Staff or family invitations and external messages.
- Parent portal access and custody-sensitive visibility.
- Kiosk, QR, or PIN credentials.
- Tuition billing, invoices, autopay, card or ACH charges, refunds, and ledger changes.
- Stripe payout onboarding and payout-bank verification.
- Provider configuration or publishing.
- Prior-system cutover, archival, or retirement.

Once an imported school is fully verified and separately approved for cutover, retain the original source and review packet as a recoverable backup. Do not delete it or leave it as an active import input.

## Completion evidence

Before marking a school ready, retain:

- Exact school identity and authorized scope.
- Saved business-information preparation receipt.
- Chosen data path and source adapter.
- Source hash, review fingerprint, row totals, and evidenced exclusions for imports.
- Whole-school verification status with zero blockers.
- Director confirmation, time, actor, domain fingerprints, and source backup link.
- School-specific readiness sections and checklist evidence.
- Separate signoffs for invitations, billing, payments/payouts, kiosk/PIN, launch, and prior-system retirement when those gates enter scope.
