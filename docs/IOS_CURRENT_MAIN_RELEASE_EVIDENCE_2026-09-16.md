# Current-main iOS release evidence — 2026-09-16

This record supersedes older native evidence for the current source revision only. It covers signed archive creation, App Store Connect validation, and physical-device launch evidence for the Parent and Teacher apps. It does not represent an upload, TestFlight distribution, App Review submission, or public release.

## Source and toolchain

- Source base: `b16cb892ee04fe08718c9d51ced13086ddf3eb50` (`origin/main` at worktree creation)
- Worktree: `/Users/brunerdigital/Developer/TheBEESuite-v1-finish-current-20260916`
- Branch: `work/v1-finish-current-20260916`
- Xcode: 27.0 (`27A266a`)
- SDK: iPhoneOS 27.0
- Apple Developer team: `BMYUFLTU52` (Brendan Bruner)
- Device: Brenden’s iPhone 17 Pro Max, iOS 26.7, Developer Mode enabled and paired

The project build number was advanced from the current-main value `1` to `4`, the next unambiguous build after the previously recorded build 3 evidence. Both apps remain version `1.0`.

## Signed upload-ready archives

Both archives were created from this worktree with `Distribution` / `Apple Distribution` signing and passed `codesign --verify --deep --strict --verbose=2`.

| App | Bundle ID | Version/build | Archive | Distribution profile | IPA SHA-256 |
| --- | --- | --- | --- | --- | --- |
| Parent | `com.brunerdigital.thebeesuite.parent` | `1.0 (4)` | `output/audit/ios-build-current-20260916/parent/BEE-Suite-Parent-1.0-4-current.xcarchive` | `BEE Suite Parent App Store 20260912` (`c406a9c9-1b6c-4231-900c-2f157a2286e5`) | `c1031dc1263437d3c245a3a0588d186aad56c8aa09dfc01fcd1778e0d72b3de4` |
| Teacher | `com.brunerdigital.thebeesuite.teacher` | `1.0 (4)` | `output/audit/ios-build-current-20260916/teacher/BEE-Suite-Teacher-1.0-4-current.xcarchive` | `BEE Suite Teacher App Store 20260912` (`9ed593a4-3dcd-46cd-b77a-6ac07c3c03af`) | `3a0623c3c0c9ecb4ec2f43d6bdee6be5ec5c5caf365ab051c55afec1adce2f6d` |

Archive app bundle checks passed for both bundle identifiers, version `1.0`, build `4`, team `BMYUFLTU52`, and the Apple Distribution signing identity.

## Apple validation

- Parent `1.0 (4)`: Xcode Organizer validation succeeded at `2026-09-16 20:01:51` local time.
- Teacher `1.0 (4)`: Xcode Organizer validation succeeded at `2026-09-16 20:03:26` local time.
- The validation pipeline used the authenticated Xcode Apple account and completed without an upload step.
- No archive was uploaded to App Store Connect. No TestFlight build was distributed. No App Review or public release was submitted.

## Physical-device evidence

The upload-ready distribution IPAs intentionally cannot be installed directly on this development-registered device because their embedded App Store profiles are App Store/Beta profiles. For device verification, current-main Debug builds were compiled from the same source with the registered device development profiles:

- Parent development identity: `Apple Development: Brendan Bruner (Y37S7R6647)`
- Parent development profile: `iOS Team Provisioning Profile: com.brunerdigital.thebeesuite.parent` (`1f310b26-6899-457b-9875-d0011293dbf1`)
- Teacher development profile: `iOS Team Provisioning Profile: com.brunerdigital.thebeesuite.teacher` (`38c5d4a3-139d-43b5-b6f5-1a4650df05be`)
- Parent Debug build: compiled successfully, installed, launched, and captured at [`output/audit/ios-device-current-20260916/parent-build4-device.png`](../output/audit/ios-device-current-20260916/parent-build4-device.png)
- Teacher Debug build: compiled successfully, installed, launched, and captured at [`output/audit/ios-device-current-20260916/teacher-build4-device.png`](../output/audit/ios-device-current-20260916/teacher-build4-device.png)

Observed surfaces:

- Parent: authenticated home surface showing the enrolled family/school context and child attendance cards.
- Teacher: role-specific Teacher sign-in surface with username/email, password, recovery, and sign-in controls.

These screenshots prove current-source physical installation and launch. They do not certify the account provenance, complete authenticated Teacher flow, cross-school isolation, recovery, revoked-session rejection, or the full camera/upload/offline/accessibility matrix. Those require approved synthetic accounts and a controlled test session.

## Remaining native release gate

The artifacts are signed and Apple-validated and are ready for a separately authorized App Store Connect action. The next consequential action must be named explicitly: upload for processing, TestFlight distribution, App Review submission, or public release. None of those actions was performed in this record.
