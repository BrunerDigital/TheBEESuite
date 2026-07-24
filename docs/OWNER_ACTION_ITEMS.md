# Owner Action Items

Last updated: June 9, 2026

These are the items BrunerDigital cannot safely complete without business approval, third-party account access, legal review, or real production data from Kid City USA and future customers.

## Decisions And Approvals

- Approve the final public website copy before broad SaaS launch.
- Approve real testimonials, quotes, logos, and in-school photos before they appear publicly.
- Confirm whether marketing launch will use Google Analytics, Meta Pixel, Google Ads, or another conversion tracking stack.
- Decide the MFA policy for executive/admin users.
- Confirm the weekly FTE cutoff day, cutoff time, and escalation contacts with Kid City USA operations.
- Approve the final parent registration packet fields after the Kid City USA registration form is provided.
- Approve parent portal launch timing and communication templates.

## Data And Files To Provide

- Active ProCare exports from each live Kid City USA location.
- Final Kid City USA registration form and policy acknowledgement documents.
- Current location list with open/closed status, official location IDs, director emails, and notification emails.
- Teacher/staff rosters per active location.
- Classroom names, capacities, age ranges, and ratio expectations per active location.
- Current tuition plans, fees, discounts, subsidy rules, ledger balances, and invoice rules.
- Existing FTE report history if it should be imported beyond the new weekly workflow.

## Vendor And Account Access

- Stripe account owner approval for Connect platform settings, webhook endpoint, payout responsibilities, and fee disclosures.
- Stripe connected account onboarding for each school or payout owner before live parent payments.
- Google Sheet sharing/service access for production backup sheets.
- SendGrid/Mailgun sender domain authentication and DNS records.
- Twilio messaging compliance setup if SMS becomes live.
- Domain/DNS access for any future white-label customer domains.

## Legal, Privacy, And Compliance

- Internal product/security/privacy review is complete in `docs/LEGAL_PRIVACY_SECURITY_REVIEW_2026-06-09.md`; the remaining items below require owner, counsel, accounting, vendor, or production-project approval.
- Written legal/accounting approval of `docs/PAYMENT_PROCESSING_RECOVERY_REVIEW.md` for card payment processing recovery, refund, chargeback, dispute, debit/prepaid, ACH/instant-bank treatment, and disclosure language. Parent instructions must use the exact total shown before submission rather than promise that every bank payment is always fee-free.
- Privacy review for child, guardian, custody, medical, billing, and photo/media data handling.
- State-specific childcare licensing review before claiming any state-specific workflow support.
- Approval of data retention, deletion, backup, and incident response policies.
- Approval of school/parent terms, privacy policy, consent language, and photo/media release language.

## Live Rollout Coordination

- Pick the pilot order for schools switching from ProCare to The BEE Suite.
- Confirm one director/admin owner per location for cutover.
- Schedule cutover windows and fallback procedures.
- Have each school validate imported families, children, classrooms, balances, and staff before using operational modules live.
- Run the production smoke test checklist after each major deployment and before every new school rollout.
