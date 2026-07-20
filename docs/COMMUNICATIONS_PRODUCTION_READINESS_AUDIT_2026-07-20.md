# Communications Production Readiness Audit

Audit date: July 20, 2026  
Accountable human: Brenden until explicitly delegated  
Scope: transactional email and SMS, with priority on parent invitations and payment communications  
Safety boundary: repository audit and tests only; no live communications, provider configuration, production-data mutation, deployment, billing enablement, or credential changes

## Production-ready definition

Communications are production-ready for a selected school only when its sender and reply path, domain authentication, recipient rules, consent and opt-out handling, templates and tokenized links, provider delivery outcomes, bounce and suppression handling, retry owner, and scheduled-job owner are verified with approved test recipients. SendGrid queue acceptance must not be represented as final delivery.

## Evidence completed

- Invitation and payment-method request emails use one-recipient personalizations, remove duplicates, include plain text, disable click/open/subscription tracking for tokenized transactional links, and carry center/family identifiers as provider metadata.
- Parent invitations authorize the acting user against the guardian's center and tenant before linking the account or sending.
- Payment-method requests select explicit family recipients and use a 14-day token/short-link expiry. The school email is used as reply-to when it is valid.
- Notification delivery filters recipients through user/role preferences; SMS additionally requires opt-in. Twilio status and inbound consent routes already record status and STOP/START behavior.
- Failed provider submissions are recorded for bounded retry; `/api/cron/integration-retries` is scheduled daily and requires `CRON_SECRET`.
- SendGrid submission acceptance is now stored as `accepted`, not `delivered`. A signed batched Event Webhook endpoint reconciles processed, deferred, delivered, bounce, dropped, and spam-report events.
- The readiness endpoint now warns when the SendGrid Event Webhook verification key is absent.

## Findings

### BLOCKER

- Wider-wave delivery evidence is absent. Configure and validate the signed SendGrid Event Webhook, then prove accepted-to-delivered and accepted-to-failed transitions. Owner: Brenden.
- Sender-domain authentication and branded reply routing have not been externally evidenced per selected school (SPF, DKIM, DMARC, sender identity, and monitored reply inbox). Owner: Brenden.
- Bounce, block, spam-report, invalid-address, and unsubscribe suppressions have not been reviewed in SendGrid, and no approved exception/removal policy is recorded. Owner: Brenden.
- Broad invitation and payment communication recipients cannot be approved until the actual wave, guardian contacts, billing responsibility, custody restrictions, connected payment readiness, director signoff, and support coverage are complete. Owner: Brenden.

### REQUIRED BEFORE WAVE

- Configure SendGrid to post signed events to `/api/sendgrid/events` and set `SENDGRID_EVENT_WEBHOOK_VERIFICATION_KEY`. Subscribe to processed, deferred, delivered, bounce, dropped, and spam-report events. Owner: Brenden.
- Run invitation and payment-method request tests with approved test guardians at every selected school; verify recipient, reply handling, token expiry, mobile landing, delivery event, retry/follow-up display, and no tracking-host rewrite. Owner: Brenden.
- Name one operational owner who reviews failed/accepted-stale deliveries and suppressions, with response target and escalation path. Owner: Brenden.
- Confirm whether each email category is strictly transactional or marketing. Marketing/campaign email requires approved unsubscribe/preference handling; transactional security/payment notices must not be silently disabled by a broad marketing opt-out. Owner: Brenden.
- Verify scheduled tuition reminder and dunning copy, cadence, recipient selection, duplicate protection, cron execution, and school opt-in before enabling each school. Owner: Brenden.
- Verify payment receipts and failed-payment notices end to end; the audit found payment setup/reminder paths but did not establish a complete receipt/failure-email evidence trail for every payment method. Owner: Brenden.

### FOLLOW-UP

- Add provider-event deduplication storage keyed by `sg_event_id` if event-driven side effects extend beyond idempotent status updates. Owner: Brenden.
- Add school-facing delivery health reporting for accepted-stale, deferred, bounced/dropped, suppressed, and needs-follow-up counts. Owner: Brenden.
- Decide whether platform fallback credentials may send for a tenant whose own SendGrid key is rejected; document sender-brand and incident ownership. Owner: Brenden.

## External decisions required

- The selected first-wave schools, dates, and live modules.
- Approved sender identity, reply inbox, and support owner for each school.
- SendGrid domain-authentication, link-branding, signed-webhook, and suppression evidence.
- Transactional-versus-marketing classification and legal approval of consent/unsubscribe language.
- Named delivery/suppression/retry operator and response targets.

## Current decision

The wider wave remains **NO-GO** until this workstream and all shared signoffs pass. Kokomo may continue normal production use; this audit does not authorize new messaging, billing, or a deployment.
