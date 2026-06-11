# Kid City USA Cutover Owner Checklist

These are the items that require the business owner, account admin, ProCare user, payment account owner, or DNS/email account owner. Engineering can continue everything else in the repo, Supabase, Vercel, and app code.

## Critical Before Live Operations

- [ ] Provide unencrypted ProCare CSV export files from ProCare.
- [ ] Export/confirm these ProCare datasets for at least Longmont first: family accounts, children, guardians/payers, relationships, authorized pickups, emergency contacts, classroom roster, staff, attendance/sign-in/out, balances/ledger, tuition contracts, schedules, immunization/medical/allergy fields, and FTE.
- [ ] Confirm the exact Kid City USA open-location list and mark any closed locations that should remain archived only.
- [ ] Confirm each location's official school email, director email, phone, address, CRM location ID, and location ID.
- [ ] Have each director verify their center dashboard after import: children, classrooms, families, teachers, balances, and kiosk route.
- [ ] Decide whether existing parent PINs should be imported from ProCare if available, or reset manually by directors in The BEE Suite.
- [ ] Tell directors not to use the lobby kiosk for live sign-in/out until their center data has been imported and verified.

## Security And Access

- [ ] Rotate any production secrets that were shared in chat or plain text, including database, Supabase, email, SMS, payment, and API credentials.
- [ ] Store final secrets only in Vercel/Supabase/Stripe/Twilio/SendGrid dashboards or a password manager.
- [ ] Confirm which Kid City USA corporate users should have executive access.
- [ ] Confirm which users can add/remove locations, reset passwords, import ProCare files, edit FTE reports, and manage billing.
- [ ] Require real passwords for live school users after initial login; shared passwords should be treated as temporary cutover credentials.

## Payments And Billing

- [ ] Create/verify the Stripe platform account as the legal/business owner.
- [ ] Enable Stripe Connect for school payout accounts.
- [ ] Decide the software pricing model for Kid City USA and future public customers.
- [ ] Decide the BEE Suite payment operations fee and any approved parent-paid processing recovery structure for tuition payments.
- [ ] Provide written legal/accounting approval of `docs/PAYMENT_PROCESSING_RECOVERY_REVIEW.md` before enabling parent-paid processing recovery.
- [ ] Confirm whether schools or corporate will absorb failed-payment, ACH, card, dispute, and refund fees.
- [ ] Provide official billing terms, refund language, privacy policy, and payment authorization text.
- [ ] Have each school complete payout onboarding before parent payments are enabled.

## Email, SMS, And Google Sheets

- [ ] Verify email sending domains and DNS records for The BEE Suite and/or Kid City USA notification sending.
- [ ] Confirm notification recipients for global inquiries and each school location.
- [ ] Confirm Twilio messaging sender/phone number usage and SMS consent language before real SMS.
- [ ] Share final Google Sheet backup URLs and confirm Apps Script web app permissions remain set to receive submissions.
- [ ] Confirm FTE Google Sheet format or approve The BEE Suite as the source of truth with Sheet backup only.

## Public Website And Inquiry Forms

- [ ] Replace old Kid City USA website forms with the latest BEE Suite inquiry embed code.
- [ ] Test one inquiry per location group/state after installing the form.
- [ ] Confirm each test lead appears in The BEE Suite, the backup Google Sheet, global notification emails, and the correct location email.
- [ ] Remove or archive any old CRM forms/webhooks after The BEE Suite routing is confirmed.

## Final Go/No-Go

- [ ] Approve imported Longmont data after spot-checking records against ProCare.
- [ ] Repeat import/verification for remaining open locations.
- [ ] Confirm executives can see all locations, FTE reports, inquiries, dashboards, and import tools.
- [ ] Confirm directors can create/edit leads, families, children, classrooms, teachers, FTE reports, and billing records.
- [ ] Confirm parent payment and parent portal launch date separately from CRM/operations launch.
