# Current version finish line

The release boundary is the existing BEE Suite web product and Parent/Teacher iOS apps. Android, native push, universal links and new expansion modules remain outside this pass unless explicitly added by the product owner. A live web release does not establish school activation or Apple approval.

## Work and acceptance

| Workstream | Concrete acceptance | Current evidence / next action |
| --- | --- | --- |
| Existing web product | Required role workflows, responsive UI, isolation and full build pass on the released commit | September 15 prior release evidence covers nine designated roles. Recheck changed flows on the final source. |
| Account security | Self-service primary/backup authenticator setup, protected removal, fresh login after changes, session-aware required-role policy | Implementation in this pass; provider enrollment/recovery rehearsal and approved role rollout remain required. |
| Recovery | Encrypted off-platform DB/Storage backups, verified destination copy, retained restore keys, monitored schedule and isolated full restore | Storage exporter and guarded restore already exist. Destination, staging environment and owner acceptance are outstanding. |
| School readiness | Source-backed owner confirmations for every school included in this version's rollout | Private 69-school worklist exists; missing entries cannot be invented or counted as confirmed. Product completion and school activation are separate. |
| Financial/access exceptions | Review source evidence, approve exact corrections, verify current ledger and access results | Three private exceptions remain; no repair has been applied. |
| Operations | Named responders, delivery/reply evidence, payroll/report reconciliation, physical-device/kiosk verification | Requires selected school, school representative, devices and safe test recipient details. |
| iOS | Signed source-matched Parent/Teacher archives, authenticated device evidence, TestFlight and approved pilot/public release | Unsigned native verification exists. App Store Connect sign-in and signed/device evidence remain outstanding. |

## Account security behavior

`/account/security` is available from the account menu. Each operation rechecks the current password through an isolated provider session; adding or removing a factor on an enrolled account also requires a fresh code from an existing authenticator. A pending setup does not enforce MFA. Existing factors and target ownership are obtained from the provider rather than trusted client input.

Before verifying a new factor or removing one, a database transaction compares the current application session version, increments it and records a seed-free audit attempt. Only then can the provider change run. All previous BEE sessions become invalid, including the current browser. Failure or uncertainty after invalidation also requires fresh login. Concurrent login snapshots cannot acquire a new session version using an older password-only check.

Keep at least one verified authenticator. A separately enrolled backup can be selected at login and used to replace a lost primary device. Users who lose every factor need identity-verified administrator recovery; email or password reset alone does not remove MFA. The installed Supabase SDK does not expose recovery-code methods, so this release uses backup authenticators rather than claiming recovery-code support.

`BEE_MFA_REQUIRED_ROLES` is an explicit comma-separated list of Prisma role names. It defaults to empty until an approved rollout. When configured, a required-role session without signed MFA assurance can reach its own security setup but cannot obtain the ordinary `getCurrentUser` authorization used by workspace APIs. Workspace and password-change session renewals preserve the original assurance. Changing roles does not bypass the current role's policy. Invalid configured role names fail closed.

Recommended rollout roles to review: `PLATFORM_OWNER,BRAND_ADMIN,REGIONAL_MANAGER,CENTER_DIRECTOR,ASSISTANT_DIRECTOR,BILLING_ADMIN,READ_ONLY_AUDITOR`.

## Human assistance needed

1. Confirm current version scope and MFA role policy.
2. Sign in to Apple directly; identify the approved pilot school and a physical-device tester.
3. Choose the staging organization and approve its quoted provider cost before creation.
4. Identify the company-controlled backup vault and primary/backup alert owners. Keep secrets in secure provider configuration, never chat or source control.
5. Supply school-owner source confirmations and evidence for the private financial exceptions.

Record real acceptance and dated evidence against these gates. Do not replace unknowns with a successful build, a healthy endpoint or an inferred approval.
