import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PaymentStatus, UserRole } from "@prisma/client";
import { startOfServiceDay, validateNextCheckAction, validateSelectedChildren } from "../src/lib/attendance-state";
import {
  activeStripeCheckoutPaymentMessage,
  activeStripeCheckoutPaymentSummary,
  checkoutApplicationGuard,
  isActiveStripeAutopayPayment,
  isActiveStripeCheckoutPayment,
} from "../src/lib/billing-guardrails";
import { stripeCheckoutDraftClearReason } from "../src/lib/stripe-checkout-drafts";
import { demoAccountEmails, resolveLoginIdentifier } from "../src/lib/demo-accounts";
import { hashGuardianPin, verifyGuardianPin } from "../src/lib/kiosk";
import { centerScopedAccessGuard, classroomFamilyGuard, scopedUpdateGuard, staffTenantGuard } from "../src/lib/operations-guardrails";
import {
  canAccessFamilyRecord,
  canAcknowledgeIncident,
  canCreateFamilyMessage,
  canMessageClassroomFamily,
  canInviteGuardianToPortal,
  canSubmitDocumentForReview,
  normalizeParentNotificationPreferences,
  validateDailyReportMediaLink,
  validateMediaUploadInput,
} from "../src/lib/portal-guardrails";
import { checkRateLimit } from "../src/lib/rate-limit";
import { isSameAccessGrantTarget } from "../src/lib/access-grant-guardrails";
import { resolveSignatureRecipient, validateSignatureChildTarget } from "../src/lib/document-guardrails";
import { getDatabaseUrl, hasDatabaseConfig, hasSupabaseAuthConfig } from "../src/lib/readiness-guardrails";
import { parseOperationalDate } from "../src/lib/date-guardrails";
import {
  buildParentPortalInvitationText,
  buildParentPortalUrl,
  getParentPortalDefaultPassword,
  PARENT_PORTAL_PATH,
} from "../src/lib/parent-portal-invitations";
import { buildParentDocumentRequestEmailText, parentDocumentRequestRecipientOptions } from "../src/lib/parent-document-requests";
import { deriveDirectorLaunchAutoCompletedIds, mergeSetupChecklistCompletedIds } from "../src/lib/setup-checklist-auto";
import {
  calculateFteCount,
  defaultFteWeekEnd,
  normalizeFteStatus,
  resolveFteCenterId,
  validateFtePeriod,
} from "../src/lib/fte-report-guardrails";
import { notificationTargetGuard } from "../src/lib/notification-guardrails";
import { activeNotificationWhere, notificationDedupeKey, notificationExpiresAt } from "../src/lib/notification-policy";
import {
  buildPasswordResetRedirectUrl,
  buildPasswordResetTokenUrl,
  buildPublicAppBaseUrl,
  canonicalizePublicUrl,
  CANONICAL_APP_BASE_URL,
  cleanSupabaseUrl,
  safePasswordResetNextPath,
} from "../src/lib/supabase-auth";
import { canAccessModule } from "../src/lib/rbac";
import { canManageStaffCompensation, canViewDemoFallbackData, readSessionVersion, requiresPasswordResetGate, sessionMatchesCurrentVersion } from "../src/lib/auth";
import { appModeFromPath, buildDeviceSessionLabel, inferDeviceType, normalizeDeviceAppMode } from "../src/lib/device-sessions";
import { resolvePostLoginPath, safeLoginNextPath } from "../src/lib/login-routing";
import { buildVisibleMessageWhere } from "../src/lib/message-visibility";

test("password reset gate does not block teacher or parent profile accounts", () => {
  assert.equal(requiresPasswordResetGate({ role: UserRole.TEACHER, mustResetPassword: true }), false);
  assert.equal(requiresPasswordResetGate({ role: UserRole.PARENT_GUARDIAN, mustResetPassword: true }), false);
  assert.equal(requiresPasswordResetGate({ role: UserRole.CENTER_DIRECTOR, mustResetPassword: true }), true);
  assert.equal(requiresPasswordResetGate({ role: UserRole.TEACHER, mustResetPassword: false }), false);
});

test("web app login routes parent accounts into the parent portal", () => {
  assert.equal(safeLoginNextPath("/parent-portal#billing"), "/parent-portal#billing");
  assert.equal(safeLoginNextPath("/login?next=/parent-portal"), "/dashboard");
  assert.equal(resolvePostLoginPath({ role: UserRole.PARENT_GUARDIAN, requestedNext: "/dashboard" }), "/parent-portal");
  assert.equal(resolvePostLoginPath({ role: UserRole.PARENT_GUARDIAN, requestedNext: "/parent-portal#billing" }), "/parent-portal#billing");
  assert.equal(resolvePostLoginPath({ role: UserRole.AUTHORIZED_PICKUP, requestedNext: "/billing-invoices" }), "/parent-portal");
  assert.equal(resolvePostLoginPath({ role: UserRole.CENTER_DIRECTOR, requestedNext: "/dashboard" }), "/dashboard");
});

test("web app login routes teacher accounts into teacher-safe workflows", () => {
  assert.equal(resolvePostLoginPath({ role: UserRole.TEACHER, requestedNext: "/dashboard" }), "/teacher-portal");
  assert.equal(resolvePostLoginPath({ role: UserRole.TEACHER, requestedNext: "/teacher-portal#teacher-attendance" }), "/teacher-portal#teacher-attendance");
  assert.equal(resolvePostLoginPath({ role: UserRole.TEACHER, requestedNext: "/daily-reports" }), "/daily-reports");
  assert.equal(resolvePostLoginPath({ role: UserRole.TEACHER, requestedNext: "/school-setup" }), "/teacher-portal");
  assert.equal(resolvePostLoginPath({ role: UserRole.CENTER_DIRECTOR, requestedNext: "/teacher-portal" }), "/classroom-dashboard");
  assert.equal(resolvePostLoginPath({ role: UserRole.BILLING_ADMIN, requestedNext: "/teacher-portal" }), "/dashboard");
});

test("billing guard applies a checkout payment only once per invoice", () => {
  assert.deepEqual(checkoutApplicationGuard({
    invoiceStatus: PaymentStatus.OPEN,
    invoiceBillingAccountId: "acct_1",
    invoiceTotalCents: 12500,
    paymentStatus: PaymentStatus.DRAFT,
    paymentBillingAccountId: "acct_1",
    paymentAmountCents: 12500,
  }), { ok: true });

  assert.deepEqual(checkoutApplicationGuard({
    invoiceStatus: PaymentStatus.PAID,
    invoiceBillingAccountId: "acct_1",
    invoiceTotalCents: 12500,
    paymentStatus: PaymentStatus.DRAFT,
    paymentBillingAccountId: "acct_1",
    paymentAmountCents: 12500,
  }), { ok: false, reason: "invoice_already_paid" });

  assert.deepEqual(checkoutApplicationGuard({
    invoiceStatus: PaymentStatus.OPEN,
    invoiceBillingAccountId: "acct_1",
    invoiceTotalCents: 12500,
    paymentStatus: PaymentStatus.DRAFT,
    paymentBillingAccountId: "acct_2",
    paymentAmountCents: 12500,
  }), { ok: false, reason: "billing_account_mismatch" });
});

test("active Stripe checkout detection only blocks draft checkout sessions", () => {
  assert.equal(isActiveStripeCheckoutPayment({
    status: PaymentStatus.DRAFT,
    provider: "stripe",
    customFields: { status: "checkout_created" },
  }), true);

  assert.equal(isActiveStripeCheckoutPayment({
    status: PaymentStatus.FAILED,
    provider: "stripe",
    customFields: { status: "checkout_created" },
  }), false);

  assert.equal(isActiveStripeCheckoutPayment({
    status: PaymentStatus.DRAFT,
    provider: "stripe_mock",
    customFields: { status: "checkout_created" },
  }), false);
});

test("active Stripe checkout summary identifies ACH processing state", () => {
  const payment = {
    id: "pay_1",
    amountCents: 25500,
    status: PaymentStatus.DRAFT,
    provider: "stripe",
    externalIdPlaceholder: "cs_live_123",
    customFields: {
      status: "checkout_created",
      paymentMethodCategory: "ach",
      stripePaymentIntentId: "pi_123",
      stripePaymentIntentStatus: "processing",
    },
  };

  assert.deepEqual(activeStripeCheckoutPaymentSummary(payment), {
    id: "pay_1",
    amountCents: 25500,
    status: "checkout_created",
    paymentMethodCategory: "ach",
    requestedPaymentMethodCategory: null,
    bankAccountVerificationMethod: null,
    stripeCheckoutSessionId: "cs_live_123",
    stripePaymentIntentId: "pi_123",
    stripePaymentIntentStatus: "processing",
    stripePaymentStatus: null,
  });
  assert.match(activeStripeCheckoutPaymentMessage(payment), /bank payment is already processing/i);
});

test("Stripe checkout draft clear rules preserve real processing payments", () => {
  const now = new Date("2026-07-02T21:00:00.000Z");

  assert.equal(stripeCheckoutDraftClearReason({
    id: "cs_expired",
    status: "expired",
    paymentStatus: "unpaid",
  }, now), "expired");

  assert.equal(stripeCheckoutDraftClearReason({
    id: "cs_open_old",
    status: "open",
    paymentStatus: "unpaid",
    createdAt: "2026-07-02T20:00:00.000Z",
    paymentIntentId: null,
  }, now), "stale_open");

  assert.equal(stripeCheckoutDraftClearReason({
    id: "cs_open_recent",
    status: "open",
    paymentStatus: "unpaid",
    createdAt: "2026-07-02T20:45:00.000Z",
    paymentIntentId: null,
  }, now), null);

  assert.equal(stripeCheckoutDraftClearReason({
    id: "cs_processing",
    status: "complete",
    paymentStatus: "unpaid",
    paymentIntentId: "pi_processing",
    paymentIntentStatus: "processing",
  }, now), null);

  assert.equal(stripeCheckoutDraftClearReason({
    id: "cs_failed",
    status: "complete",
    paymentStatus: "unpaid",
    paymentIntentId: "pi_failed",
    paymentIntentStatus: "requires_payment_method",
  }, now), "failed_intent");
});

test("active Stripe autopay detection blocks draft off-session attempts", () => {
  assert.equal(isActiveStripeAutopayPayment({
    status: PaymentStatus.DRAFT,
    provider: "stripe",
    customFields: { status: "autopay_processing" },
  }), true);

  assert.equal(isActiveStripeAutopayPayment({
    status: PaymentStatus.DRAFT,
    provider: "stripe",
    customFields: { status: "autopay_succeeded_pending_webhook" },
  }), true);

  assert.equal(isActiveStripeAutopayPayment({
    status: PaymentStatus.DRAFT,
    provider: "stripe",
    customFields: { status: "stored_method_processing" },
  }), true);

  assert.equal(isActiveStripeAutopayPayment({
    status: PaymentStatus.FAILED,
    provider: "stripe",
    customFields: { status: "autopay_processing" },
  }), false);
});

test("record mutation guard blocks cross-scope updates", () => {
  assert.deepEqual(scopedUpdateGuard({
    entity: "Family",
    expectedScopeId: "center_a",
    actualScopeId: "center_a",
    scopeLabel: "center",
  }), { ok: true });

  assert.deepEqual(scopedUpdateGuard({
    entity: "Family",
    expectedScopeId: "center_a",
    actualScopeId: "center_b",
    scopeLabel: "center",
  }), {
    ok: false,
    status: 403,
    error: "Family is not linked to the requested center.",
  });

  assert.deepEqual(staffTenantGuard("tenant_a", "tenant_b"), {
    ok: false,
    status: 409,
    error: "That email belongs to a different tenant.",
  });

  assert.deepEqual(classroomFamilyGuard("center_a", "center_b"), {
    ok: false,
    status: 403,
    error: "Classroom is not linked to this family center.",
  });

  assert.deepEqual(centerScopedAccessGuard({
    centerId: null,
    hasTenantWideAccess: false,
    hasCenterAccess: false,
    resourceLabel: "Child",
  }), {
    ok: false,
    status: 403,
    error: "Child is not linked to an accessible center.",
  });
});

test("attendance guard blocks duplicate check-ins and checkout-before-checkin", () => {
  assert.deepEqual(validateNextCheckAction("check_in", null), { ok: true });
  assert.deepEqual(validateNextCheckAction("check_in", "check_in"), {
    ok: false,
    error: "Child is already checked in for today.",
  });
  assert.deepEqual(validateNextCheckAction("check_out", "check_in"), { ok: true });
  assert.deepEqual(validateNextCheckAction("check_out", "check_out"), {
    ok: false,
    error: "Child must be checked in before check-out.",
  });
  assert.deepEqual(validateSelectedChildren({
    requestedChildIds: ["child_a", "child_b"],
    allowedChildIds: ["child_a"],
  }), {
    ok: false,
    status: 403,
    error: "One or more selected children are not linked to this guardian at this school.",
    unauthorizedChildIds: ["child_b"],
  });
});

test("service day uses the center time zone rather than server-local midnight", () => {
  assert.equal(
    startOfServiceDay(new Date("2026-05-27T15:00:00.000Z"), "America/New_York").toISOString(),
    "2026-05-27T04:00:00.000Z",
  );
  assert.equal(
    startOfServiceDay(new Date("2026-01-27T15:00:00.000Z"), "America/New_York").toISOString(),
    "2026-01-27T05:00:00.000Z",
  );
});

test("kiosk PIN hashing fails closed in production without a PIN secret", () => {
  const mutableEnv = process.env as Record<string, string | undefined>;
  const originalNodeEnv = mutableEnv.NODE_ENV;
  const originalPinSecret = mutableEnv.PIN_HASH_SECRET;
  const originalAuthSecret = mutableEnv.AUTH_SECRET;
  try {
    mutableEnv.NODE_ENV = "production";
    delete mutableEnv.PIN_HASH_SECRET;
    delete mutableEnv.AUTH_SECRET;
    assert.throws(() => hashGuardianPin("guardian_1", "1234"), /PIN_HASH_SECRET is required/);

    mutableEnv.PIN_HASH_SECRET = "test-pin-secret";
    const hash = hashGuardianPin("guardian_1", "1234");
    assert.equal(verifyGuardianPin("guardian_1", "1234", hash), true);
    assert.equal(verifyGuardianPin("guardian_1", "4321", hash), false);
  } finally {
    if (originalNodeEnv === undefined) delete mutableEnv.NODE_ENV;
    else mutableEnv.NODE_ENV = originalNodeEnv;
    if (originalPinSecret === undefined) delete mutableEnv.PIN_HASH_SECRET;
    else mutableEnv.PIN_HASH_SECRET = originalPinSecret;
    if (originalAuthSecret === undefined) delete mutableEnv.AUTH_SECRET;
    else mutableEnv.AUTH_SECRET = originalAuthSecret;
  }
});

test("Supabase auth URL has no hardcoded project fallback", () => {
  assert.equal(cleanSupabaseUrl("https://example.supabase.co/"), "https://example.supabase.co");
  assert.equal(cleanSupabaseUrl(""), "");
  assert.equal(cleanSupabaseUrl(undefined), "");
});

test("password reset redirects can safely return invited parents to the portal", () => {
  assert.equal(
    buildPasswordResetRedirectUrl({
      appBaseUrl: "https://app.example.com",
      requestUrl: "https://app.example.com/api/parent/invitations",
      nextPath: PARENT_PORTAL_PATH,
    }),
    "https://app.example.com/reset-password?next=%2Fparent-portal",
  );

  assert.equal(
    buildPasswordResetRedirectUrl({
      configuredRedirectUrl: "https://thebeesuite.io/reset-password",
      requestUrl: "https://ignored.example.com/api/auth/forgot-password",
      nextPath: PARENT_PORTAL_PATH,
    }),
    "https://thebeesuite.io/reset-password?next=%2Fparent-portal",
  );

  assert.equal(safePasswordResetNextPath("//evil.example.com"), "");
  assert.equal(safePasswordResetNextPath("/login?next=/parent-portal"), "");
});

test("public parent links never expose Vercel deployment hosts", () => {
  assert.equal(
    buildPublicAppBaseUrl({
      requestUrl: "https://the-bee-suite-preview-brunerdigitals-projects.vercel.app/api/parent/invitations",
      vercelUrl: "the-bee-suite-preview-brunerdigitals-projects.vercel.app",
    }),
    CANONICAL_APP_BASE_URL,
  );

  assert.equal(
    canonicalizePublicUrl("https://the-bee-suite-beta.vercel.app/parent-portal"),
    "https://thebeesuite.io/parent-portal",
  );

  assert.equal(
    buildPasswordResetRedirectUrl({
      configuredRedirectUrl: "https://the-bee-suite-beta.vercel.app/reset-password",
      nextPath: PARENT_PORTAL_PATH,
    }),
    "https://thebeesuite.io/reset-password?next=%2Fparent-portal",
  );

  assert.equal(
    buildPasswordResetTokenUrl({
      appBaseUrl: "https://the-bee-suite-beta.vercel.app",
      tokenHash: "hash_123",
      nextPath: PARENT_PORTAL_PATH,
    }),
    "https://thebeesuite.io/reset-password?token_hash=hash_123&type=recovery&next=%2Fparent-portal",
  );
});

test("external payment session callbacks use the branded app base URL", () => {
  const externalSessionRoutes = [
    "src/app/api/billing/checkout-session/route.ts",
    "src/app/api/billing/family-payment/route.ts",
    "src/app/api/billing/payment-method-request/checkout/route.ts",
    "src/app/api/billing/payment-method-session/route.ts",
    "src/app/api/billing/payment-method-request/session/route.ts",
    "src/app/api/billing/connect/onboard/route.ts",
    "src/app/api/billing/connect/refresh/route.ts",
    "src/app/api/terminal-store/checkout-session/route.ts",
  ];
  const securePaymentRequestRoutes = new Set([
    "src/app/api/billing/payment-method-request/checkout/route.ts",
    "src/app/api/billing/payment-method-request/session/route.ts",
  ]);

  for (const route of externalSessionRoutes) {
    const source = readFileSync(route, "utf8");
    if (securePaymentRequestRoutes.has(route)) {
      assert.match(source, /getPaymentMethodRequestAppBaseUrl\(request\.url\)/, `${route} must use the secure payment request app URL helper`);
    } else {
      assert.match(source, /getAppBaseUrl\(request\.url\)/, `${route} must use the branded public app URL helper`);
    }
    assert.doesNotMatch(source, /request\.nextUrl\.origin/, `${route} must not leak deployment preview origins to external providers`);
  }
});

test("parent portal invite copy uses guardian email and school default password login", () => {
  const previousParentPortalDefault = process.env.PARENT_PORTAL_DEFAULT_PASSWORD;
  const previousParentDefault = process.env.PARENT_DEFAULT_PASSWORD;
  try {
    delete process.env.PARENT_PORTAL_DEFAULT_PASSWORD;
    delete process.env.PARENT_DEFAULT_PASSWORD;
    const portalUrl = buildParentPortalUrl("https://thebeesuite.io/");
    const text = buildParentPortalInvitationText({
      guardianName: "Taylor Parent",
      centerLabel: "Kid City Kokomo",
      email: "taylor@example.com",
      portalUrl,
    });

    assert.equal(getParentPortalDefaultPassword(), "BusyBees");
    assert.equal(portalUrl, "https://thebeesuite.io/parent-portal");
    assert.match(text, /Use taylor@example\.com as your login email\./);
    assert.match(text, /Use BusyBees as your default password if you have not changed it yet\./);
    assert.match(text, /Sign in here: https:\/\/thebeesuite\.io\/parent-portal/);
    assert.match(text, /You do not have to choose a new password/);
    assert.match(text, /Profile settings/);
    assert.match(text, /child records and classroom connections/);
    assert.doesNotMatch(text, /temporary password/i);
    assert.doesNotMatch(text, /token_hash/i);
    assert.doesNotMatch(text, /Open the password setup email/i);
    assert.doesNotMatch(text, /vercel\.app/i);
  } finally {
    if (previousParentPortalDefault === undefined) delete process.env.PARENT_PORTAL_DEFAULT_PASSWORD;
    else process.env.PARENT_PORTAL_DEFAULT_PASSWORD = previousParentPortalDefault;
    if (previousParentDefault === undefined) delete process.env.PARENT_DEFAULT_PASSWORD;
    else process.env.PARENT_DEFAULT_PASSWORD = previousParentDefault;
  }
});

test("parent document request emails use guardian personal emails and branded form copy", () => {
  const previousParentPortalDefault = process.env.PARENT_PORTAL_DEFAULT_PASSWORD;
  const previousParentDefault = process.env.PARENT_DEFAULT_PASSWORD;
  try {
    delete process.env.PARENT_PORTAL_DEFAULT_PASSWORD;
    delete process.env.PARENT_DEFAULT_PASSWORD;
    const recipients = parentDocumentRequestRecipientOptions([
      { id: "guardian_1", fullName: "Taylor Parent", email: "Taylor@Example.com", userId: "user_1" },
      { id: "guardian_2", fullName: "Duplicate Parent", email: "taylor@example.com", userId: "user_1" },
      { id: "guardian_3", fullName: "No Email", email: "", userId: null },
    ]);
    assert.equal(recipients.length, 1);
    assert.equal(recipients[0].email, "taylor@example.com");
    assert.deepEqual(recipients[0].guardianIds, ["guardian_1", "guardian_2"]);

    const text = buildParentDocumentRequestEmailText({
      recipientLabel: "Taylor Parent",
      familyName: "Taylor Family",
      childName: "Avery Taylor",
      centerLabel: "Kokomo",
      documentName: "Immunization Record",
      actionLabel: "upload or submit",
      portalUrl: "https://thebeesuite.io/parent-portal#documents",
    });
    assert.match(text, /Kokomo is requesting Immunization Record for Avery Taylor in The BEE Suite\./);
    assert.match(text, /Open the branded parent form: https:\/\/thebeesuite\.io\/parent-portal#documents/);
    assert.match(text, /guardian email where you received this message/);
    assert.match(text, /BusyBees as your default password/);
    assert.doesNotMatch(text, /vercel\.app/i);
  } finally {
    if (previousParentPortalDefault === undefined) delete process.env.PARENT_PORTAL_DEFAULT_PASSWORD;
    else process.env.PARENT_PORTAL_DEFAULT_PASSWORD = previousParentPortalDefault;
    if (previousParentDefault === undefined) delete process.env.PARENT_DEFAULT_PASSWORD;
    else process.env.PARENT_DEFAULT_PASSWORD = previousParentDefault;
  }
});

test("director launch setup checklist auto-completes from app evidence", () => {
  const automatic = deriveDirectorLaunchAutoCompletedIds({
    centerCount: 1,
    schoolProfileReady: true,
    classroomCount: 4,
    teacherStaffCount: 8,
    importedFamilyCount: 30,
    importedChildCount: 42,
    documentCount: 12,
    tuitionPlanCount: 2,
    guardianLoginCount: 10,
    attendanceRecordCount: 5,
    messageTemplateCount: 3,
    fteReportCount: 1,
    licensingReady: true,
    leadCount: 4,
    dashboardConfigured: true,
  });

  assert.ok(automatic.includes("login-school-profile"));
  assert.ok(automatic.includes("required-documents"));
  assert.ok(automatic.includes("parent-portal"));
  assert.ok(!automatic.includes("launch-smoke-test"));
  assert.deepEqual(
    mergeSetupChecklistCompletedIds({
      manualCompletedIds: ["launch-smoke-test", "parent-portal"],
      automaticCompletedIds: automatic,
    }).filter((id) => id === "parent-portal"),
    ["parent-portal"],
  );
});

test("login rate limit blocks repeated attempts for the same key", () => {
  const key = `test-login:${Date.now()}:${Math.random()}`;
  assert.equal(checkRateLimit({ key, limit: 2, windowMs: 60_000 }).ok, true);
  assert.equal(checkRateLimit({ key, limit: 2, windowMs: 60_000 }).ok, true);
  assert.equal(checkRateLimit({ key, limit: 2, windowMs: 60_000 }).ok, false);
});

test("session version guard invalidates stale signed cookies", () => {
  assert.equal(readSessionVersion(null), 0);
  assert.equal(readSessionVersion(3), 3);
  assert.equal(readSessionVersion(-1), 0);
  assert.equal(sessionMatchesCurrentVersion({ sessionVersion: 3 }, 3), true);
  assert.equal(sessionMatchesCurrentVersion({ sessionVersion: 2 }, 3), false);
  assert.equal(sessionMatchesCurrentVersion({}, 1), false);
  assert.equal(sessionMatchesCurrentVersion({}, 0), true);
});

test("device sessions classify app modes and tablet devices", () => {
  const fireTabletUa = "Mozilla/5.0 (Linux; Android 9; KFMUWI) AppleWebKit/537.36 Silk/115.4.1 like Chrome/115.0 Safari/537.36";
  const ipadUa = "Mozilla/5.0 (iPad; CPU OS 17_2 like Mac OS X) AppleWebKit/605.1.15 Version/17.2 Mobile/15E148 Safari/604.1";
  assert.equal(appModeFromPath("/check-in/kokomo"), "kiosk");
  assert.equal(appModeFromPath("/parent-portal"), "parent");
  assert.equal(normalizeDeviceAppMode("invalid", "/teacher-portal"), "teacher");
  assert.equal(inferDeviceType(fireTabletUa), "tablet");
  assert.equal(inferDeviceType("Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) Mobile/15E148"), "phone");
  assert.equal(buildDeviceSessionLabel({ appMode: "teacher", deviceType: "tablet", userAgent: ipadUa }), "Teacher app on iPad");
});

test("demo fallback data is limited to seeded demo accounts", () => {
  assert.equal(canViewDemoFallbackData({
    email: demoAccountEmails.executive,
    role: UserRole.BRAND_ADMIN,
  }), true);
  assert.equal(canViewDemoFallbackData({
    email: ` ${demoAccountEmails.school.toUpperCase()} `,
    role: UserRole.CENTER_DIRECTOR,
  }), true);
  assert.equal(canViewDemoFallbackData({
    email: demoAccountEmails.teacher,
    role: UserRole.TEACHER,
  }), true);
  assert.equal(canViewDemoFallbackData({
    email: "brenden@kidcityusa.com",
    role: UserRole.PLATFORM_OWNER,
  }), false);
  assert.equal(canViewDemoFallbackData({
    email: "marie@kidcityusa.com",
    role: UserRole.BRAND_ADMIN,
  }), false);
  assert.equal(canViewDemoFallbackData({ role: UserRole.REGIONAL_MANAGER }), false);
});

test("demo login aliases resolve to the Kid City demo users", () => {
  assert.equal(resolveLoginIdentifier("demoschool"), demoAccountEmails.school);
  assert.equal(resolveLoginIdentifier("demoschool@demo.thebeesuite.io"), demoAccountEmails.school);
  assert.equal(resolveLoginIdentifier("demo teacher@kidcityusa.com"), demoAccountEmails.teacher);
  assert.equal(resolveLoginIdentifier("demoteacher"), demoAccountEmails.teacher);
});

test("parent portal guards require family-scoped messages and guardian acknowledgements", () => {
  assert.deepEqual(canCreateFamilyMessage({
    isParentGuardian: true,
    canManageOperations: false,
    familyId: null,
  }), {
    ok: false,
    status: 400,
    error: "Parent messages must be linked to a family.",
  });
  assert.deepEqual(canCreateFamilyMessage({
    isParentGuardian: true,
    canManageOperations: false,
    familyId: "family_1",
  }), { ok: true });
  assert.deepEqual(canCreateFamilyMessage({
    isParentGuardian: false,
    canManageOperations: false,
    canManageClassroomTasks: true,
    familyId: "family_1",
  }), { ok: true });
  assert.deepEqual(canCreateFamilyMessage({
    isParentGuardian: false,
    canManageOperations: false,
    canManageClassroomTasks: true,
    familyId: null,
  }), {
    ok: false,
    status: 403,
    error: "Message creation is not allowed for this role.",
  });
  assert.deepEqual(canMessageClassroomFamily({
    assignedClassroomId: "classroom_1",
    familyChildClassroomIds: ["classroom_1", "classroom_2"],
  }), { ok: true });
  assert.deepEqual(canMessageClassroomFamily({
    assignedClassroomId: "classroom_3",
    familyChildClassroomIds: ["classroom_1", "classroom_2"],
  }), {
    ok: false,
    status: 403,
    error: "Family is outside your assigned classroom.",
  });
  assert.deepEqual(canAcknowledgeIncident({ isLinkedGuardian: false }), {
    ok: false,
    status: 403,
    error: "Only a linked parent or guardian can acknowledge this incident.",
  });
  assert.deepEqual(canAccessFamilyRecord({
    isParentGuardian: true,
    isLinkedGuardian: false,
    hasCenterAccess: true,
  }), {
    ok: false,
    status: 403,
    error: "You do not have access to this family.",
  });
  assert.deepEqual(canAccessFamilyRecord({
    isParentGuardian: false,
    isLinkedGuardian: false,
    hasCenterAccess: false,
  }), {
    ok: false,
    status: 403,
    error: "You do not have access to this family.",
  });
});

test("message visibility keeps direct staff threads participant-scoped", () => {
  assert.deepEqual(buildVisibleMessageWhere({
    userId: "teacher_1",
    familyScopeWhere: { id: "__no_teacher_classroom__" },
    allCenters: false,
    teacherMessageScope: true,
  }), {
    OR: [
      { family: { is: { id: "__no_teacher_classroom__" } } },
      {
        familyId: null,
        threadKey: { startsWith: "staff:" },
        OR: [{ senderId: "teacher_1" }, { assignedToId: "teacher_1" }],
      },
    ],
  });

  assert.deepEqual(buildVisibleMessageWhere({
    userId: "director_1",
    familyScopeWhere: { centerId: { in: ["center_1"] } },
    allCenters: false,
    teacherMessageScope: false,
  }), {
    OR: [
      { family: { is: { centerId: { in: ["center_1"] } } } },
      {
        familyId: null,
        OR: [
          { threadKey: null },
          { NOT: { threadKey: { startsWith: "staff:" } } },
        ],
      },
      {
        familyId: null,
        threadKey: { startsWith: "staff:" },
        OR: [{ senderId: "director_1" }, { assignedToId: "director_1" }],
      },
    ],
  });
});

test("media guard requires secure upload and matching daily report child", () => {
  assert.deepEqual(validateMediaUploadInput({
    hasUploadedFile: false,
    photoUrl: "https://example.com/photo.jpg",
  }), {
    ok: false,
    status: 400,
    error: "Photo URLs are not accepted for new media. Upload a photo file so it can be stored securely.",
  });
  assert.deepEqual(validateMediaUploadInput({
    hasUploadedFile: true,
    photoUrl: "",
  }), { ok: true });
  assert.deepEqual(validateDailyReportMediaLink({
    dailyReportChildId: "child_a",
    childId: "child_b",
  }), {
    ok: false,
    status: 403,
    error: "Daily report is not linked to this child.",
  });
});

test("parent portal invitation and document guards enforce tenant and family boundaries", () => {
  assert.deepEqual(canInviteGuardianToPortal({
    canManageOperations: false,
    hasCenterAccess: true,
    guardianEmail: "parent@example.com",
    targetTenantId: "tenant_a",
  }), {
    ok: false,
    status: 403,
    error: "Parent portal invitations are not allowed for this role.",
  });

  assert.deepEqual(canInviteGuardianToPortal({
    canManageOperations: true,
    hasCenterAccess: true,
    guardianEmail: "",
    targetTenantId: "tenant_a",
  }), {
    ok: false,
    status: 400,
    error: "Guardian needs an email before parent portal access can be created.",
  });

  assert.deepEqual(canInviteGuardianToPortal({
    canManageOperations: true,
    hasCenterAccess: true,
    guardianEmail: "parent@example.com",
    existingUserTenantId: "tenant_b",
    targetTenantId: "tenant_a",
  }), {
    ok: false,
    status: 409,
    error: "That guardian email already belongs to another tenant.",
  });

  assert.deepEqual(canInviteGuardianToPortal({
    canManageOperations: true,
    hasCenterAccess: true,
    guardianEmail: "parent@example.com",
    existingUserTenantId: "tenant_a",
    existingUserRole: "PARENT_GUARDIAN",
    targetTenantId: "tenant_a",
  }), { ok: true });

  assert.deepEqual(canSubmitDocumentForReview({
    status: "APPROVED",
    isLinkedGuardian: true,
    hasCenterAccess: false,
  }), {
    ok: false,
    status: 400,
    error: "Approved documents cannot be resubmitted from the parent portal.",
  });

  assert.deepEqual(canSubmitDocumentForReview({
    status: "REQUESTED",
    isLinkedGuardian: false,
    hasCenterAccess: false,
  }), {
    ok: false,
    status: 403,
    error: "You do not have access to this document.",
  });

  assert.deepEqual(normalizeParentNotificationPreferences({
    email: "false",
    sms: "true",
    billing: false,
  }), {
    portal: true,
    email: false,
    sms: true,
    dailyReports: true,
    photos: true,
    billing: false,
    incidents: true,
    announcements: true,
  });
});

test("RBAC permits executive parent portal previews without opening parent portal to directors", () => {
  assert.equal(canAccessModule({
    role: "BRAND_ADMIN",
    accessScope: "tenant",
    centerIds: [],
  }, "parent-portal"), true);
  assert.equal(canAccessModule({
    role: "CENTER_DIRECTOR",
    accessScope: "center",
    centerIds: ["center_1"],
  }, "parent-portal"), false);
  assert.equal(canAccessModule({
    role: "PARENT_GUARDIAN",
    accessScope: "family",
    centerIds: ["center_1"],
  }, "parent-portal"), true);
});

test("RBAC keeps teacher workflows separate from staff management", () => {
  const teacher = {
    role: "TEACHER",
    accessScope: "center",
    centerIds: ["center_1"],
  };
  const director = {
    role: "CENTER_DIRECTOR",
    accessScope: "center",
    centerIds: ["center_1"],
  };

  assert.equal(canAccessModule(teacher, "teacher-portal"), true);
  assert.equal(canAccessModule(teacher, "daily-reports"), true);
  assert.equal(canAccessModule(teacher, "school-setup"), false);
  assert.equal(canAccessModule(teacher, "staff"), false);
  assert.equal(canAccessModule(teacher, "compliance"), false);
  assert.equal(canAccessModule(director, "school-setup"), true);
  assert.equal(canAccessModule(director, "staff"), true);
  assert.equal(canAccessModule(director, "compliance"), true);
  assert.equal(canAccessModule(director, "calendar"), true);
  assert.equal(canAccessModule(teacher, "calendar"), false);
  assert.equal(canManageStaffCompensation({ role: UserRole.TEACHER }), false);
  assert.equal(canManageStaffCompensation({ role: UserRole.CENTER_DIRECTOR }), true);
});

test("executive user edits replace stale access grants with the target grant", () => {
  assert.equal(isSameAccessGrantTarget({
    role: "BRAND_ADMIN",
    scopeType: "TENANT",
    brandId: "brand_1",
    organizationId: "org_1",
  }, {
    role: "BRAND_ADMIN",
    scopeType: "TENANT",
    brandId: "brand_1",
    organizationId: "org_1",
  }), true);

  assert.equal(isSameAccessGrantTarget({
    role: "BRAND_ADMIN",
    scopeType: "TENANT",
    brandId: "brand_1",
    organizationId: "org_1",
  }, {
    role: "BRAND_ADMIN",
    scopeType: "CENTER",
    brandId: "brand_1",
    organizationId: "org_1",
    centerId: "center_1",
  }), false);
});

test("readiness guard requires a Supabase URL for Auth readiness", () => {
  assert.equal(hasSupabaseAuthConfig({
    SUPABASE_ANON_KEY: "anon",
    SUPABASE_SERVICE_ROLE_KEY: "service",
  }), false);
  assert.equal(hasSupabaseAuthConfig({
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_ANON_KEY: "anon",
    SUPABASE_SERVICE_ROLE_KEY: "service",
  }), true);
});

test("readiness guard accepts Vercel Postgres database URL aliases", () => {
  assert.equal(hasDatabaseConfig({}), false);
  assert.equal(getDatabaseUrl({ POSTGRES_PRISMA_URL: " postgresql://pooled " }), "postgresql://pooled");
  assert.equal(hasDatabaseConfig({ POSTGRES_URL: "postgresql://direct" }), true);
  assert.equal(getDatabaseUrl({ DATABASE_URL: "postgresql://primary", POSTGRES_URL: "postgresql://direct" }), "postgresql://primary");
});

test("signature requests require valid family child target and recipient", () => {
  assert.deepEqual(validateSignatureChildTarget({
    familyId: "family_a",
    childId: "child_1",
    childFamilyId: "family_b",
  }), {
    ok: false,
    status: 403,
    error: "Selected child is not linked to this family.",
  });

  assert.deepEqual(resolveSignatureRecipient({
    requestedEmail: "not-an-email",
    billingEmail: "billing@example.com",
    guardianEmails: [],
  }), {
    ok: false,
    status: 400,
    error: "Recipient email must be a valid email address.",
  });

  assert.deepEqual(resolveSignatureRecipient({
    requestedEmail: "",
    billingEmail: "",
    guardianEmails: ["guardian@example.com"],
  }), {
    ok: true,
    email: "guardian@example.com",
  });
});

test("operational date guard rejects malformed childcare timestamps", () => {
  const fallback = new Date("2026-05-28T12:00:00.000Z");
  assert.deepEqual(parseOperationalDate("", "Attendance date", fallback), {
    ok: true,
    date: fallback,
    provided: false,
  });

  assert.deepEqual(parseOperationalDate("not-a-date", "Incident time", fallback), {
    ok: false,
    status: 400,
    error: "Incident time must be a valid date or timestamp.",
  });

  const parsed = parseOperationalDate("2026-05-28T09:30:00-04:00", "Daily report date", fallback);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.ok ? parsed.date.toISOString() : "", "2026-05-28T13:30:00.000Z");
});

test("notification target guard blocks cross-scope and center-scoped broadcasts", () => {
  assert.deepEqual(notificationTargetGuard({
    targetUserId: null,
    actorUserId: "user_a",
    actorTenantId: "tenant_a",
    actorCenterIds: ["center_a"],
    actorHasTenantWideAccess: false,
  }), {
    ok: false,
    status: 403,
    error: "Choose a specific user before queuing a notification from a center-scoped account.",
  });

  assert.deepEqual(notificationTargetGuard({
    targetUserId: "user_b",
    actorUserId: "user_a",
    actorTenantId: "tenant_a",
    actorCenterIds: ["center_a"],
    actorHasTenantWideAccess: false,
    targetTenantId: "tenant_b",
    targetCenterIds: ["center_a"],
  }), {
    ok: false,
    status: 403,
    error: "Notification target is outside your tenant.",
  });

  assert.deepEqual(notificationTargetGuard({
    targetUserId: "user_b",
    actorUserId: "user_a",
    actorTenantId: "tenant_a",
    actorCenterIds: ["center_a"],
    actorHasTenantWideAccess: false,
    targetTenantId: "tenant_a",
    targetCenterIds: ["center_a"],
  }), { ok: true });
});

test("notification policy normalizes dedupe keys and active retention filters", () => {
  const createdAt = new Date("2026-06-03T12:00:00.000Z");
  assert.equal(notificationExpiresAt(createdAt, 7).toISOString(), "2026-06-10T12:00:00.000Z");
  assert.equal(
    notificationDedupeKey(["FTE Due", "2026-06-01", "Overdue", "center 1", "USER 1"]),
    "fte-due:2026-06-01:overdue:center-1:user-1",
  );
  assert.equal(notificationDedupeKey(["", null, undefined]), null);
  assert.deepEqual(activeNotificationWhere(createdAt), {
    archivedAt: null,
    OR: [{ expiresAt: null }, { expiresAt: { gt: createdAt } }],
  });
});

test("FTE report guard scopes directors and permits executive corrections", () => {
  assert.deepEqual(resolveFteCenterId({
    role: "CENTER_DIRECTOR",
    requestedCenterId: "center_b",
    primaryCenterId: "center_a",
  }), {
    ok: false,
    status: 403,
    error: "Directors can submit FTE reports only for their assigned school.",
  });

  assert.deepEqual(resolveFteCenterId({
    role: "CENTER_DIRECTOR",
    requestedCenterId: "center_a",
    primaryCenterId: "center_a",
  }), { ok: true, centerId: "center_a" });

  assert.deepEqual(resolveFteCenterId({
    role: "BRAND_ADMIN",
    requestedCenterId: "center_b",
    primaryCenterId: "center_a",
    existingReportCenterId: "center_a",
  }), { ok: true, centerId: "center_b" });
});

test("FTE report guard normalizes weekly dates and statuses", () => {
  const start = new Date("2026-05-25T00:00:00.000Z");
  assert.equal(defaultFteWeekEnd(start).toISOString(), "2026-05-31T00:00:00.000Z");
  assert.equal(calculateFteCount(12, 5), 14.5);
  assert.equal(normalizeFteStatus({ requestedStatus: "approved", role: "CENTER_DIRECTOR", isCorrection: false }), "submitted");
  assert.equal(normalizeFteStatus({ requestedStatus: "approved", role: "BRAND_ADMIN", isCorrection: false }), "approved");
  assert.deepEqual(validateFtePeriod(start, new Date("2026-06-12T00:00:00.000Z")), {
    ok: false,
    status: 400,
    error: "FTE report periods must be two weeks or shorter.",
  });
});
