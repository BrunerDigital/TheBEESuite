# Teacher profile flow safety — September 12, 2026

## Verified baseline before changes

The isolated release worktree is clean at parent-flow candidate `ec7b3559` (PR #357), with a full passing production gate and fake-data browser checks. This follow-up branch is `work/teacher-profile-flow-safety-20260912`; it must reconcile the protected parent merge before release. Unrelated primary-checkout edits and all real identities, roles, PINs, grants, schools, and provider state remain untouched.

Current source evidence:

- Teacher profile save accepts any HTTP success as confirmed and clears the new kiosk-code field even for a missing or mismatched receipt.
- Profile edits are absent from the existing unsaved classroom-draft guard. Readiness badges are derived from unsaved text, and the classroom choice can imply assignment clearing although null retains the saved assignment.
- The API reads school/profile scope before its transaction, then rewrites `User.role`, `isActive`, and `organizationId` while updating the name. A concurrent access change could be overwritten. The audit is outside the transaction.
- Kiosk-code normalization truncates before validation, allowing an oversized submitted code to become a different four-digit code.

## Implemented correction

The existing teacher profile and classroom assignment contract is preserved. Fresh actor, tenant, school, profile, and classroom checks run inside a serializable transaction. Only the name and profile fields are updated, with compare-and-set guards against concurrent changes; role, activity, organization, access grants, and historical records are not rewritten. Unrelated custom fields are retained from the fresh profile, and the audit and optional PIN hash commit atomically. A missing profile may be created only with fresh exact-school teacher authority; existing legitimate profile-based access does not acquire a new grant requirement. Oversized and non-string PINs are rejected instead of silently becoming a different code.

The UI retains all entries on unconfirmed outcomes, validates the exact profile receipt, guards unsaved profile changes, locks pending controls, and distinguishes saved readiness from edited fields. Assigned classrooms are visibly director-managed; retained archived assignments remain readable. Only a matching confirmed receipt updates the saved baseline and clears the PIN field. No production profile or PIN save is part of verification.

## Verification and limits

- Focused API module mocks prove fresh authorization and scope, active dated grants for creation, concurrent profile/access changes, compare-and-set conflicts, preserved unrelated fields, exact receipts, and atomic audit/PIN rollback. Unit tests cover whole-input PIN validation and every receipt/draft field.
- Independent current-source review found no release blocker. A bounded security diff review reported zero findings; it is not a whole-product security certification.
- Full WebKit real-component recovery harness passed with 23 intercepted fake writes and zero client exceptions at 15:01:53 UTC. A separate stable-panel check confirmed editable fields unlock after a valid receipt while the saved classroom stays director-managed. Evidence: `output/playwright/ui-flow-recovery-webkit/`. The fake harness avatar is not served as an image; the actual public asset exists, so its placeholder is not a demonstrated production defect.
- The first build attempt caught an executable QA artifact under the linted output directory. It was moved, with its hash verified, to the external task evidence directory; lint rules were unchanged. A later typecheck exposed an overly narrow callback inference in the held-response test; a checked release helper corrected the harness without weakening types.
- The exact final-source production gate passed Prisma generation, lint, TypeScript, all 2,014 tests, and the optimized Next build. Final Chromium and WebKit recovery runs both passed with 23 intercepted fake writes and zero client exceptions. Both static native readiness checks passed. Protected release and post-deployment verification are the remaining steps for this wave.
- PR #358 preview caught a test-isolation dependency on the non-production PIN hashing fallback. The subprocess test now explicitly uses production mode with a fake test-only key, never a deployment credential. The production secret requirement is unchanged. Validation is rerunning on this isolated-test correction before merge.
- Production editable profile saves require a non-reserved approved synthetic teacher session. General QA credentials remain invalid; the working shared App Review teacher intentionally cannot change its profile or PIN. Production checks will therefore verify that read-only state and navigation, not claim an editable save occurred.
- Signing, archive, authenticated-native, physical-device, and TestFlight checks are not performed by this web wave. The previous parent release is merged as `b9478b66` and production verified; its exact evidence is in `UI_UX_PARENT_DOCUMENT_FLOW_2026-09-12.md`.
