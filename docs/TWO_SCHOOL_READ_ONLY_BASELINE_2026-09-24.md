# Two-school read-only readiness baseline

Captured September 24, 2026, about 13:27 UTC, from read-only aggregate queries against the production Supabase project. The scope is exactly Kid City USA - Kokomo and Miss Honey's Learning Center - Centennial. This is a comparison for future role testing, not a school launch or access approval. No records, accounts, grants, invitations, or provider settings were changed.

| Current aggregate | Kokomo | Centennial |
| --- | ---: | ---: |
| Families / children | 34 / 53 | 121 / 143 |
| Guardians / guardians linked to an application user | 62 / 54 | 221 / 114 |
| Classrooms | 12 | 7 |
| Children with enrollment status `active` or `enrolled` | 40 | 56 |
| Those children missing a classroom | 0 | 0 |
| Active staff profiles | 12 | 14 |
| Active staff profiles without a normalized-email Supabase Auth match | 0 | 14 |
| Authorized-pickup records / linked application users | 83 / 0 | 286 / 0 |
| Current center-scoped access grants | 18 | 15 |
| ProCare import batches recorded for the school | 0 | 3 |

The staff comparison joins active `StaffProfile` and Prisma `User` records, then checks for a case-insensitive trimmed email match in `auth.users`. It does not prove that a matched person can sign in, that the Auth identity is correctly linked, or that a grant has the right school and role. All 14 Centennial unmatched users have the `TEACHER` application role and a current center grant; they require school and owner classification before creating Auth identities or changing access. An unlinked authorized-pickup record is not automatically a defect; determine which people are meant to have their own account. No Kokomo ProCare batch in this table does not establish that its source data is absent or complete.

Keep both schools **HOLD for access GO** until an approved synthetic role test proves sign-in, family and school isolation, and direct-route denial. Review staff, guardian, and authorized-pickup accounts and active sessions against the school's authoritative roster. Record separate decisions for setup, invitations, kiosk/PIN, billing, payments/payouts, communications, and ProCare retirement under the [school transition SOP](sops/SCHOOL_TRANSITION_SETUP_AND_CUTOVER_SOP.md). Do not create real accounts or send invitations from these aggregate counts.

These counts are a point-in-time query, not full source coverage or director signoff. Family/child relationships, safety and pickup authority, tuition and balances, import exceptions, provider delivery, and physical-device behavior still need exact-school evidence before activation. See the [current completion status](CURRENT_COMPLETION_STATUS.md).
