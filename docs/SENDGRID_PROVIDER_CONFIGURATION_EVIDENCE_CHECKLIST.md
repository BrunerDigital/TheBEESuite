# SendGrid Provider Configuration and Evidence Checklist

Use this checklist without sending to real families. Configuration requires separate authorization and provider access. Evidence must omit API keys, DNS secrets, recipient PII, message bodies, and full provider message IDs.

## 1. Sender authentication

- [ ] Record the exact From domain and authorized sending subdomain for the platform and each tenant-specific sender.
- [ ] In SendGrid Sender Authentication, capture a redacted screenshot showing domain authentication is validated.
- [ ] Verify every SendGrid-provided DKIM CNAME resolves publicly and record the resolver output, date/time, and reviewer.
- [ ] Verify SPF authorizes SendGrid without creating more than one SPF TXT record; record the resolved policy and reviewer.
- [ ] Verify DMARC exists on `_dmarc.<domain>`, aligns with the visible From domain, has an approved reporting mailbox, and follows the approved progression from monitoring to enforcement. Record policy, alignment, aggregate-report owner, date/time, and reviewer.
- [ ] If click tracking is ever enabled, verify branded-link CNAME validation. Tokenized invitation and payment links remain tracking-disabled regardless.

## 2. Sender and reply inboxes

- [ ] Record the exact From address/name for platform and school-branded transactional mail.
- [ ] For every school, record the monitored reply-to address, primary owner, backup owner, coverage window, and response target.
- [ ] Send only to an approved internal/test inbox and prove Reply reaches the named monitored inbox without exposing the test address in retained screenshots.
- [ ] Confirm no-reply addresses are not used where the message tells a family to contact the school.

## 3. Suppressions and classifications

- [ ] Review and record counts—not recipient addresses—for hard bounces, blocks, spam reports, invalid emails, global unsubscribes, and applicable ASM group suppressions.
- [ ] Name the suppression-review owner, backup, review cadence, escalation target, and evidence location.
- [ ] Approve a written rule that hard-bounce and spam-report suppressions are never removed merely to force delivery; every removal requires verified correction, business reason, approver, and audit evidence.
- [ ] Confirm address allowlists do not include public mailbox domains and do not bypass complaint suppressions.
- [ ] Classify every email purpose as transactional, operational, or marketing. Record counsel/product approval for required consent, preference-center, unsubscribe, and physical-address language.
- [ ] Keep security, invitation, payment setup, receipt, and failed-payment notices separate from marketing ASM groups unless counsel explicitly approves otherwise.

## 4. Signed Event Webhook

- [ ] Apply the `SendGridEventReceipt` migration in an authorized release before enabling the webhook.
- [ ] Set `SENDGRID_EVENT_WEBHOOK_VERIFICATION_KEY` in the authorized environment; retain only evidence that it is present, never its value.
- [ ] Configure `POST https://thebeesuite.io/api/sendgrid/events` with Signed Event Webhook enabled.
- [ ] Subscribe to processed, deferred, delivered, bounce, dropped, and spam-report events.
- [ ] Record a provider screenshot showing endpoint, enabled signature verification, subscribed events, and successful provider test response, with identifiers redacted.
- [ ] Prove an unsigned/tampered request receives `403` and creates no receipt or delivery update.
- [ ] Prove replaying the same signed batch leaves one `SendGridEventReceipt` per `sg_event_id` and does not repeat updates or side effects.

## 5. Accepted-to-final evidence

- [ ] With one approved non-family test recipient, trigger one invitation-path test and record the initial `accepted` state.
- [ ] Record the signed delivered event, final `delivered` state, delivery timestamp, correct recipient role/school, correct reply route, valid landing page, and absence of tracking-host rewriting.
- [ ] With a controlled invalid test address approved for deliverability testing, record `accepted` followed by bounce or drop, the final failed classification, and appearance in bounced/suppressed and needs-follow-up reporting.
- [ ] Verify accepted messages older than 24 hours appear as accepted-stale; deferred events appear separately and do not imply final delivery.
- [ ] Confirm no provider-supplied reason, response, recipient email, signature, or full event/message ID appears in operational logs or the delivery-health UI.
- [ ] Attach date/time, environment, release identifier, school/test tenant, tester, reviewer, and redacted evidence links for every proof.

## 6. Tenant credential fallback

The safest default is fail closed. `SENDGRID_ALLOW_PLATFORM_FALLBACK` remains `false` unless Brenden explicitly approves shared platform sending for a tenant after sender-domain alignment, visible branding, reply routing, suppression scope, legal classification, and incident ownership are documented. A rejected tenant key must otherwise surface as a failed delivery for operator follow-up.

## Completion record

| School/tenant | Sender auth reviewer | Reply owner | Suppression owner | Webhook evidence | Delivered proof | Failed proof | Legal classification approval | Final reviewer/date |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
