# Recovery and operations proposal for review

Prepared September 28, 2026. Brenden has not chosen a backup human owner, off-platform vault or alert destination. No provider resources, costs or retention locks have been activated by this proposal.

## Recommended configuration

- Use a company-controlled AWS account and a private S3 bucket for encrypted off-platform database and private-Storage archives. Keep it separate from production hosting credentials. Enable versioning; review Object Lock governance mode for the initial retention policy. Restrict the runner from deleting versions or bypassing retention. A separately controlled recovery role may retrieve archives; it must not be the runner's credential.
- Proposed retention is 35 daily archives plus 12 month-end archives, subject to the company's legal retention/deletion policy. Do not enable compliance-mode retention until its permanence and legal implications are approved. [AWS Object Lock](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock.html) documents versioning and retention behavior.
- Encrypt archives before transfer and encrypt stored objects. Store the archive recovery key separately from production and runner credentials; document key recovery and prevent deletion of required encryption keys. Object retention does not recover a lost encryption key; see [AWS considerations](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock-managing.html).
- Use a restricted runner with a reviewed logical database export and the existing Storage recovery tooling. Publish success only after database/Storage manifest verification, matching snapshot evidence and encrypted upload verification. Reject partial backups. Do not stream customer data into GitHub Actions logs or repository artifacts.
- Initially alert Brenden through an approved private email destination, plus the named backup human. Add a monitored incident channel if the company has one. Test alert delivery, acknowledgement and escalation before calling coverage operational. A destination is still required; no emails will be sent from this proposal.
- Run an isolated restore drill before relying on this system, then propose quarterly drills and drills after substantial recovery changes. Measure restore time and data-loss window. Use the [recovery runbook](SUPABASE_DATABASE_STORAGE_RECOVERY_RUNBOOK.md), including trigger-safe loading, durable Auth restoration, transient-token exclusion, provider quarantine, financial/session reconciliation, private-file hashes and denied cross-school access.

## Approval fields

| Field | Current value |
| --- | --- |
| Primary owner | Brenden |
| Backup human owner and recovery contact | Unassigned; must be a real authorized person |
| Company AWS account/region or approved alternative vault | Unassigned |
| Retention/deletion policy | Proposed 35 daily / 12 month-end; approval pending |
| Archive key custody and secret-manager owners | Unassigned |
| Restricted runner host and outbound/network policy | Unassigned |
| Alert recipients and acknowledgement/escalation coverage | Unassigned |
| Current secure DB export path | Blocked by local credential access |
| Rehearsal target authority and schema reconciliation | Existing Recovery Lab documented; current authority and equivalence must be rechecked |
| Cost ceiling | Approval required; no subscription or usage purchase made |

Brenden may select this proposal or a company-approved equivalent. The exact account, human owner, alert recipients and retention/cost approval must be supplied before provisioning. The operating contract requires separate provider authorization; the user already authorized preparing and validating this plan. Do not ask for passwords, backup encryption keys or verification codes in chat.
