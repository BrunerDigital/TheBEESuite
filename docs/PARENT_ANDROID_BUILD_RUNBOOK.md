# Parent Android Build and Google Play Internal-Test Runbook

Status: Prepared only. **Do not execute until Brenden authorizes a native Android release and approves the application ID.** No Android target, signing key, Play Console app, or Firebase project is currently present.

## Proposed release identity

| Field | Proposed value / decision |
| --- | --- |
| App | BEE Suite Parent Portal |
| Application ID | `com.brunerdigital.thebeesuite.parent` pending approval |
| Display name | `BEE Suite` |
| Initial version name/code | `1.0` / `1` |
| Launch URL | `https://thebeesuite.io/parents` |
| Distribution | Google Play internal testing first |
| App Links | Deferred until signing fingerprint and path allowlist are approved |
| FCM push | Deferred until explicitly approved and implemented end to end |

Confirm the then-current Google Play target API requirement immediately before target creation/upload. Do not hard-code a future target based only on this runbook.

## Repository preparation after authorization

```bash
npm ci
npm install @capacitor/android@8.4.1
npx cap add android
npx cap sync android
npx cap open android
```

Before accepting generated files:

1. Confirm the generated application ID exactly matches the approved ID.
2. Set `versionName`/`versionCode` to the approved identity and record them in the evidence packet.
3. Confirm HTTPS-only navigation, `/parents` start path, offline behavior, adaptive icon, splash theme, file chooser, and back navigation.
4. Keep notification permission, FCM, App Links, location, contacts, microphone, and unused capabilities absent.
5. Review the merged Android manifest and every transitive SDK permission before completing Data safety.
6. Run `npm run mobile:store:check`, Android unit/lint tasks, and a release build before signing.

## Signing and internal test — store owner action

Never commit the upload keystore, passwords, Play service-account JSON, or generated signing properties.

1. The Play Console owner creates the app and accepts Play App Signing.
2. The signing owner creates/selects the upload key using approved secure storage and backup.
3. Configure release signing through local/CI secrets, not tracked files.
4. In Android Studio choose **Build > Generate Signed Bundle / APK > Android App Bundle**, select release, and generate the `.aab`.
5. Verify its signing certificate and contents, then upload it to **Testing > Internal testing**.
6. Complete App access, Data safety, privacy policy, public deletion URL, content rating, target audience, ads declaration, listing, support contact, and policy declarations.
7. Add named testers, publish only internally, install through Google Play, and complete `MOBILE_APP_PHYSICAL_DEVICE_EVIDENCE_PACKET.md`.
8. Do not promote until blockers and device defects close and the release owner signs GO.

## App Links after approval

App Links require an `android:autoVerify="true"` HTTPS intent filter limited to approved paths and `https://thebeesuite.io/.well-known/assetlinks.json` containing the final application ID and Play App Signing certificate SHA-256 fingerprint. Do not use a debug-key fingerprint. Test installed/uninstalled, logged-in/logged-out, expired, malformed, and wrong-role links. Until then, HTTPS browser fallback is supported.

## FCM push after approval

Adding `google-services.json` or a notification permission is not complete push support. The release must include consent, registration error handling, token refresh/revocation, preferences, logout cleanup, sensitive-content redaction, foreground/background/terminated handling, authorized link routing, observability, and physical-device tests. Keep FCM absent and store copy silent until all pass.

