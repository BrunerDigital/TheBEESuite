# Combined isolated recovery verification

September 28, 2026. Source application commit: `76fa2604688feb46c6a3281e7fc7a8a06962b7b0`. This record verifies a bounded recovery exercise; it does not approve school activation or production failover.

## Scope and isolation

The approved encrypted logical snapshot from production (`nqjrlktoewiueiwrubas`) was temporarily restored into the separate Recovery Lab (`hptrlvbciwkceqifjnbt`). The exercise used a local application listening only on `127.0.0.1:3108`, fresh application signing secrets, and the lab's Auth and Storage endpoints. It had no production web alias.

Exactly nine designated synthetic accounts were enabled. The other 2,158 restored Auth accounts were blocked and their corresponding application users disabled. Snapshot sessions and refresh tokens were excluded; application session versions advanced, device sessions were revoked, guardian PIN hashes were cleared, and payment-method links expired. The one provider-credential row was excluded; integrations and push subscriptions were disabled. Browser database privileges remained revoked. No production records, identities, grants, billing, messages, provider settings or rollout state were changed.

The local application's outbound guard allowed only loopback, the exact lab database host and bounded lab Auth/private Storage operations. Separate guard probes rejected Stripe and SendGrid requests before transmission. The successful application run recorded no blocked outbound attempts and allowed no production providers.

## Verified results

| Check | Result |
| --- | --- |
| Application data and schema | 104 tables, including the source Prisma migration ledger; 449,880 rows loaded with the provider-credential row excluded; all intended source row counts matched, foreign keys validated and indexes valid |
| Durable Auth | 2,167 users and 2,167 identities restored; zero source MFA factors; durable row-content hashes had already matched in the component rehearsal |
| Combined role/session isolation | All nine enabled accounts signed in successfully; each received HTTP 403 for both Kokomo and Centennial; each signed out and received HTTP 401 when its application cookie was replayed |
| Financial, ledger and audit history | All original rows preserved across 21 tables, including `BillingAccount`, `LedgerEntry`, invoices, payments, tuition, agency/subsidy records and refund requests; only additive Auth exercise audit rows were allowed |
| Private files | All 632 snapshot objects and 780,477,675 bytes restored, downloaded and matched by SHA-256 and size; anonymous access denied and signed access verified |
| Application media path | An eligible synthetic parent's own-family history API returned HTTP 200 and signed a lab-only synthetic media fixture; the downloaded body matched its original SHA-256 |
| Parent media layout | At 1440px and 390px, the fixture was visible, decoded successfully and produced no horizontal overflow; screenshots reviewed |
| Exercise fixtures | The synthetic media database row and its exact uploaded path were removed |

The role checks establish negative access to Kokomo and Centennial from the isolated demo accounts. They do not establish either school's positive staff/guardian access or business readiness. The canonical production desktop/mobile role baseline remains separate evidence. A broader lab browser run was interrupted after overlapping logout checks invalidated its sessions; it is not counted as a completed eighteen-case lab run.

## Recovery point and operational limits

The database export ran from 14:25:19.744 to 14:26:26.084 UTC. Its matched Storage manifest contains the 632 objects in that snapshot. Two later uploads remain outside this recovery point. The authenticated encrypted database archive is 45,618,555 bytes with SHA-256 `b30330f307035f4fadc99f97f80d0f32f28bf1f69b4edecb2e34b1b32ac53d05`.

The successful combined database apply began about 18:08:34 UTC, committed at 18:11:55.862 UTC, and Storage verification completed at 18:14:36.498 UTC. Parent media verification finished at 18:26:24.897 UTC: approximately 17 minutes 51 seconds from that combined apply start, including test corrections and credential refresh. This is observed exercise timing, not a guaranteed production incident RTO. Export, infrastructure preparation, independent vault recovery and real incident reconciliation are not included.

Storage API recreation regenerated all 632 object IDs and timestamps. Paths and file bytes matched; exact Storage metadata equivalence was not achieved. Real incident recovery must review metadata-dependent behavior, post-snapshot writes, identity/credential changes, payments and outbound work before reopening any production module.

Managed CLI database credentials expire after five minutes. The exercise stopped its local server before refreshing them to avoid reconnecting with an expired or rotated password. These administrative credentials must not become a deployed application's permanent connection credential.

Archive/key custody remains local and encrypted, with the key protected by the Windows owner's DPAPI context. A company-controlled independent vault, independently recoverable key custody, scheduled backups, retention, verified failure alerts, a second human responder and lost-device recovery remain open. No new vault billing, irreversible retention policy or human owner was invented.

## Closeout

At 18:32:05.434 UTC, native verified-TLS checks confirmed the original schema fingerprint `1c2de06ebd820d64b23a0a3dca586854`, all 103 original application tables empty, and zero Auth users, identities, sessions, refresh tokens, audit entries, Storage buckets and objects. An independent Supabase query also confirmed zero browser-role table grants and empty identity/session/Storage state. The local server was stopped. Cleanup removed exactly the 632 restored object paths, their two buckets and the synthetic fixture; it retained the encrypted source archives and original lab migration history.

The original lab's `FteReport.updatedAt` default and twenty-one-table index differences remain as they were before the exercise. They were absent from the temporary source-schema restore but intentionally returned when the original empty lab was reinstated. The cleanup fingerprint verifier was corrected to use the same newline separator and fully qualified privilege checks as its baseline; independent verification matched.

Private evidence is retained outside Git: combined data/storage load reports, nine role/session results, twenty-one-table integrity results, media readback/layout results, outbound audit, exact cleanup reports and synthetic screenshots. Customer rows, file bodies, passwords, API keys, session cookies and encryption keys are excluded from this document and the repository.
