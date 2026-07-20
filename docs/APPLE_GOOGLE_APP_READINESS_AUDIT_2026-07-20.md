# Apple and Google App Production Readiness Audit

Audit date: July 20, 2026  
Accountable human: Brenden until explicitly delegated  
Scope: store metadata, privacy disclosures, builds/signing, deep links, push, and native-device workflows.

## Decision

The parent iOS app is **not ready for App Store submission**. The repository contains a coherent unsigned Capacitor iOS target and a usable metadata draft, but required legal, signing, TestFlight, screenshot, review-account, archive-privacy-report, and real-device evidence remains open.

There is **no native Android application or Google Play submission packet** in the repository. Android access is currently the installable web/PWA experience. Google Play submission is therefore not ready and must not be implied in product or rollout communications.

These app findings do not change the shared rollout decision: the wider school wave remains **NO-GO** until every shared signoff passes. Kokomo may continue normal production use.

## Production-ready definition

Apple is production-ready when the final legal/privacy text and App Privacy answers are approved; the bundle ID and Apple team are confirmed; a signed archive is accepted by App Store Connect; the final privacy report matches disclosures; screenshots and review metadata are complete; the fake-data reviewer account works; and parent login, account deletion, camera/photo upload, messaging, documents, billing view, auth expiry, offline recovery, and accessibility pass on the release TestFlight build on a supported iPhone.

Google is production-ready only after Brenden chooses a Play Store release rather than PWA-only distribution; a native Android target/package and Play Console app exist; signing and Play App Signing ownership are recorded; store listing, Data safety, content rating, privacy policy, and public web deletion resource are approved; the release AAB passes Play checks; and the equivalent workflows pass on representative Android devices. App Links and FCM are required only if they are included in the approved v1 scope; otherwise they must remain disabled and unadvertised.

## Evidence completed

- The Capacitor and Xcode bundle identifier is `com.brunerdigital.thebeesuite.parent`.
- The Xcode target is version `1.0`, build `1`, minimum iOS 16.0, and iPhone-only.
- The native server configuration uses `https://thebeesuite.io`, starts at `/parents`, disallows cleartext, and supplies a local offline page.
- Camera and photo-library purpose strings exist. The unused Face ID declaration is absent.
- `ITSAppUsesNonExemptEncryption` is set to false for the documented standard-encryption exemption position; App Store Connect still needs the owner's final answer.
- The app privacy manifest is present in the Xcode project resources, declares no tracking, and lists conservative collection categories.
- No APNs entitlement/provider implementation or associated-domains entitlement/AASA file was found. Native push and universal links are therefore correctly treated as unavailable for v1, not as completed features.
- No Android project, Android package identifier, release AAB, signing configuration, Play metadata packet, Data safety worksheet, `assetlinks.json`, or FCM implementation was found.
- The authenticated parent portal contains an account-deletion request workflow. The public privacy/support pages describe how signed-in parents reach it, but there is no standalone public web deletion-request resource suitable for a future Google Play listing.
- The iOS metadata packet and App Store Connect draft agree on app identity after aligning the version to `1.0` and removing stale Face ID guidance.

## Findings and owners

### BLOCKER

| Finding | Owner | Closure evidence |
| --- | --- | --- |
| Final Privacy Policy, Terms, EULA, retention/deletion language, payment disclosures, and child-data position are not owner/counsel-approved. | Brenden | Written approval and final public URLs checked from a signed build. |
| Apple signing ownership is incomplete: no Team ID is recorded and no signed macOS/Xcode archive or App Store Connect upload exists. | Brenden | Team selected, distribution signing succeeds, archive upload is accepted. |
| No TestFlight release-candidate device run exists. | Brenden | Dated pass on a supported physical iPhone covering the production-ready workflows above. |
| Final App Privacy answers and Xcode archive privacy report have not been reconciled against production vendors and SDKs. | Brenden | Approved inventory, archive report, and matching App Store Connect answers. |
| Final App Store screenshots, age rating, availability, support/review metadata, and working fake-data review credentials are not evidenced for the release build. | Brenden | App Store Connect checklist/export plus successful reviewer-account smoke. |
| Google Play release is not buildable: there is no Android native target, package decision, AAB, signing setup, Play Console record, or store packet. | Brenden | Explicit Android release decision followed by an accepted internal-test AAB and completed Play listing. |
| A future Google Play app with account creation needs a public web account-deletion request resource in addition to the in-app path; none is implemented. | Brenden | Public URL entered in Play Console and an end-to-end deletion request test. |

### REQUIRED BEFORE WAVE

| Finding | Owner | Closure evidence |
| --- | --- | --- |
| Store-distributed parent workflows have not passed accessibility, auth-expiry, poor-network/offline, upload, messaging, documents, and billing-view tests on target devices. | Brenden | Device matrix with build number, OS/device, result, defect links, and retest. |
| Native crash evidence and alert ownership are not established. | Brenden | TestFlight/App Store Connect crash workflow or approved native monitoring decision with named alert recipient. |
| Product/help copy must consistently describe Android as PWA/browser install and must not promise native push or deep links. | Brenden | Copy audit attached to release evidence. |

### FOLLOW-UP

| Finding | Owner | Closure evidence |
| --- | --- | --- |
| Decide whether universal/App Links are worth adding for invitation and password-reset URLs. | Brenden | Written scope decision; if enabled, signed-domain files and device tests. |
| Decide whether APNs/FCM push belongs in a later release. | Brenden | Written scope decision; if enabled, consent, token lifecycle, privacy, delivery, and opt-out tests. |
| Consider native-value features only after v1 evidence is complete; a thin WebView remains an App Review risk. | Brenden | Product decision and updated review notes/device evidence. |

## External decisions required

1. Brenden chooses Apple-first only versus authorizing a native Google Play workstream now.
2. Brenden confirms the Apple Developer legal entity, Team ID, bundle registration, and who may hold signing access.
3. Brenden obtains legal approval for the final public policies and store disclosures.
4. Brenden decides whether v1 explicitly excludes native push and universal/deep links. The current safe default is excluded and unadvertised.
5. Brenden names the person who will execute and sign the physical-device/TestFlight matrix; ownership remains Brenden until delegated.

## Exact next action

On a Mac signed into the intended Apple Developer team, Brenden should clone the final approved commit, run `npm ci` and `npm run ios:parent:sync`, select the team in Xcode, archive version `1.0` build `1`, upload it to TestFlight, export/review the archive privacy report, and record the first physical-iPhone smoke result. Do not submit for App Review until every Apple BLOCKER above is closed.

## Repository-safe continuation completed

- Added `npm run mobile:store:check` to validate the Capacitor/Xcode identity, HTTPS/offline configuration, release version, permissions, privacy manifest/resource inclusion, deferred entitlements, and no-alpha icon/splash dimensions without requiring macOS or store access.
- Expanded `tests/mobile-store-readiness.test.ts` to execute that audit and guard the v1 in-app-only notification wording/provider behavior.
- Corrected user-facing “push/in-app” labels and the integration response so database alerts are accurately described as in-app notifications; native delivery now reports `configured: false` and `deliveryMode: "in_app_only"` instead of inferring readiness from an unused environment variable.
- Added `PARENT_ANDROID_BUILD_RUNBOOK.md` without generating an Android target or signing material.
- Expanded `PARENT_IOS_BUILD_RUNBOOK.md` with exact archive validation, upload, privacy-report reconciliation, TestFlight, and physical-device evidence steps.
- Added `MOBILE_APP_PHYSICAL_DEVICE_EVIDENCE_PACKET.md` with the exact first-device smoke order and stop conditions.
- Added only platform choice, store/account ownership, signing values, capability decisions, store declarations, and device signoff to `BRENDENS_TASKS.md`.

The remaining classifications are unchanged: signing/store/privacy/device items are **BLOCKER**; target-device workflow proof and any approved link/push implementation are **REQUIRED BEFORE WAVE**; later role-specific native apps and optional native enhancements are **FOLLOW-UP**.
