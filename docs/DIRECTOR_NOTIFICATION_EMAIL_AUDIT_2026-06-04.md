# Director Notification Email Audit - 2026-06-04

## Scope

- Project: Supabase project `nqjrlktoewiueiwrubas`
- Source: read-only Supabase Management API SQL query against the live database
- Checked at: `2026-06-04T20:58:48.228037-04:00`
- Included locations: active Kid City USA school centers with CRM location IDs in `ST | City` format
- Excluded locations: demo, unassigned, closed, and non-school placeholder records

## Result

- Active schools audited: `94`
- Ready for inquiry notification routing: `94`
- Missing notification recipients: `0`
- Centers with valid primary notification email syntax: `94`
- Centers with active director/assistant/billing fallback mapping: `94`

## Routing Rule Confirmed

The live inquiry intake route sends location notifications to the center email first when `Center.email` is a valid email address. If the center email is missing or invalid, it falls back to active Kid City USA users assigned to the location with one of these roles:

- `CENTER_DIRECTOR`
- `ASSISTANT_DIRECTOR`
- `BILLING_ADMIN`

The audit result confirms every active school currently has both a syntactically valid center notification email and at least one active fallback recipient available through director, assistant director, or billing admin mappings.

## Notes

- This check confirms routing readiness and email syntax, not human ownership of every mailbox.
- One live address is valid but should be visually confirmed by operations because it appears intentionally stored as-is in the CRM data: `globalleadershibacademy@kidcityusa.com` for `FL | Global Leadership Academy`.
- The repeatable audit command is:

```bash
npm run kidcity:audit-director-notifications -- --rows
```

Run the command before final rollout whenever `DATABASE_URL` points at the live database.
