# Executive Admin Workflow

The Executive / Franchise Admin page is the self-service control area for corporate users such as the Kid City USA executive team. It is available at `/agency-admin` for users with executive access.

## What Corporate Users Can Do

- Create a new location profile with CRM/location ID, routing email, phone, address, city, state, postal code, owner group, capacity, and status.
- Edit existing location profiles without losing address, phone, or postal-code data.
- Archive locations that are no longer open while preserving CRM, billing, FTE, inquiry, and audit history.
- Reactivate archived, paused, or setup locations.
- Create owner-group containers for corporate networks, franchisees, multi-location operators, or single-location owners.
- Create or update users with role, title, center assignment, owner-group assignment, and access scope.
- Set a temporary password or send a Supabase Auth reset/setup email.
- Deactivate or reactivate tenant users by email.

## Access Model

The page requires a user who can manage operations and view all centers for the tenant. Read-only auditors cannot perform mutations.

Access scopes:

- `TENANT`: all locations under the tenant; limited to executive/brand admin, regional manager, or auditor roles.
- `OWNER_GROUP`: locations attached to a specific franchisee or owner group.
- `CENTER`: one location.

## Location Removal

Locations are not hard-deleted from the UI. The `Archive Location` action sets the center status to `closed` and writes an audit event. This keeps historical CRM leads, inquiries, FTE reports, billing setup, and operational records intact.

## Password Handling

Temporary passwords are sent directly to Supabase Auth admin APIs and are not stored in The Bee Suite database. Reset emails use the configured Supabase recovery flow.

## Audit Trail

The following executive actions create audit-log records:

- Location created or updated
- Location archived or reactivated
- Owner group created
- User created or updated
- Password set or reset email sent
- User deactivated or reactivated

## Operational Notes

- Keep CRM/location IDs unique for live locations. The API rejects duplicate live IDs on both create and update.
- Use the location routing email for lead notifications.
- Archive locations that close instead of deleting them.
- Use owner groups before adding multi-location franchise or operator users.
