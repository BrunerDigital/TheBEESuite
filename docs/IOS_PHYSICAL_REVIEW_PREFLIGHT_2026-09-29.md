# iOS physical-review preflight — September 29, 2026

The paired physical iPhone 17 Pro Max connected successfully over USB. It initially reports iOS 27.0; Apple lists 27.0.1, released September 28, as the current public version. The final requested recordings must be made after that update. A device-passcode prompt requires the owner to enter the passcode directly on the iPhone; no passcode is collected or stored by the agent.

TestFlight 4.4.0 is installed. The initial BEE app inventory contains Parent 1.0 (4) and Teacher 1.0 (2), both exposing developer-container access. Xcode documents that container access requires an Xcode-installed profile-validated app; these are not accepted as proof that the final TestFlight candidates are installed. Both roles must be installed from their selected build-4 TestFlight records before device acceptance.

Read-only review-scope checks confirmed both reserved identities are active, do not require password resets, have valid review markers, and have exactly one matching demo-center grant. The checked Parent family and Teacher classroom joins contain zero children lacking the synthetic markers. This narrow preflight does not replace the existing fail-closed runtime graph validation or final device workflows.

## Moderation notification isolation

Preflight found four possible school-leadership notification recipients for the demo center, only one with synthetic staff markers. The message-report route had no review-identity suppression, so submitting a demo report could have notified three non-demo operational inboxes. No demo report was submitted during the discovery; no notifications or access grants were changed.

Reserved Parent/Teacher review reports now skip leadership-recipient resolution. The existing moderation flag, audit record, preserved message, idempotence, origin guard and visibility checks remain. Ordinary school reports still notify their resolved leaders. This keeps the demo reporting control usable without generating operational review work for real school users.

Validation must include reserved identity/normalization cases, ordinary school-recipient behavior, missing-school behavior, and the full release gate. Production deployment and a synthetic report check remain required before claiming the fix is live.

## Capture status

Xcode 27 provides direct physical-device screenshot and H.264 screen-record commands. The capture plan and sanitized initial receipt are prepared in ignored `output/audit/physical-device-review-20260929/`. No final recording, current-candidate device workflow pass, screenshot replacement or Apple resubmission is claimed by this preflight.

Continue with the [review recording protocol](IOS_APP_REVIEW_RECOVERY_2026-09-28.md), verify the exact TestFlight versions and iOS 27.0.1 after the owner completes the update, and record only the approved synthetic workflows.

Sources: [Apple software release status](https://support.apple.com/en-us/100100), local `xcrun devicectl help device info apps`, and the [stack reconciliation checkpoint](MAC_IOS_STACK_RECONCILIATION_2026-09-28.md).
