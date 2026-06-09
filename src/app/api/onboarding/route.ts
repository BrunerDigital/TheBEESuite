import { NextRequest, NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { recordEmailDeliveryAttempt } from "@/lib/integration-deliveries";
import { sendEmail } from "@/lib/integrations";
import {
  normalizeSchoolOnboardingSetup,
  schoolOnboardingSetupSections,
  type SchoolOnboardingSetupField,
  type SchoolOnboardingSetupInput,
} from "@/lib/onboarding-setup";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, requestIp, retryAfterSeconds } from "@/lib/rate-limit";
import { getCenterInquiryEmbedCode } from "@/lib/inquiry-embed";
import {
  ensureSupabaseAuthUser,
  getAppBaseUrl,
  getPasswordResetRedirectUrl,
  requestSupabasePasswordReset,
} from "@/lib/supabase-auth";

export const runtime = "nodejs";

type OnboardingPayload = {
  brandName?: unknown;
  workEmail?: unknown;
  centerCount?: unknown;
  state?: unknown;
  timeline?: unknown;
  priority?: unknown;
  payoutAdminName?: unknown;
  payoutAdminEmail?: unknown;
  payoutReadiness?: unknown;
  softwarePlan?: unknown;
  addOnBundle?: unknown;
  merchantFeeStrategy?: unknown;
  notes?: unknown;
  pageUrl?: unknown;
} & Partial<Record<SchoolOnboardingSetupField, unknown>>;

type NormalizedPayload = ReturnType<typeof normalizePayload>;

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function uniqueEmails(values: string[]) {
  const seen = new Set<string>();
  return values
    .map((value) => value.trim())
    .filter((value) => isEmail(value))
    .filter((value) => {
      const key = value.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "childcare-brand";
}

async function uniqueTenantSlug(baseValue: string) {
  const base = slugify(baseValue);
  for (let index = 0; index < 50; index += 1) {
    const slug = index === 0 ? base : `${base}-${index + 1}`;
    const existing = await prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
    if (!existing) return slug;
  }
  return `${base}-${Date.now()}`;
}

function ownerNameFromPayload(payload: NormalizedPayload) {
  if (payload.payoutAdminName) return payload.payoutAdminName;
  return payload.workEmail
    .split("@")[0]
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || `${payload.brandName} Admin`;
}

function normalizePayload(input: OnboardingPayload) {
  const schoolSetupInput = Object.fromEntries(
    schoolOnboardingSetupSections.map((section) => [section.field, input[section.field]]),
  ) as SchoolOnboardingSetupInput;

  return {
    brandName: clean(input.brandName),
    workEmail: clean(input.workEmail).toLowerCase(),
    centerCount: clean(input.centerCount),
    state: clean(input.state),
    timeline: clean(input.timeline),
    priority: clean(input.priority),
    payoutAdminName: clean(input.payoutAdminName),
    payoutAdminEmail: clean(input.payoutAdminEmail).toLowerCase(),
    payoutReadiness: clean(input.payoutReadiness),
    softwarePlan: clean(input.softwarePlan),
    addOnBundle: clean(input.addOnBundle),
    merchantFeeStrategy: clean(input.merchantFeeStrategy),
    schoolSetup: normalizeSchoolOnboardingSetup(schoolSetupInput),
    notes: clean(input.notes),
    pageUrl: clean(input.pageUrl),
  };
}

function validate(payload: NormalizedPayload) {
  const errors: Record<string, string> = {};
  const centerCount = Number.parseInt(payload.centerCount, 10);
  if (!payload.brandName) errors.brandName = "Brand name is required.";
  if (!isEmail(payload.workEmail)) errors.workEmail = "A valid work email is required.";
  if (!payload.centerCount || !Number.isFinite(centerCount) || centerCount < 1) errors.centerCount = "Number of centers is required.";
  if (!payload.state) errors.state = "Primary state or region is required.";
  if (!payload.timeline) errors.timeline = "Launch timeline is required.";
  if (!payload.priority) errors.priority = "First priority is required.";
  if (!payload.payoutAdminName) errors.payoutAdminName = "Payout setup owner is required.";
  if (!isEmail(payload.payoutAdminEmail)) errors.payoutAdminEmail = "A valid payout setup email is required.";
  if (!payload.payoutReadiness) errors.payoutReadiness = "Payout account readiness is required.";
  if (!payload.softwarePlan) errors.softwarePlan = "Software plan model is required.";
  if (!payload.addOnBundle) errors.addOnBundle = "Add-on bundle is required.";
  if (!payload.merchantFeeStrategy) errors.merchantFeeStrategy = "Merchant fee strategy is required.";
  for (const section of schoolOnboardingSetupSections) {
    if (!payload.schoolSetup.sections[section.storageKey].completed) {
      errors[section.field] = `${section.label} is required.`;
    }
  }
  return errors;
}

function getNotificationRecipients() {
  return uniqueEmails([
    ...(process.env.ONBOARDING_NOTIFICATION_EMAILS?.split(",") ?? []),
    ...(process.env.INQUIRY_NOTIFICATION_EMAILS?.split(",") ?? []),
  ]);
}

async function sendOnboardingEmail(
  payload: NormalizedPayload,
  notificationId: string,
  workspace?: {
    tenantId: string;
    centerId: string;
    loginUrl: string;
    status: string;
  },
) {
  const recipients = getNotificationRecipients();

  if (!recipients.length) {
    return { ok: true, skipped: true, recipients: 0 };
  }

  const lines = [
    `Brand: ${payload.brandName}`,
    `Work email: ${payload.workEmail}`,
    `Centers: ${payload.centerCount}`,
    `Primary region: ${payload.state}`,
    `Launch timeline: ${payload.timeline}`,
    `First priority: ${payload.priority}`,
    `Payout setup owner: ${payload.payoutAdminName}`,
    `Payout setup email: ${payload.payoutAdminEmail}`,
    `Payout account readiness: ${payload.payoutReadiness}`,
    `Software plan: ${payload.softwarePlan}`,
    `Add-on bundle: ${payload.addOnBundle}`,
    `Merchant fee strategy: ${payload.merchantFeeStrategy}`,
    `School setup status: ${payload.schoolSetup.status}`,
    ...schoolOnboardingSetupSections.map((section) => {
      const setupSection = payload.schoolSetup.sections[section.storageKey];
      return `${section.label}: ${setupSection.value || "Not provided."}`;
    }),
    `Page URL: ${payload.pageUrl || ""}`,
    `Notification ID: ${notificationId}`,
    workspace ? `Workspace tenant ID: ${workspace.tenantId}` : "",
    workspace ? `Primary center ID: ${workspace.centerId}` : "",
    workspace ? `Workspace status: ${workspace.status}` : "",
    workspace ? `Login URL: ${workspace.loginUrl}` : "",
    "",
    "Launch notes:",
    payload.notes || "None provided.",
  ].filter((line) => line !== "");

  const subject = `New BEE Suite onboarding intake - ${payload.brandName}`;
  const text = lines.join("\n");
  const email = await sendEmail({
    to: recipients,
    subject,
    text,
    fromName: "The BEE Suite",
    categories: ["onboarding_email"],
    customArgs: {
      notificationId,
      tenantId: workspace?.tenantId,
      centerId: workspace?.centerId,
    },
    tenantId: workspace?.tenantId ?? null,
  });
  if (workspace) {
    await recordEmailDeliveryAttempt({
      tenantId: workspace.tenantId,
      centerId: workspace.centerId,
      purpose: "onboarding_email",
      to: recipients,
      subject,
      text,
      fromName: "The BEE Suite",
      result: email,
      metadata: { notificationId, workspaceStatus: workspace.status },
    });
  }

  return {
    ok: email.ok,
    skipped: !email.configured,
    recipients: recipients.length,
    error: email.error,
  };
}

async function createTrialWorkspace(payload: NormalizedPayload, requestUrl: string) {
  const existingUser = await prisma.user.findUnique({
    where: { email: payload.workEmail },
    include: {
      tenant: { select: { id: true, name: true, slug: true } },
      organization: { select: { id: true, name: true } },
    },
  });
  const baseUrl = getAppBaseUrl(requestUrl);
  const loginUrl = `${baseUrl}/login`;
  const resetRedirectUrl = getPasswordResetRedirectUrl(requestUrl);

  if (existingUser) {
    const reset = await requestSupabasePasswordReset(existingUser.email, resetRedirectUrl)
      .then((response) => ({ ok: response.ok, status: response.status }))
      .catch((error) => ({
        ok: false,
        error: error instanceof Error ? error.message : "Password reset email failed.",
      }));

    const notification = await prisma.notification.create({
      data: {
        title: `Existing workspace requested: ${payload.brandName}`,
        body: `${payload.workEmail} already has BEE Suite access. Sent account recovery when possible.`,
        type: "Onboarding",
        priority: "normal",
        userId: existingUser.id,
      },
      select: { id: true },
    });

    await prisma.auditLog.create({
      data: {
        tenantId: existingUser.tenantId,
        userId: existingUser.id,
        action: "onboarding.workspace.existing_user",
        resource: "User",
        resourceId: existingUser.id,
        metadata: {
          ...payload,
          notificationId: notification.id,
          reset,
          submittedAt: new Date().toISOString(),
        },
      },
    });

    return {
      existingWorkspace: true,
      status: "existing_user",
      notificationId: notification.id,
      tenantId: existingUser.tenantId,
      tenantName: existingUser.tenant.name,
      tenantSlug: existingUser.tenant.slug,
      organizationId: existingUser.organizationId,
      organizationName: existingUser.organization?.name,
      centerId: "",
      centerName: "",
      userId: existingUser.id,
      loginUrl,
      embedCode: "",
      auth: {
        user: { ok: true, created: false, alreadyExisted: true },
        passwordReset: reset,
      },
    };
  }

  const tenantSlug = await uniqueTenantSlug(payload.brandName);
  const ownerName = ownerNameFromPayload(payload);
  const requestedCenters = Math.max(1, Number.parseInt(payload.centerCount, 10) || 1);
  const centerName = requestedCenters > 1 ? `${payload.brandName} - Primary Center` : `${payload.brandName} Center`;
  const submittedAt = new Date().toISOString();
  const workspace = await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({
      data: {
        name: payload.brandName,
        slug: tenantSlug,
      },
      select: { id: true, name: true, slug: true },
    });

    const brand = await tx.brand.create({
      data: {
        tenantId: tenant.id,
        name: payload.brandName,
        slug: tenantSlug,
      },
      select: { id: true, name: true, slug: true },
    });

    const organization = await tx.organization.create({
      data: {
        tenantId: tenant.id,
        brandId: brand.id,
        name: payload.brandName,
      },
      select: { id: true, name: true },
    });

    const ownerGroup = await tx.ownerGroup.create({
      data: {
        tenantId: tenant.id,
        brandId: brand.id,
        organizationId: organization.id,
        name: `${payload.brandName} Ownership`,
        slug: `${tenantSlug}-ownership`,
        ownerType: requestedCenters > 1 ? "multi_location_operator" : "single_location_owner",
        billingEmail: payload.payoutAdminEmail || payload.workEmail,
        contactName: payload.payoutAdminName,
        status: "trial_setup",
        customFields: {
          trialWorkspace: true,
          requestedCenterCount: requestedCenters,
          model: requestedCenters > 1 ? "owner_group_multi_location" : "owner_group_single_center",
          schoolSetupStatus: payload.schoolSetup.status,
        },
      },
      select: { id: true, name: true, slug: true, ownerType: true },
    });

    const center = await tx.center.create({
      data: {
        organizationId: organization.id,
        ownerGroupId: ownerGroup.id,
        name: centerName,
        crmLocationId: `trial-${tenantSlug}`,
        locationId: `trial-${tenantSlug}`,
        state: payload.state,
        email: payload.workEmail,
        status: "trial_setup",
        sourceSystem: "bee_suite_trial_onboarding",
        externalId: `trial-${tenantSlug}`,
        licensedCapacity: 0,
        customFields: {
          trialWorkspace: true,
          setupStatus: "trial_setup",
          requestedCenterCount: requestedCenters,
          launchTimeline: payload.timeline,
          firstPriority: payload.priority,
          payoutAdminName: payload.payoutAdminName,
          payoutAdminEmail: payload.payoutAdminEmail,
          payoutReadiness: payload.payoutReadiness,
          softwarePlan: payload.softwarePlan,
          addOnBundle: payload.addOnBundle,
          merchantFeeStrategy: payload.merchantFeeStrategy,
          monthlySoftwareCostStatus: payload.softwarePlan.includes("pilot") ? "waived_for_pilot" : "setup_required",
          platformSurchargeStatus: "configured_later_in_stripe_checkout",
          livePaymentsEnabled: false,
          parentEngagementEnabled: false,
          publicInquiryEmbedEnabled: true,
          schoolOnboardingSetup: {
            ...payload.schoolSetup,
            capturedAt: submittedAt,
            capturedByEmail: payload.workEmail,
            expectedOwner: "school_director",
          },
          submittedPageUrl: payload.pageUrl,
        },
      },
      select: { id: true, name: true },
    });

    const user = await tx.user.create({
      data: {
        tenantId: tenant.id,
        organizationId: organization.id,
        email: payload.workEmail,
        name: ownerName,
        role: UserRole.BRAND_ADMIN,
        isActive: true,
      },
      select: { id: true, email: true, name: true, role: true },
    });

    await tx.userAccessGrant.create({
      data: {
        userId: user.id,
        tenantId: tenant.id,
        brandId: brand.id,
        organizationId: organization.id,
        ownerGroupId: ownerGroup.id,
        role: UserRole.BRAND_ADMIN,
        scopeType: "OWNER_GROUP",
        permissions: {
          canManageBranding: true,
          canManageCenters: true,
          canManageUsers: true,
          canInstallInquiryForms: true,
          canPreparePayouts: true,
        },
      },
    });

    await tx.whiteLabelSettings.create({
      data: {
        brandId: brand.id,
        brandName: payload.brandName,
        primaryColor: "#f5b51b",
        accentColor: "#10b981",
        themeMode: "dark",
        emailSenderPlaceholder: payload.workEmail,
        customDomainPlaceholder: "",
        legalFooterText: `${payload.brandName} childcare operations powered by The BEE Suite.`,
      },
    });

    await tx.brandCustomization.create({
      data: {
        tenantId: tenant.id,
        brandId: brand.id,
        organizationId: organization.id,
        scopeType: "BRAND",
        brandName: payload.brandName,
        mascotUrlPlaceholder: "/mr-bee.png",
        primaryColor: "#f5b51b",
        accentColor: "#10b981",
        themeMode: "dark",
        emailSenderPlaceholder: payload.workEmail,
        customDomainPlaceholder: "",
        parentPortalName: `${payload.brandName} Family Portal`,
        loginScreenTitle: `${payload.brandName} operations workspace`,
        notificationFooterText: `Sent from ${payload.brandName} through The BEE Suite.`,
        legalFooterText: `${payload.brandName} childcare operations powered by The BEE Suite.`,
      },
    });

    await tx.brandAsset.createMany({
      data: [
        {
          tenantId: tenant.id,
          brandId: brand.id,
          assetType: "mascot",
          url: "/mr-bee.png",
          altText: "Mr. Bee AI assistant",
        },
        {
          tenantId: tenant.id,
          brandId: brand.id,
          assetType: "logo_placeholder",
          altText: `${payload.brandName} logo placeholder`,
          metadata: { uploadStatus: "pending", scope: "brand" },
        },
      ],
    });

    await tx.integration.createMany({
      data: [
        {
          tenantId: tenant.id,
          provider: "bee_suite_inquiry_form",
          status: "ready_to_install",
          configPlaceholder: {
            centerId: center.id,
            ownerGroupId: ownerGroup.id,
            endpoint: "/api/inquiries",
            leadBackup: "crm_database_and_google_sheet_when_configured",
          },
        },
        {
          tenantId: tenant.id,
          provider: "stripe_connect",
          status: "setup_required",
          configPlaceholder: {
            payoutAdminEmail: payload.payoutAdminEmail,
            ownerGroupId: ownerGroup.id,
            livePaymentsEnabled: false,
            softwarePlan: payload.softwarePlan,
            addOnBundle: payload.addOnBundle,
            merchantFeeStrategy: payload.merchantFeeStrategy,
            platformSurchargeDestination: "the_bee_suite_platform_account",
            schoolSetupStatus: payload.schoolSetup.status,
            note: "Each school must complete connected payout onboarding before parent checkout is enabled.",
          },
        },
        {
          tenantId: tenant.id,
          provider: "google_sheets_fte",
          status: "setup_required",
          configPlaceholder: {
            model: "rolling_fte_source",
            note: "Use one rolling FTE workbook or connect the future database-backed importer.",
          },
        },
        {
          tenantId: tenant.id,
          provider: "sendgrid_notifications",
          status: "platform_managed",
          configPlaceholder: {
            senderRequired: true,
            locationRoutingSupported: true,
          },
        },
      ],
    });

    const notification = await tx.notification.create({
      data: {
        userId: user.id,
        title: `Trial workspace ready: ${payload.brandName}`,
        body: `${centerName} is ready for profile setup, director school setup review, inquiry form install, center import, and payout onboarding.`,
        type: "Onboarding",
        priority: "high",
      },
      select: { id: true },
    });

    await tx.auditLog.create({
      data: {
        tenantId: tenant.id,
        centerId: center.id,
        userId: user.id,
        action: "onboarding.trial_workspace.created",
        resource: "Tenant",
        resourceId: tenant.id,
        metadata: {
          ...payload,
          brandId: brand.id,
          organizationId: organization.id,
          ownerGroupId: ownerGroup.id,
          centerId: center.id,
          userId: user.id,
          notificationId: notification.id,
          submittedAt,
        },
      },
    });

    return { tenant, brand, organization, ownerGroup, center, user, notification };
  });

  const authUser = await ensureSupabaseAuthUser({
    email: payload.workEmail,
    name: workspace.user.name,
  }).catch((error) => ({
    ok: false,
    created: false,
    error: error instanceof Error ? error.message : "Supabase auth user setup failed.",
  }));
  const passwordReset = await requestSupabasePasswordReset(payload.workEmail, resetRedirectUrl)
    .then((response) => ({ ok: response.ok, status: response.status }))
    .catch((error) => ({
      ok: false,
      error: error instanceof Error ? error.message : "Password reset email failed.",
    }));

  return {
    existingWorkspace: false,
    status: "trial_setup",
    notificationId: workspace.notification.id,
    tenantId: workspace.tenant.id,
    tenantName: workspace.tenant.name,
    tenantSlug: workspace.tenant.slug,
    brandId: workspace.brand.id,
    brandName: workspace.brand.name,
    ownerGroupId: workspace.ownerGroup.id,
    ownerGroupName: workspace.ownerGroup.name,
    ownerGroupType: workspace.ownerGroup.ownerType,
    accessScope: "OWNER_GROUP",
    organizationId: workspace.organization.id,
    organizationName: workspace.organization.name,
    centerId: workspace.center.id,
    centerName: workspace.center.name,
    schoolSetupStatus: payload.schoolSetup.status,
    userId: workspace.user.id,
    loginUrl,
    embedCode: getCenterInquiryEmbedCode({
      baseUrl,
      centerId: workspace.center.id,
      centerName: workspace.center.name,
      brandName: workspace.brand.name,
    }),
    auth: {
      user: authUser,
      passwordReset,
    },
  };
}

export async function POST(request: NextRequest) {
  const rate = checkRateLimit({
    key: `onboarding:${requestIp(request.headers)}`,
    limit: 10,
    windowMs: 60 * 60 * 1000,
  });
  if (!rate.ok) {
    return NextResponse.json(
      { ok: false, error: "Too many onboarding attempts. Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds(rate.resetAt)) } },
    );
  }

  const payload = normalizePayload((await request.json().catch(() => ({}))) as OnboardingPayload);
  const errors = validate(payload);

  if (Object.keys(errors).length) {
    return NextResponse.json({ ok: false, errors }, { status: 400 });
  }

  const workspace = await createTrialWorkspace(payload, request.url);

  const email = await sendOnboardingEmail(payload, workspace.notificationId, {
    tenantId: workspace.tenantId,
    centerId: workspace.centerId,
    loginUrl: workspace.loginUrl,
    status: workspace.status,
  }).catch((error) => ({
    ok: false,
    skipped: false,
    recipients: getNotificationRecipients().length,
    error: error instanceof Error ? error.message : "Onboarding notification email failed.",
  }));

  return NextResponse.json({
    ok: true,
    notificationId: workspace.notificationId,
    workspace,
    integrations: { email },
  });
}
