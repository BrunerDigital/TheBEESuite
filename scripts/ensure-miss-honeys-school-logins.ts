import "./load-env";
import { randomBytes } from "node:crypto";
import { createClient, type User as SupabaseUser } from "@supabase/supabase-js";
import { Prisma, PrismaClient, UserRole } from "@prisma/client";
import {
  buildPasswordResetTokenUrl,
  generateSupabasePasswordRecoveryLink,
  requestSupabasePasswordReset,
  verifySupabasePassword,
} from "@/lib/supabase-auth";
import { sendEmail } from "@/lib/integrations";
import { recordEmailDeliveryAttempt } from "@/lib/integration-deliveries";
import { CANONICAL_APP_BASE_URL } from "@/lib/public-app-url";

const prisma = new PrismaClient();

const TENANT_NAME = "Miss Honey's Learning Center";
const TENANT_SLUG = "miss-honeys-learning-center";
const OWNER_GROUP_NAME = "Miss Honey's Learning Center Ownership";
const OWNER_GROUP_SLUG = "miss-honeys-learning-center-ownership";
const LOGO_URL = "/brand/miss-honeys-learning-center/logo-transparent.png";
const SOURCE = "miss_honeys_school_provisioning_2026_07_27";

const schools = [
  {
    key: "centennial",
    name: "Miss Honey's Learning Center - Centennial",
    email: "centennial@misshoneyslearningcenter.com",
    crmLocationId: "CO | Centennial",
    locationId: "mhlc-centennial-co",
    address: "9034 E Mineral Ave",
    city: "Centennial",
    state: "CO",
    postalCode: "80112",
    licensedCapacity: 93,
    timezone: "America/Denver",
    sourceUrl: "https://misshoneyslearningcenter.com/locations/centennial-co/",
  },
  {
    key: "lincolnton",
    name: "Miss Honey's Learning Center - Lincolnton",
    email: "lincolnton@misshoneyslearningcenter.com",
    crmLocationId: "NC | Lincolnton",
    locationId: "mhlc-lincolnton-nc",
    address: "310 Lithia Inn Rd",
    city: "Lincolnton",
    state: "NC",
    postalCode: "28092",
    licensedCapacity: 0,
    timezone: "America/New_York",
    sourceUrl: "https://misshoneyslearningcenter.com/locations/lincolnton-nc/",
  },
  {
    key: "lyons",
    name: "Miss Honey's Onion Sprouts - Lyons",
    email: "lyons@misshoneyslearningcenter.com",
    legacyEmails: ["onionsprouts@misshoneyslearningcenter.com"],
    crmLocationId: "GA | Lyons - Onion Sprouts",
    locationId: "mhlc-onion-sprouts-lyons-ga",
    address: "113 Moody Circle",
    city: "Lyons",
    state: "GA",
    postalCode: "30436",
    licensedCapacity: 0,
    timezone: "America/New_York",
    sourceUrl: "https://misshoneyslearningcenter.com/locations/lyons-ga-onion-sprouts/",
  },
  {
    key: "cuzco",
    name: "Miss Honey's Learning Center - Cuzco",
    email: "cuzco@misshoneyslearningcenter.com",
    crmLocationId: "Cuzco",
    locationId: "mhlc-cuzco",
    address: null,
    city: null,
    state: null,
    postalCode: null,
    licensedCapacity: 0,
    timezone: "America/New_York",
    sourceUrl: null,
  },
] as const;

type School = (typeof schools)[number];

function schoolEmailCandidates(school: School) {
  return [
    school.email,
    ...("legacyEmails" in school ? school.legacyEmails : []),
  ];
}

function initialPasswordForSchool(school: School) {
  if (school.key === "lincolnton") {
    return process.env.MHLC_LINCOLNTON_INITIAL_PASSWORD?.trim();
  }
  if (school.key === "lyons") {
    return process.env.MHLC_LYONS_INITIAL_PASSWORD?.trim();
  }
  if (school.key === "cuzco") {
    return process.env.MHLC_CUZCO_INITIAL_PASSWORD?.trim();
  }
  return undefined;
}

function objectJson(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, Prisma.JsonValue>
    : {};
}

async function main() {
  const requestedSchoolKeys = new Set(
    (process.env.MHLC_ONLY_SCHOOLS ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
  const selectedSchools = requestedSchoolKeys.size
    ? schools.filter((school) => requestedSchoolKeys.has(school.key))
    : schools;
  if (selectedSchools.length !== (requestedSchoolKeys.size || schools.length)) {
    throw new Error("MHLC_ONLY_SCHOOLS contains an unknown school key.");
  }

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase URL and service-role credentials are required.");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  async function findAuthUserByEmail(email: string) {
    for (let page = 1; page <= 20; page += 1) {
      const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) throw error;
      const user = data.users.find((candidate) => candidate.email?.toLowerCase() === email);
      if (user) return user;
      if (data.users.length < 1000) break;
    }
    return null;
  }

  const startedAt = new Date();
  const workspace = await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.upsert({
      where: { slug: TENANT_SLUG },
      update: { name: TENANT_NAME },
      create: { name: TENANT_NAME, slug: TENANT_SLUG },
    });

    const brand = await tx.brand.upsert({
      where: { tenantId_slug: { tenantId: tenant.id, slug: TENANT_SLUG } },
      update: { name: TENANT_NAME },
      create: { tenantId: tenant.id, name: TENANT_NAME, slug: TENANT_SLUG },
    });

    const existingOrganization = await tx.organization.findFirst({
      where: { tenantId: tenant.id, name: TENANT_NAME },
    });
    const organization = existingOrganization
      ? await tx.organization.update({
          where: { id: existingOrganization.id },
          data: { brandId: brand.id },
        })
      : await tx.organization.create({
          data: { tenantId: tenant.id, brandId: brand.id, name: TENANT_NAME },
        });

    const ownerGroup = await tx.ownerGroup.upsert({
      where: { tenantId_slug: { tenantId: tenant.id, slug: OWNER_GROUP_SLUG } },
      update: {
        brandId: brand.id,
        organizationId: organization.id,
        name: OWNER_GROUP_NAME,
        ownerType: "multi_location_operator",
        status: "active",
      },
      create: {
        tenantId: tenant.id,
        brandId: brand.id,
        organizationId: organization.id,
        name: OWNER_GROUP_NAME,
        slug: OWNER_GROUP_SLUG,
        ownerType: "multi_location_operator",
        status: "active",
        customFields: {
          source: SOURCE,
          dashboardProvisionedAt: startedAt.toISOString(),
        },
      },
    });

    await tx.whiteLabelSettings.upsert({
      where: { brandId: brand.id },
      update: {
        brandName: TENANT_NAME,
        logoUrlPlaceholder: LOGO_URL,
        faviconUrlPlaceholder: LOGO_URL,
        primaryColor: "#3B1C00",
        accentColor: "#D99A45",
        themeMode: "dark",
        emailSenderPlaceholder: "hello@misshoneyslearningcenter.com",
        legalFooterText: `${TENANT_NAME} childcare operations powered by The BEE Suite.`,
      },
      create: {
        brandId: brand.id,
        brandName: TENANT_NAME,
        logoUrlPlaceholder: LOGO_URL,
        faviconUrlPlaceholder: LOGO_URL,
        primaryColor: "#3B1C00",
        accentColor: "#D99A45",
        themeMode: "dark",
        emailSenderPlaceholder: "hello@misshoneyslearningcenter.com",
        customDomainPlaceholder: "",
        legalFooterText: `${TENANT_NAME} childcare operations powered by The BEE Suite.`,
      },
    });

    const brandCustomization = await tx.brandCustomization.findFirst({
      where: {
        tenantId: tenant.id,
        brandId: brand.id,
        organizationId: organization.id,
        scopeType: "BRAND",
        ownerGroupId: null,
        centerId: null,
      },
    });
    const brandCustomizationData = {
      brandName: TENANT_NAME,
      logoUrlPlaceholder: LOGO_URL,
      faviconUrlPlaceholder: LOGO_URL,
      mascotUrlPlaceholder: "/mr-bee.png",
      primaryColor: "#3B1C00",
      accentColor: "#D99A45",
      themeMode: "dark",
      emailSenderPlaceholder: "hello@misshoneyslearningcenter.com",
      customDomainPlaceholder: "",
      parentPortalName: `${TENANT_NAME} Family Portal`,
      loginScreenTitle: `${TENANT_NAME} operations workspace`,
      notificationFooterText: `Sent from ${TENANT_NAME} through The BEE Suite.`,
      legalFooterText: `${TENANT_NAME} childcare operations powered by The BEE Suite.`,
    };
    if (brandCustomization) {
      await tx.brandCustomization.update({
        where: { id: brandCustomization.id },
        data: brandCustomizationData,
      });
    } else {
      await tx.brandCustomization.create({
        data: {
          tenantId: tenant.id,
          brandId: brand.id,
          organizationId: organization.id,
          scopeType: "BRAND",
          ...brandCustomizationData,
        },
      });
    }

    for (const asset of [
      { assetType: "logo", url: LOGO_URL, altText: `${TENANT_NAME} logo` },
      { assetType: "favicon", url: LOGO_URL, altText: `${TENANT_NAME} mark` },
      { assetType: "mascot", url: "/mr-bee.png", altText: "Mr. Bee AI assistant" },
    ]) {
      const existing = await tx.brandAsset.findFirst({
        where: {
          tenantId: tenant.id,
          brandId: brand.id,
          ownerGroupId: null,
          centerId: null,
          assetType: asset.assetType,
        },
      });
      const data = {
        ...asset,
        metadata: { source: SOURCE, scope: "brand" },
      };
      if (existing) {
        await tx.brandAsset.update({ where: { id: existing.id }, data });
      } else {
        await tx.brandAsset.create({
          data: { tenantId: tenant.id, brandId: brand.id, ...data },
        });
      }
    }

    const provisionedSchools = [];
    for (const school of selectedSchools) {
      const emailCandidates = schoolEmailCandidates(school);
      const existingCenter = await tx.center.findFirst({
        where: {
          organizationId: organization.id,
          OR: [
            { email: { in: emailCandidates } },
            { locationId: school.locationId },
            { crmLocationId: school.crmLocationId },
          ],
        },
      });
      const centerData = {
        organizationId: organization.id,
        ownerGroupId: ownerGroup.id,
        name: school.name,
        crmLocationId: school.crmLocationId,
        locationId: school.locationId,
        address: school.address,
        city: school.city,
        state: school.state,
        postalCode: school.postalCode,
        email: school.email,
        status: "trial_setup",
        sourceSystem: SOURCE,
        externalId: school.locationId,
        licensedCapacity: school.licensedCapacity,
        timezone: school.timezone,
      };
      const existingFields = objectJson(existingCenter?.customFields);
      const customFields = {
        ...existingFields,
        source: SOURCE,
        dashboardProvisionedAt: existingFields.dashboardProvisionedAt ?? startedAt.toISOString(),
        setupStatus: "dashboard_login_ready",
        sourceLocationUrl: school.sourceUrl,
        licensedCapacityVerificationRequired: school.licensedCapacity === 0,
        addressVerificationRequired: !school.address,
        timezoneVerificationRequired: school.key === "cuzco",
        phoneVerificationRequired: true,
        parentInvitationsEnabled: false,
        kioskEnabled: false,
        livePaymentsEnabled: false,
        tuitionBillingEnabled: false,
        publicInquiryEmbedEnabled: false,
      } satisfies Prisma.InputJsonObject;
      const center = existingCenter
        ? await tx.center.update({
            where: { id: existingCenter.id },
            data: {
              ...centerData,
              status: existingCenter.status === "active" ? "active" : centerData.status,
              customFields,
            },
          })
        : await tx.center.create({ data: { ...centerData, customFields } });

      const centerCustomization = await tx.brandCustomization.findFirst({
        where: {
          tenantId: tenant.id,
          brandId: brand.id,
          organizationId: organization.id,
          ownerGroupId: ownerGroup.id,
          centerId: center.id,
          scopeType: "CENTER",
        },
      });
      const centerCustomizationData = {
        brandName: school.name,
        logoUrlPlaceholder: LOGO_URL,
        faviconUrlPlaceholder: LOGO_URL,
        mascotUrlPlaceholder: "/mr-bee.png",
        primaryColor: "#3B1C00",
        accentColor: "#D99A45",
        themeMode: "dark",
        emailSenderPlaceholder: school.email,
        parentPortalName: `${school.name} Family Portal`,
        loginScreenTitle: `${school.name} operations workspace`,
        notificationFooterText: `Sent from ${school.name} through The BEE Suite.`,
        legalFooterText: `${school.name} childcare operations powered by The BEE Suite.`,
      };
      if (centerCustomization) {
        await tx.brandCustomization.update({
          where: { id: centerCustomization.id },
          data: centerCustomizationData,
        });
      } else {
        await tx.brandCustomization.create({
          data: {
            tenantId: tenant.id,
            brandId: brand.id,
            organizationId: organization.id,
            ownerGroupId: ownerGroup.id,
            centerId: center.id,
            scopeType: "CENTER",
            ...centerCustomizationData,
          },
        });
      }

      const existingUsers = await tx.user.findMany({
        where: { email: { in: emailCandidates } },
      });
      if (existingUsers.length > 1) {
        throw new Error(`${school.email} has multiple current or legacy application users.`);
      }
      const existingUser = existingUsers[0];
      if (existingUser && existingUser.tenantId !== tenant.id) {
        throw new Error(`${school.email} is already assigned to another tenant.`);
      }
      const requestedInitialPassword = initialPasswordForSchool(school);
      const user = existingUser
        ? await tx.user.update({
            where: { id: existingUser.id },
            data: {
              organizationId: organization.id,
              email: school.email,
              name: `${school.name} Director`,
              role: UserRole.CENTER_DIRECTOR,
              isActive: true,
              mustResetPassword: !requestedInitialPassword,
            },
          })
        : await tx.user.create({
            data: {
              tenantId: tenant.id,
              organizationId: organization.id,
              email: school.email,
              name: `${school.name} Director`,
              role: UserRole.CENTER_DIRECTOR,
              isActive: true,
              mustResetPassword: !requestedInitialPassword,
              customFields: {
                source: SOURCE,
                schoolLogin: true,
                passwordSetupStatus: "recovery_email_required",
              },
            },
          });

      await tx.userAccessGrant.updateMany({
        where: {
          userId: user.id,
          tenantId: tenant.id,
          isActive: true,
          NOT: { centerId: center.id, scopeType: "CENTER", role: UserRole.CENTER_DIRECTOR },
        },
        data: { isActive: false },
      });
      const existingGrant = await tx.userAccessGrant.findFirst({
        where: {
          userId: user.id,
          tenantId: tenant.id,
          brandId: brand.id,
          organizationId: organization.id,
          ownerGroupId: ownerGroup.id,
          centerId: center.id,
          role: UserRole.CENTER_DIRECTOR,
          scopeType: "CENTER",
        },
      });
      const permissions = {
        source: SOURCE,
        canManageSchoolOperations: true,
        billingActivationRequired: true,
        parentInvitationActivationRequired: true,
        kioskActivationRequired: true,
      };
      const grant = existingGrant
        ? await tx.userAccessGrant.update({
            where: { id: existingGrant.id },
            data: { isActive: true, permissions },
          })
        : await tx.userAccessGrant.create({
            data: {
              userId: user.id,
              tenantId: tenant.id,
              brandId: brand.id,
              organizationId: organization.id,
              ownerGroupId: ownerGroup.id,
              centerId: center.id,
              role: UserRole.CENTER_DIRECTOR,
              scopeType: "CENTER",
              permissions,
            },
          });

      const priorAudit = await tx.auditLog.findFirst({
        where: {
          tenantId: tenant.id,
          centerId: center.id,
          userId: user.id,
          action: "miss_honeys.school_dashboard.provisioned",
          resource: "Center",
          resourceId: center.id,
        },
      });
      if (!priorAudit) {
        await tx.auditLog.create({
          data: {
            tenantId: tenant.id,
            centerId: center.id,
            userId: user.id,
            action: "miss_honeys.school_dashboard.provisioned",
            resource: "Center",
            resourceId: center.id,
            metadata: {
              source: SOURCE,
              email: school.email,
              userId: user.id,
              grantId: grant.id,
              activationGates: {
                billing: "held_off",
                parentInvitations: "held_off",
                kiosk: "held_off",
                livePayments: "held_off",
              },
            },
          },
        });
      }

      provisionedSchools.push({ school, center, user, grant });
    }

    for (const integration of [
      {
        provider: "stripe_connect",
        status: "setup_required",
        configPlaceholder: { livePaymentsEnabled: false, activationRequired: true },
      },
      {
        provider: "sendgrid_notifications",
        status: "platform_managed",
        configPlaceholder: { locationRoutingSupported: true, senderVerificationRequired: true },
      },
      {
        provider: "google_sheets_fte",
        status: "setup_required",
        configPlaceholder: { activationRequired: true },
      },
    ]) {
      const existing = await tx.integration.findFirst({
        where: { tenantId: tenant.id, provider: integration.provider },
        select: { id: true },
      });
      const configPlaceholder = {
        ...integration.configPlaceholder,
        source: SOURCE,
      };
      if (existing) {
        await tx.integration.update({
          where: { id: existing.id },
          data: { status: integration.status, configPlaceholder },
          select: { id: true },
        });
      } else {
        await tx.integration.create({
          data: {
            tenantId: tenant.id,
            provider: integration.provider,
            status: integration.status,
            configPlaceholder,
          },
          select: { id: true },
        });
      }
    }

    return { tenant, brand, organization, ownerGroup, schools: provisionedSchools };
  }, {
    maxWait: 10_000,
    timeout: 60_000,
  });

  const appBaseUrl = CANONICAL_APP_BASE_URL;
  const resetRedirectUrl = `${CANONICAL_APP_BASE_URL}/reset-password`;
  const authResults = [];

  for (const entry of workspace.schools) {
    const email = entry.user.email.toLowerCase();
    const authCandidates = (
      await Promise.all(
        schoolEmailCandidates(entry.school).map((candidate) =>
          findAuthUserByEmail(candidate.toLowerCase())
        ),
      )
    ).filter((candidate): candidate is SupabaseUser => Boolean(candidate));
    if (authCandidates.length > 1) {
      throw new Error(`${email}: multiple current or legacy Supabase Auth users exist.`);
    }
    const existingAuthUser = authCandidates[0] ?? null;
    const requestedInitialPassword = initialPasswordForSchool(entry.school);
    if (entry.school.key === "cuzco" && !requestedInitialPassword) {
      throw new Error("MHLC_CUZCO_INITIAL_PASSWORD is required to provision the Cuzco login.");
    }
    const temporaryPassword = `${randomBytes(36).toString("base64url")}Aa1!`;
    const existingUserFields = objectJson(entry.user.customFields);
    const incompletePriorProvisioning = existingAuthUser?.user_metadata?.source === SOURCE
      && existingUserFields.passwordSetupStatus !== "recovery_email_sent";
    const shouldSetTemporaryPassword = !requestedInitialPassword
      && (!existingAuthUser || incompletePriorProvisioning);
    const passwordForVerification = requestedInitialPassword
      || (shouldSetTemporaryPassword ? temporaryPassword : undefined);
    const userMetadata = {
      ...(existingAuthUser?.user_metadata ?? {}),
      name: entry.user.name,
      source: SOURCE,
    };
    const appMetadata = {
      ...(existingAuthUser?.app_metadata ?? {}),
      bee_suite_role: UserRole.CENTER_DIRECTOR,
      bee_suite_tenant_id: workspace.tenant.id,
      bee_suite_brand_id: workspace.brand.id,
      bee_suite_organization_id: workspace.organization.id,
      bee_suite_owner_group_id: workspace.ownerGroup.id,
      bee_suite_center_ids: [entry.center.id],
    };

    let authUser: SupabaseUser;
    let created = false;
    if (existingAuthUser) {
      const { data, error } = await supabase.auth.admin.updateUserById(existingAuthUser.id, {
        email,
        ...(passwordForVerification ? { password: passwordForVerification } : {}),
        email_confirm: true,
        user_metadata: userMetadata,
        app_metadata: appMetadata,
        ban_duration: "none",
      });
      if (error) throw new Error(`${email}: ${error.message}`);
      authUser = data.user;
    } else {
      const { data, error } = await supabase.auth.admin.createUser({
        email,
        password: passwordForVerification ?? temporaryPassword,
        email_confirm: true,
        user_metadata: userMetadata,
        app_metadata: appMetadata,
      });
      if (error) throw new Error(`${email}: ${error.message}`);
      authUser = data.user;
      created = true;
    }

    let supabasePasswordVerified = false;
    let publicLoginVerified = false;
    let publicLoginRequiresPasswordReset = false;
    if (passwordForVerification) {
      supabasePasswordVerified = await verifySupabasePassword(email, passwordForVerification);
      const loginResponse = await fetch(`${appBaseUrl}/api/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "BeeSuite-Provisioning-Verification/1.0",
        },
        body: JSON.stringify({
          email,
          password: passwordForVerification,
          loginPortal: "director",
          appMode: "web",
          deviceLabel: "Provisioning verification",
        }),
        signal: AbortSignal.timeout(20_000),
      });
      const loginBody = await loginResponse.json().catch(() => ({})) as {
        ok?: boolean;
        requiresPasswordReset?: boolean;
      };
      publicLoginVerified = loginResponse.ok && loginBody.ok === true;
      publicLoginRequiresPasswordReset = loginBody.requiresPasswordReset === true;
      const expectedPasswordReset = !requestedInitialPassword;
      if (!publicLoginVerified || publicLoginRequiresPasswordReset !== expectedPasswordReset) {
        throw new Error(`${email}: public login verification failed.`);
      }
    }

    let passwordSetupEmailAccepted = Boolean(requestedInitialPassword)
      || existingUserFields.passwordSetupStatus === "recovery_email_sent";
    let passwordSetupDeliveryMethod = requestedInitialPassword
      ? "user_provided_initial_password"
      : typeof existingUserFields.passwordSetupDeliveryMethod === "string"
        ? existingUserFields.passwordSetupDeliveryMethod
        : "already_sent";
    if (!passwordSetupEmailAccepted) {
      const resetResponse = await requestSupabasePasswordReset(email, resetRedirectUrl);
      if (resetResponse.ok) {
        passwordSetupEmailAccepted = true;
        passwordSetupDeliveryMethod = "supabase_recovery_email";
      } else if (resetResponse.status === 429) {
        const recovery = await generateSupabasePasswordRecoveryLink({
          email,
          redirectTo: resetRedirectUrl,
        });
        if (!recovery.ok) {
          throw new Error(`${email}: ${recovery.error}`);
        }
        const setupUrl = buildPasswordResetTokenUrl({
          tokenHash: recovery.tokenHash,
          appBaseUrl,
        });
        const safeSetupUrl = setupUrl.replaceAll("&", "&amp;");
        const delivery = await sendEmail({
          tenantId: workspace.tenant.id,
          to: [email],
          fromName: TENANT_NAME,
          subject: `Set up your ${TENANT_NAME} dashboard password`,
          text: [
            `Your ${entry.center.name} dashboard is ready.`,
            "",
            "Use this secure one-time link to create your password:",
            setupUrl,
            "",
            "After setting your password, sign in at https://thebeesuite.io/login.",
            "If you did not expect this account, you can ignore this message.",
          ].join("\n"),
          html: [
            `<p>Your ${entry.center.name} dashboard is ready.</p>`,
            `<p><a href="${safeSetupUrl}">Create your secure password</a></p>`,
            `<p>After setting your password, sign in at <a href="${appBaseUrl}/login">${appBaseUrl}/login</a>.</p>`,
            "<p>If you did not expect this account, you can ignore this message.</p>",
          ].join(""),
          categories: ["account_setup", "miss_honeys"],
          customArgs: {
            purpose: "school_dashboard_password_setup",
            tenantId: workspace.tenant.id,
            centerId: entry.center.id,
            userId: entry.user.id,
          },
          disableClickTracking: true,
        });
        await recordEmailDeliveryAttempt({
          tenantId: workspace.tenant.id,
          centerId: entry.center.id,
          dedupeKey: `school-dashboard-password-setup:${entry.user.id}`,
          purpose: "account_setup_email",
          to: [email],
          subject: `Set up your ${TENANT_NAME} dashboard password`,
          text: "Secure one-time school dashboard password setup link.",
          result: delivery,
          maxAttempts: 1,
          metadata: { userId: entry.user.id, source: SOURCE },
        });
        if (!delivery.ok) {
          throw new Error(`${email}: ${delivery.error || "SendGrid password setup delivery failed."}`);
        }
        passwordSetupEmailAccepted = true;
        passwordSetupDeliveryMethod = "sendgrid_admin_recovery_link";
      } else {
        throw new Error(`${email}: password setup email returned ${resetResponse.status}.`);
      }
    }

    const userFields = objectJson(entry.user.customFields);
    await prisma.user.update({
      where: { id: entry.user.id },
      data: {
        mustResetPassword: !requestedInitialPassword,
        customFields: {
          ...userFields,
          source: SOURCE,
          schoolLogin: true,
          passwordSetupStatus: requestedInitialPassword ? "initial_password_set" : "recovery_email_sent",
          passwordSetupEmailAcceptedAt: new Date().toISOString(),
          passwordSetupDeliveryMethod,
        },
      },
    });

    const verificationSessions = await prisma.deviceSession.findMany({
      where: {
        userId: entry.user.id,
        createdAt: { gte: startedAt },
        label: "Provisioning verification",
        revokedAt: null,
      },
      select: { id: true },
    });
    if (verificationSessions.length) {
      await prisma.deviceSession.updateMany({
        where: { id: { in: verificationSessions.map((session) => session.id) } },
        data: { revokedAt: new Date(), revokedById: entry.user.id },
      });
    }

    await prisma.auditLog.create({
      data: {
        tenantId: workspace.tenant.id,
        centerId: entry.center.id,
        userId: entry.user.id,
        action: "miss_honeys.school_login.auth_verified",
        resource: "User",
        resourceId: entry.user.id,
        metadata: {
          source: SOURCE,
          email,
          authUserId: authUser.id,
          authCreated: created,
          emailConfirmed: Boolean(authUser.email_confirmed_at),
          supabasePasswordVerified,
          publicLoginVerified,
          publicLoginRequiresPasswordReset,
          initialPasswordConfigured: Boolean(requestedInitialPassword),
          passwordSetupEmailAccepted,
          passwordSetupDeliveryMethod,
          verificationSessionsRevoked: verificationSessions.length,
        },
      },
    });

    authResults.push({
      email,
      authCreated: created,
      emailConfirmed: Boolean(authUser.email_confirmed_at),
      supabasePasswordVerified: passwordForVerification ? supabasePasswordVerified : "existing_auth_not_rotated",
      publicLoginVerified: passwordForVerification ? publicLoginVerified : "existing_auth_not_rotated",
      passwordSetupEmailAccepted,
      passwordSetupDeliveryMethod,
      verificationSessionsRevoked: verificationSessions.length,
    });
  }

  const verifiedUsers = await prisma.user.findMany({
    where: { email: { in: selectedSchools.map((school) => school.email) } },
    include: {
      tenant: { select: { name: true, slug: true } },
      organization: { select: { name: true, brand: { include: { settings: true } } } },
      accessGrants: {
        where: { isActive: true },
        include: { center: true },
      },
    },
    orderBy: { email: "asc" },
  });
  const verifiedAuth = await Promise.all(
    verifiedUsers.map((user) => findAuthUserByEmail(user.email.toLowerCase())),
  );
  const failures = verifiedUsers.flatMap((user, index) => {
    const grant = user.accessGrants.find(
      (candidate) =>
        candidate.role === UserRole.CENTER_DIRECTOR
        && candidate.scopeType === "CENTER"
        && candidate.centerId,
    );
    const authUser = verifiedAuth[index];
    const authCenterIds = Array.isArray(authUser?.app_metadata?.bee_suite_center_ids)
      ? authUser.app_metadata.bee_suite_center_ids
      : [];
    const ok = user.tenant.slug === TENANT_SLUG
      && user.organization?.brand?.slug === TENANT_SLUG
      && user.organization.brand.settings?.brandName === TENANT_NAME
      && user.isActive
      && user.mustResetPassword === !initialPasswordForSchool(
        selectedSchools.find((school) => school.email === user.email)!,
      )
      && Boolean(grant?.center)
      && Boolean(authUser?.email_confirmed_at)
      && authUser?.app_metadata?.bee_suite_role === UserRole.CENTER_DIRECTOR
      && authUser?.app_metadata?.bee_suite_tenant_id === user.tenantId
      && Boolean(grant?.centerId && authCenterIds.includes(grant.centerId));
    return ok ? [] : [user.email];
  });
  if (verifiedUsers.length !== selectedSchools.length || failures.length) {
    throw new Error(`Final access verification failed for: ${failures.join(", ") || "missing users"}`);
  }

  console.log(JSON.stringify({
    ok: true,
    tenant: {
      name: workspace.tenant.name,
      slug: workspace.tenant.slug,
      brand: workspace.brand.name,
      organization: workspace.organization.name,
      ownerGroup: workspace.ownerGroup.name,
    },
    schools: verifiedUsers.map((user) => {
      const grant = user.accessGrants.find((candidate) => candidate.center);
      return {
        email: user.email,
        role: user.role,
        center: grant?.center?.name,
        location: grant?.center?.crmLocationId,
        centerStatus: grant?.center?.status,
        dashboardAccess: grant?.isActive === true,
        mustCompletePasswordSetup: user.mustResetPassword,
      };
    }),
    auth: authResults,
    heldOff: [
      "billing activation",
      "live payments",
      "parent invitations",
      "kiosk activation",
      "public inquiry embed activation",
    ],
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
