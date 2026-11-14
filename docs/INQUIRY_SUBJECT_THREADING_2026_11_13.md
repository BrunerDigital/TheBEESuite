# Separate unrelated inquiry notifications

## Scope

Two separate production inquiries for one school were grouped into one Gmail conversation. Their Message-IDs were distinct, with no reply/reference headers, but their subjects were identical. Separate CRM records and queued deliveries remained intact.

This candidate appends the existing opaque lead ID to the notification subject. It does not add parent/child information, change recipients, alter message bodies, create new delivery records, replay notifications, or modify routing.

Retries for the same lead retain the same reference. Missing or unsafe identifiers retain the previous subject. Existing Gmail threads are not modified. Future mailbox behavior still requires observation after release.

## Verification

- Based on main commit 05746fe37117940246eed1c268f10ae3d62a125b.
- 32 focused inquiry and SendGrid audit tests passed.
- Added distinct-reference, stable-retry, missing/unsafe-reference regressions.
- Updated existing presentation expectations without weakening metadata/routing assertions.
- No live messages or production writes.

Full release gate must pass on the final commit before deployment.
