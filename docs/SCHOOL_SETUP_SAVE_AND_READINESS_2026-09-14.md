# School setup saves and readiness reporting

School setup fields previously remained editable while their save request was pending. A later successful response replaced local state with the submitted values, potentially discarding typing made during that request. The business-profile/setup controls and data-starting-point controls now use disabled fieldsets while their respective saves are pending. The custom source selector also receives its pending state directly. Failed saves retain the draft and re-enable controls; no automatic retry is introduced.

The read-only pilot report previously summarized only infrastructure/data warning checks. It could print `READY WITH WARNINGS` and exit successfully while the selected schools' module gates were blocked. The summary now incorporates only the selected modules, counts blocked schools/modules and approval-required modules, and fails closed when no schools were evaluated. Setup-only checks are not blocked by unselected invitation gates. An otherwise passing selected billing/kiosk/invitation gate reports `MANUAL APPROVAL REQUIRED`, never automatic launch approval.

CLI exit contract: blocked or approval-required results exit 1. Ordinary warnings exit 0 unless `--fail-on-warn` is set. Per-school gates and infrastructure failure/warning counts remain available separately. This does not disable existing school operations or modify any saved rollout state.

## Validation

- `node --import tsx --test tests/pilot-readiness-report.test.ts`: report aggregation, mixed-school results, selected-module isolation, empty selections, separate approvals and warning strictness.
- `node --import tsx scripts/qa-school-setup-save.ts`: real React components, synthetic local props, held successful/rejected save responses, disabled pending edits, retained drafts and one request without retries. Set `QA_BROWSER_ENGINE=webkit` for WebKit. Every API request is intercepted; off-origin requests are denied. This is functional browser evidence, not authenticated management production evidence.
- The baseline browser run reproduced the editable-pending-data-save failure before the fix.
- The read-only live readiness rerun correctly reported blocked selected gates with zero detected child/classroom cross-school mismatches. Detailed school, family, financial and contact evidence stays in ignored local output, outside Git.

Release evidence is recorded after protected merge and canonical deployment verification. This change does not alter identities, grants, financial records, invitations, messages, providers, source imports or school activation.
