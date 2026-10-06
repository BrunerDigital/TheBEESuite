# iOS keyboard verification

The existing unsigned iOS verification still checks both production SDK products,
privacy/scene configuration, HTTPS routing, and cold/repeated public login launches.
It then tests a disposable copy of the simulator app with XCUITest. The copy loads
real parent/teacher portal components through the development-only synthetic preview.

The keyboard test enters a synthetic draft, requires the iOS software keyboard,
checks focused-field geometry, retains the draft across a device rotation, verifies
the existing native portrait lock, dismisses the keyboard, and checks that the
form action remains reachable. It never taps Send or Save. XCTest screenshots and
results are retained alongside build evidence in GitHub Actions artifacts.

The loopback proxy allows only preview/assets GET requests. It blocks API routes,
real workspaces and all writes. Startup rejects local dotenv files, and the preview
child receives only a minimal environment with an unusable local fixture database.
No account passwords or production credentials are passed to the workflow.

Run through the `iOS native verification` workflow on a reviewed branch, or run
`node scripts/verify-ios-native.mjs parent` / `teacher` on a clean macOS checkout
with Xcode 26, Node 24 and XcodeGen. The verifier creates and deletes only its own
simulator. The UI harness project and modified app copy live under ignored output.

This establishes simulator keyboard evidence with synthetic portal data. It does
not claim a physical-device test, store submission, or authenticated simulator test.
