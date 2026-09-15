# Security completion checkpoint — September 15, 2026

## Scope of this change

- Application login now requires a provider-verified authenticator code for users with verified Supabase TOTP factors. Password verification alone cannot create a BEE Suite session for those accounts. A backup enrolled authenticator can be selected. Provider errors, unsupported verified factor types, wrong-factor IDs and lower authentication assurance fail closed.
- Each attempt uses a temporary server-side provider session, released with local-scope sign-out. Provider tokens are not returned to the browser. Existing application-session, school-scope and password-recovery boundaries remain in place.
- Storage restore now previews by default, requires the exact target project, rejects the source and known production project, checks all selected buckets for collisions before writing, and requires a fingerprint from the reviewed preview to apply. Uploads remain non-overwriting and downloaded bytes are checked after upload.

## Current external state

A read-only production query on September 15 found zero rows in `auth.mfa_factors`. The Supabase branch inventory contained only the production `main` branch. This change does not enroll users, enable mandatory role policies, create staging, change school access, or perform a live restore.

## Validation

- Provider-adapter tests exercise unenrolled login, pending versus verified enrollment, backup factor selection, malformed codes, wrong-user factors, verification failure, identity mismatch, missing AAL2, and provider failure.
- Executable login-route tests prove challenge/failure responses create no application cookie, device session or audit record; active fully verified accounts still receive a session, and missing/inactive application identities remain denied.
- Executable Storage CLI tests use a simulated provider to prove preview makes no writes, an unapproved fingerprint makes no writes, and an approved apply uploads and downloads for verification. No real Storage service is contacted.
- Desktop and mobile login fixtures exercise challenge focus, backup selection, failed-code retry, retained credentials, and successful navigation. Expected HTTP 401 challenge responses are distinguished from JavaScript errors.
- Final protected build and deployment evidence is recorded with the release PR; this document is not a production-release assertion by itself.

## Remaining gates

1. Build and validate self-service authenticator enrollment and recovery, then approve exact privileged roles, enrollment timing, recovery ownership and existing-session revocation before enforcement. This release supplies the login challenge, not the full MFA rollout. Existing sessions are not retroactively certified as MFA-authenticated.
2. Create an approved isolated staging project with outbound communication, billing and cron effects disabled. Verify separate credentials and exercise complete database plus Storage recovery there.
3. Select and provision an encrypted off-platform backup destination, scheduling runner, retention and failure notifications; verify the destination copy and complete a restore rehearsal. A local verified archive does not establish an operational backup schedule.
4. Obtain school/source-record confirmation, financial exception evidence, monitoring/support acknowledgment and physical-device/Apple release results listed in the current completion checkpoint.

Provider behavior follows [Supabase TOTP MFA](https://supabase.com/docs/guides/auth/auth-mfa/totp) and [challengeAndVerify](https://supabase.com/docs/reference/javascript/auth-mfa-challengeandverify). Supabase does not supply recovery codes through this API; multiple enrolled factors are supported. Do not claim a recovery-code feature or treat a password reset as MFA recovery.
