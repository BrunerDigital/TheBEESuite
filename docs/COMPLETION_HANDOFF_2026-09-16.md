# BEE Suite Parent and Teacher Completion Handoff

Date: September 16, 2026
Baseline: `origin/main` / `4586633665558ad53982fc06e89b1622be0c4d26`

This handoff records what was revalidated during the completion pass and the remaining actions that require Apple, physical-device, provider, legal, school, or business access.

## Revalidated technical baseline

- `npm test`: 2,483 passed, 0 failed.
- `npm run vercel-build`: passed, including Prisma generation, lint, typecheck, tests, and Next production build.
- `npm run mobile:store:check`: passed for parent and teacher iOS configuration.
- `npm run ios:parent:sync`: passed.
- `npm run ios:teacher:sync`: passed.
- Public production routes `/parents`, `/teachers`, `/support`, `/privacy`, `/terms`, `/eula`, and `/mobile-apps`: HTTP 200.
- Parent portal live authentication and Holly Hill test-family flow: verified.
- Current production health: database connected.

## Still required before a full launch claim

### Parent and teacher web

- Complete credentialed teacher production smoke testing with a real assigned classroom.
- Complete two-school and two-family isolation evidence for parent, teacher, director, billing, executive, regional, and auditor roles.
- Reconcile each launch school’s families, children, guardians, pickups, classrooms, staff, schedules, documents, tuition, balances, and permissions.
- Complete provider and business gates for invitations, communications, billing, payments, payouts, backups, monitoring, and support ownership.

### Parent and teacher iOS

- Use a Mac with current Xcode and the Apple Developer team that owns both bundle IDs.
- Select the correct signing team and confirm unused version/build numbers.
- Archive and validate both apps in Release configuration.
- Review the exact binary privacy reports and App Store Connect privacy answers.
- Upload to TestFlight.
- Install each processed build on a physical supported iPhone.
- Test authenticated parent/teacher workflows, uploads, background/resume, offline/reconnect, logout, reinstall, and update behavior.
- Capture final fake-data screenshots and complete the physical-device evidence packet.
- Complete App Store metadata, reviewer information, support/privacy links, export compliance, and final App Review approval.

## Intentionally deferred unless separately approved

- Android native applications.
- Native APNs/FCM push notifications.
- Universal Links and Android App Links.
- Custom-domain lifecycle.
- Support impersonation.
- Terminal equipment store and broad marketing publishing.

No production billing, payment, invitation, message, provider, store, or destructive cleanup action was performed as part of this handoff.
