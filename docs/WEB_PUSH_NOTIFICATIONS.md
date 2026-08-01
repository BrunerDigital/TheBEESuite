# Web Push Notifications

Status: repository implementation complete; production activation requires migration, VAPID configuration, deployment, and physical-device evidence.

## Supported delivery

- Installed/Home Screen web apps use standards-based Web Push through the existing service worker.
- iPhone and iPad require iOS/iPadOS 16.4 or newer and an Add to Home Screen install before the permission control is available.
- Android and supported desktop browsers use the same subscription flow. Android controls whether the launcher shows a dot or numeric badge.
- Capacitor App Store shells do not use this web subscription. Native APNs and FCM remain separate, deferred adapters.

## Safety model

- Notification permission is requested only after the signed-in user presses **Enable device alerts**.
- Every subscription is bound to one application user, tenant, and device session. Logout deactivates the subscription and cancels pending deliveries.
- The database trigger creates delivery work only for new, user-assigned notifications and subscriptions that were already active. It does not backfill historical or global notifications.
- The dispatcher re-checks active user, tenant ownership, device-session status, notification status, and current user/role preferences before sending.
- Lock-screen text is category-based and excludes stored notification titles/bodies so child, family, billing, incident, and account details are not exposed.
- Push endpoint URLs and encryption keys are stored in service-role-only RLS tables and are redacted from operational request/response logs.

## Production configuration

Generate one VAPID key pair in a secure administrator environment:

```bash
npx web-push generate-vapid-keys --json
```

Store the result in the production environment; never commit the private key:

```text
WEB_PUSH_VAPID_PUBLIC_KEY=<public key>
WEB_PUSH_VAPID_PRIVATE_KEY=<private key>
WEB_PUSH_VAPID_SUBJECT=mailto:support@thebeesuite.io
```

Then apply `20260731193000_web_push_notifications`, deploy the same commit, and confirm `/api/cron/web-push` runs once per minute with Vercel's `CRON_SECRET` authorization.

Changing the VAPID key invalidates existing browser subscriptions. The UI removes a mismatched subscription and asks the user to enable alerts again.

## Required verification before activation is called complete

1. Use a non-production test user with access to only one test school.
2. Install from the canonical HTTPS origin and enable alerts from the installed app.
3. Create one fake, user-assigned in-app notification without child, family, payment, incident, or account details.
4. Verify one notification appears while the app is foregrounded, backgrounded, and closed.
5. Verify tapping it opens the authorized category route and login recovery remains fail-closed.
6. Verify the app icon badge matches unread assigned notifications and clears after marking them read.
7. Disable alerts and prove no new `WebPushDelivery` is queued for that subscription.
8. Re-enable, log out, and prove the subscription is inactive and pending deliveries are cancelled.
9. Repeat on a physical iPhone Home Screen install and an Android installed PWA. Record device, OS, browser, release commit, delivery row status, and retest result.

Do not use a real family, send real school content, enable native entitlements, or claim APNs/FCM support as part of this verification.
