# iOS 27 launch recovery — September 29, 2026

## Observed state before changes

Source baseline: GitHub main `f31a1944490f759ab8eec37a172a80e32e36f05d`. Its canonical Vercel deployment is Ready and the reserved Parent and Teacher production HTTP checks passed. Those checks do not establish native launch compatibility.

Both App Store Connect candidates are version 1.0 (4). On the connected iPhone 17 Pro Max running public iOS 27.0.1 (24A446), Teacher was updated with TestFlight's Update button. TestFlight displayed Open for Parent and Teacher build 4. Opening Parent from TestFlight immediately terminated the application.

The scoped Parent crash report identifies the beta-distributed bundle `com.brunerdigital.thebeesuite.parent`, version 1.0, build 4, with `EXC_BREAKPOINT` / `SIGTRAP`. The first faulting-thread symbol is `___UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption_block_invoke`. Raw diagnostics and device identifiers remain private local evidence.

Both native projects use the legacy application lifecycle and omit `UIApplicationSceneManifest`. The installed Capacitor core, iOS and CLI versions are 8.4.1. Both projects therefore need scene adoption before new review candidates are uploaded. Teacher has the same configuration; its launch failure is inferred from source, not a separately observed Teacher crash.

Device inventory flags such as `builtByDeveloper` and `containerAccessible` also remained true after the observed TestFlight update. They do not independently prove distribution provenance. Accept the actual TestFlight selection and the scoped crash report's beta-distribution marker instead.

The prior release worktree's Git metadata points into iCloud Documents and Git status stopped responding. Current recovery uses an independent clean clone under `~/Developer/TheBEESuite-ios-scene-20260929`; existing checkouts and their work are preserved.

## Recovery and remaining evidence

Adopt a single-window scene lifecycle in both apps, preserve Capacitor URL and user-activity forwarding, update the three Capacitor platform packages together, and prepare version 1.0 (5). Verify the compiled scene configuration, signing, role-specific HTTPS and privacy resources. Then verify launch, relaunch, foreground transitions and authenticated workflows on the physical iPhone using the replacement TestFlight candidates.

Build 4 must not be resubmitted. No replacement upload, physical authenticated workflow, final screenshots, walkthrough recording, App Review reply or approval is claimed.

## Implemented and verified recovery

Both native targets now declare a single-window scene using their existing Main storyboard and register `SceneDelegate.swift` in the Sources build phase. The delegate forwards connection options, URL contexts and user activities through Capacitor's official `SceneDelegateProxy`. Core, iOS and CLI packages are aligned at 8.5.2; both CLI-generated Swift packages resolve exactly 8.5.2. Both native build numbers are 5. Role identity, iPhone-only support, iOS 16 minimum, HTTPS origin, permissions and reviewed privacy inventories remain aligned.

The store readiness audit checks source scene configuration and URL forwarding. The native compiler verification checks the expanded scene manifest in each compiled bundle. Regression tests reject the absent lifecycle that caused this crash, unresolved delegates, missing bridge storyboards and extra windows.

- Focused native/privacy/readiness tests: 33 passed, no failures or skips.
- Full `npm run vercel-build`: lint, typecheck, 2,550 tests and production build passed; no test failures or skips.
- Both Release device bundles compiled with Xcode 27 / iOS SDK 27 and passed strict signature, expanded scene, HTTPS, identity and privacy checks (Parent 17 categories; Teacher 14).
- Both locally development-signed build-5 apps were installed on the connected physical iPhone running public iOS 27.0.1. Correct role-specific native sign-in screens were observed on initial launch, background return and cold relaunch. Explicit termination and new process IDs distinguish the cold relaunch checks. These checks do not establish final TestFlight provenance or authenticated workflow completion.
- Production dependency audit: zero vulnerabilities. The full development audit reports the Capacitor CLI's transitive `uuid` buffer-bounds advisory through `xcode`; that project utility calls `uuid.v4()` rather than the advisory's affected v3/v5/v6 buffer paths. This development dependency is absent from production dependencies.

Xcode's public framework download initially waited on a GitHub keychain lookup. The supported `-packageAuthorizationProvider netrc` option, with no netrc credentials, resolved the official package downloads while preserving package verification. Existing signing identities/profiles were used; no new certificate, access grant or provider identity was created.

Private local evidence: `output/audit/ios-scene-20260929/`. The public launch captures are development evidence, not App Store screenshots. Signed App Store archives, Xcode validation, final TestFlight installation and authenticated physical recordings remain release gates.

Primary references: [Apple scene lifecycle migration](https://developer.apple.com/documentation/uikit/transitioning-to-the-uikit-scene-based-life-cycle), [Capacitor scene delegate template](https://github.com/ionic-team/capacitor/blob/main/ios-pods-template/App/App/SceneDelegate.swift).
