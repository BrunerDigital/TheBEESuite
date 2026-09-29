# iOS App Review recovery — September 28, 2026

## Verified Apple state

The original version 1.0 submissions were rejected under 2.1.0 (App Completeness). Apple's September 24 messages request additional information for a developer with limited review history; neither message identifies a reproducible crash or specific broken control. After saving build 4, the version editor shows Prepare for Submission while the original rejected review correspondence remains. This is not approval or a new review submission.

| App | Apple ID | Submitted build | Submission |
| --- | --- | --- | --- |
| Parent | 6811279592 | 1.0 (2) | e38f9893-5cd0-4b19-b7a1-e8c4b91cb709 |
| Teacher | 6811280080 | 1.0 (2) | 0f8bd4d9-b2d2-437d-8f22-5b038eff8b9d |

Both build-4 archives were uploaded successfully after Xcode's initial account-access issue recovered. Teacher uploaded at 09:32 EDT and Parent at 09:35 EDT. Both finished Apple processing and show Ready to Submit in TestFlight. Both were assigned to their existing BEE iOS Release QA internal testing groups. Build 4 was selected and saved for both version 1.0 App Store submissions; neither submission has been sent back to review.

| App | Selected build | Build UUID |
| --- | --- | --- |
| Parent | 1.0 (4) | 58b4f3bf-3160-43ec-8d6b-421ae7791aad |
| Teacher | 1.0 (4) | c501aea4-4e13-421b-ada7-3696efe88de2 |

Both listings have three screenshots named as native build-2 TestFlight captures. Their filenames are evidence of the existing listing assets, not fresh verification of their capture provenance or current visual accuracy. Both versions already use automatic release after approval; this setting was preserved.

## Completed Connect edits

Saved expanded private App Review Notes for Parent and Teacher. The notes cover purpose/audience, step-by-step feature access, reserved demo identity, account creation/removal, payments, external services, regional behavior and operational content. They explicitly state that the requested physical-device recording remains in preparation. Neither submission was resubmitted, and no reply was sent to Apple.

The notes explain the implementation accurately: received messages have Report controls, text screening occurs server-side, and abusive-user access removal is administered by the school. They do not claim a self-service block control exists. Demonstrate the actual mechanism and resolve any reviewer follow-up before claiming this requirement is closed.

Services reconciled with source: Capacitor/WKWebView; Vercel hosting/backend; Supabase Auth/PostgreSQL/private Storage; SendGrid/Twilio communications; Stripe for Parent real-world childcare payments. The wider operations-only AI command uses OpenAI. Authenticated portal routes are excluded from public-site Vercel telemetry. Core Teacher features do not require Stripe or OpenAI.

Parent published App Privacy lists 17 types, including private messages, health/sensitive content and financial categories. Teacher lists the corresponding 14 non-financial types. Both match the category counts in the existing build-4 archive manifests; both archive manifests set tracking false. This inventory comparison does not replace final workflow/privacy verification.

## Current automated checks

- Release workspace fast-forwarded to current `origin/main`, `622aa8491a3ac03ef2a3db7bfae96527ad5cbd0b`; production Vercel deployment is Ready at that same commit.
- Installed locked dependencies and ran the repository postinstall patch for `web-push` on Node 24. The initial full gate caught the absent patch; after repair, the completed `npm run vercel-build` passed lint, typecheck, all 2,544 tests (zero failures/skips), and the Next.js production build.
- Earlier 93 focused native/privacy, reviewer-safety, account-deletion, moderation and telemetry tests passed. The full current gate supersedes the narrower automated checkpoint.
- `npm audit --omit=dev` reports zero vulnerabilities. `npm run ops:check` and `npm run mobile:store:check` passed.
- Production health returned healthy with database connected at `2026-09-29T01:49:07.484Z` (September 28 EDT). Parent/Teacher sign-in, support, privacy, terms and mobile-app pages returned HTTP 200.
- Both existing reserved review accounts authenticated successfully against production without a forced password reset. Parent Home/Updates/Messages/Payments/Family and Teacher portal/roster/quick-log reads returned expected authorized pages. Both logout requests succeeded and replayed sessions were rejected. These HTTP checks do not establish client interaction, native permissions, uploads, payments, deletion execution or physical-device behavior.
- Both uploaded build-4 archive signatures passed strict verification. Native source and dependencies match current main; only the source build-number setting differs from the archive source checkpoint. The HTTPS WebView loads the current production application. See the [Mac reconciliation report](MAC_IOS_STACK_RECONCILIATION_2026-09-28.md) for evidence and remaining limitations.
- Fresh Parent and Teacher Release simulator compilation passed on current source. Simulator UI automation failed during startup; the isolated temporary simulator was cleaned up. These compile results are not physical-device or TestFlight workflow acceptance.

## Physical iPhone recording protocol

Apple requires a physical device running the latest operating system and a recording beginning with launching the app. A simulator recording, browser preview, or screenshots alone do not satisfy this request.

1. Connect and unlock the iPhone. Record model, actual OS version, app version/build and distribution source. Check the latest supported public OS on the device; do not silently install a beta or upgrade the user's device.
2. Use the final selected TestFlight candidate. Verify the existing reserved synthetic account can sign in and the entire reachable graph remains isolated before recording. Never use a real family or school account.
3. Avoid private notifications appearing in the recording. Begin from the Home Screen and launch the role app. Keep password entry masked; review the exported recording for sensitive content before sharing.
4. Parent: sign in; show Home and demo children; Updates and dated reports/photos; Messages and Report; Payments and synthetic invoice/history; Family and documents; Family > Profile & Security > account-deletion entry and retention explanation; sign out. Do not execute a real charge, send real communications, or delete the reviewer identity. Any actual demo mutation must stay inside the verified synthetic boundary.
5. Teacher: launch and sign in; show assigned demo classroom/roster; attendance; daily-report preparation; photo and incident controls; school Messages and Report; profile/support/access-removal guidance; sign out. Show actual feature behavior and any observed failure honestly.
6. Verify background/resume, keyboard/safe areas, permission denial, offline/reconnect, external links and post-logout protection separately. Record failures and retest after fixes. Do not label unperformed checks as passed.
7. Save one clearly named recording per app. Record duration, file hash, device/OS/build, synthetic identity (email only), checks actually completed, and any omissions.

## Response completion checklist

- [x] Read the exact current rejection for both apps.
- [x] Save fuller purpose, audience, feature-access and external-service notes in Connect.
- [x] Explicitly describe existing moderation and deletion behavior without inventing features.
- [x] Restore Xcode account access; upload and verify build 4 processing, QA-group assignment and saved submission selection for both apps.
- [x] Confirm private demo credentials are populated in Connect and existing reserved account passwords work against production; never print credentials in logs, Git or chat.
- [ ] Confirm authentication and workflows in the exact final TestFlight candidates on the physical device.
- [ ] Complete physical-device QA and recordings for both final candidates.
- [ ] Reconcile screenshots and privacy labels with final candidates.
- [ ] Attach recordings, replace the pending-evidence paragraph with exact completed evidence, and provide all six requested answers in review correspondence.
- [ ] Resubmit both versions and verify Apple acknowledges receipt.
- [ ] After Apple approval, verify public US listing/download URLs before publishing them on the website.

The paired iPhone was unavailable at the initial and subsequent device inventories. The owner has been asked to connect/unlock it. Xcode access recovered and uploads completed; no further Xcode sign-in is currently required.

Both apps' private demo credentials are populated, confirmed visually. The initial text/DOM check incorrectly reported empty values because the automation representation omits sensitive fields. That report was corrected immediately. Existing reserved passwords now pass production HTTP login checks; no credential was changed. Successful authentication with the final device builds remains unverified.

## References

- [Parent review](https://appstoreconnect.apple.com/apps/6811279592/distribution/reviewsubmissions/details/e38f9893-5cd0-4b19-b7a1-e8c4b91cb709)
- [Teacher review](https://appstoreconnect.apple.com/apps/6811280080/distribution/reviewsubmissions/details/0f8bd4d9-b2d2-437d-8f22-5b038eff8b9d)
- [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Build-4 archive evidence](IOS_CURRENT_MAIN_RELEASE_EVIDENCE_2026-09-16.md)
