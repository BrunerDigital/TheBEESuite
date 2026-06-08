import { NextRequest, NextResponse } from "next/server";
import { Prisma, UserRole } from "@prisma/client";
import { canAccessAllCenters, getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const editableRoles = new Set<UserRole>([UserRole.PLATFORM_OWNER, UserRole.BRAND_ADMIN]);
const allowedFeatureFlags = new Set([
  "inquiry_crm",
  "online_registration",
  "fte_reporting",
  "attendance_kiosk",
  "teacher_portal",
  "parent_portal",
  "billing_payments",
  "documents_signatures",
  "messaging_sms_email",
  "compliance_medication",
  "marketing_automations",
  "ai_assistant",
]);

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function jsonObject(value: unknown): Prisma.InputJsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Prisma.InputJsonObject
    : {};
}

function hexColor(value: unknown, fallback: string) {
  const color = clean(value);
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color : fallback;
}

function bool(value: unknown) {
  return value === true || value === "true";
}

function intRange(value: unknown, fallback: number, min: number, max: number) {
  const number = Number.parseInt(clean(value) || String(value), 10);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(Math.max(number, min), max);
}

async function requireTenantControlAccess() {
  const user = await getCurrentUser();
  if (!user) {
    throw new Response(JSON.stringify({ ok: false, error: "Authentication is required." }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!editableRoles.has(user.role) || !canAccessAllCenters(user)) {
    throw new Response(JSON.stringify({ ok: false, error: "Platform or brand admin access is required." }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }
  return user;
}

async function defaultBrand(tenantId: string) {
  const brand = await prisma.brand.findFirst({
    where: { tenantId },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });
  if (!brand) throw new Error("No brand exists for this tenant.");
  return brand;
}

async function validateContainer(input: {
  tenantId: string;
  scopeType: string;
  brandId?: string;
  ownerGroupId?: string;
  centerId?: string;
}) {
  const scopeType = input.scopeType.toUpperCase() || "TENANT";
  let brandId: string | null = input.brandId || null;
  let organizationId: string | null = null;
  let ownerGroupId: string | null = input.ownerGroupId || null;
  let centerId: string | null = input.centerId || null;

  if (brandId) {
    const brand = await prisma.brand.findFirst({ where: { id: brandId, tenantId: input.tenantId }, select: { id: true } });
    if (!brand) throw new Error("Brand is not available in this tenant.");
  }

  if (scopeType === "BRAND") {
    if (!brandId) brandId = (await defaultBrand(input.tenantId)).id;
  } else if (scopeType === "OWNER_GROUP") {
    if (!ownerGroupId) throw new Error("Owner group is required for owner-group branding.");
    const group = await prisma.ownerGroup.findFirst({
      where: { id: ownerGroupId, tenantId: input.tenantId },
      select: { id: true, brandId: true, organizationId: true },
    });
    if (!group) throw new Error("Owner group is not available in this tenant.");
    brandId = brandId ?? group.brandId;
    organizationId = group.organizationId;
  } else if (scopeType === "CENTER") {
    if (!centerId) throw new Error("Center is required for school-level branding.");
    const center = await prisma.center.findFirst({
      where: { id: centerId, organization: { tenantId: input.tenantId } },
      select: { id: true, ownerGroupId: true, organizationId: true, organization: { select: { brandId: true } } },
    });
    if (!center) throw new Error("Center is not available in this tenant.");
    brandId = brandId ?? center.organization.brandId;
    organizationId = center.organizationId;
    ownerGroupId = ownerGroupId ?? center.ownerGroupId;
  } else {
    ownerGroupId = null;
    centerId = null;
  }

  return { scopeType, brandId, organizationId, ownerGroupId, centerId };
}

async function ensureTenantCustomization(tenantId: string) {
  const existing = await prisma.brandCustomization.findFirst({
    where: { tenantId, scopeType: "TENANT", centerId: null, ownerGroupId: null },
    orderBy: { createdAt: "asc" },
    select: { id: true, customCss: true, brandName: true },
  });
  if (existing) return existing;

  const [brand, tenant] = await Promise.all([
    defaultBrand(tenantId),
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
  ]);

  return prisma.brandCustomization.create({
    data: {
      tenantId,
      brandId: brand.id,
      scopeType: "TENANT",
      brandName: brand.name || tenant?.name || "The BEE Suite",
      primaryColor: "#f5b51b",
      accentColor: "#10b981",
      themeMode: "dark",
      customCss: { featureFlags: {} },
    },
    select: { id: true, customCss: true, brandName: true },
  });
}

function normalizeFeatureFlags(value: unknown): Prisma.InputJsonObject {
  const input = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return Object.fromEntries(
    Object.entries(input)
      .filter(([key]) => allowedFeatureFlags.has(key))
      .map(([key, raw]) => {
        const row = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
        return [
          key,
          {
            enabled: bool(row.enabled),
            rollout: clean(row.rollout) || (bool(row.enabled) ? "pilot" : "disabled"),
            note: clean(row.note) || null,
            updatedAt: new Date().toISOString(),
          },
        ];
      }),
  ) as Prisma.InputJsonObject;
}

async function supportTargetLabel(tenantId: string, targetScope: string, targetId: string) {
  if (!targetId) return targetScope || "Tenant";
  if (targetScope === "center") {
    const center = await prisma.center.findFirst({
      where: { id: targetId, organization: { tenantId } },
      select: { name: true, crmLocationId: true },
    });
    if (!center) throw new Error("Support target school is not available in this tenant.");
    return center.crmLocationId ?? center.name;
  }
  if (targetScope === "ownerGroup") {
    const group = await prisma.ownerGroup.findFirst({ where: { id: targetId, tenantId }, select: { name: true } });
    if (!group) throw new Error("Support target owner group is not available in this tenant.");
    return group.name;
  }
  return "Tenant";
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireTenantControlAccess();
    const body = await request.json().catch(() => ({}));
    const action = clean(body.action);

    if (action === "saveCustomization") {
      const id = clean(body.id);
      const scope = await validateContainer({
        tenantId: user.tenantId,
        scopeType: clean(body.scopeType) || "TENANT",
        brandId: clean(body.brandId),
        ownerGroupId: clean(body.ownerGroupId),
        centerId: clean(body.centerId),
      });
      const brandName = clean(body.brandName);
      if (!brandName) return NextResponse.json({ ok: false, error: "Brand name is required." }, { status: 400 });

      if (id) {
        const existing = await prisma.brandCustomization.findFirst({
          where: { id, tenantId: user.tenantId },
          select: { id: true, customCss: true },
        });
        if (!existing) return NextResponse.json({ ok: false, error: "Customization record was not found." }, { status: 404 });
      }

      const data = {
        ...scope,
        brandName,
        logoUrlPlaceholder: clean(body.logoUrlPlaceholder) || null,
        faviconUrlPlaceholder: clean(body.faviconUrlPlaceholder) || null,
        mascotUrlPlaceholder: clean(body.mascotUrlPlaceholder) || null,
        primaryColor: hexColor(body.primaryColor, "#f5b51b"),
        accentColor: hexColor(body.accentColor, "#10b981"),
        themeMode: clean(body.themeMode) || "dark",
        emailSenderPlaceholder: clean(body.emailSenderPlaceholder) || null,
        customDomainPlaceholder: clean(body.customDomainPlaceholder) || null,
        parentPortalName: clean(body.parentPortalName) || null,
        loginScreenTitle: clean(body.loginScreenTitle) || null,
        notificationFooterText: clean(body.notificationFooterText) || null,
        legalFooterText: clean(body.legalFooterText) || null,
        termsUrl: clean(body.termsUrl) || null,
        privacyUrl: clean(body.privacyUrl) || null,
      };
      const record = id
        ? await prisma.brandCustomization.update({ where: { id }, data })
        : await prisma.brandCustomization.create({ data: { tenantId: user.tenantId, ...data } });
      await writeAuditLog(user, {
        centerId: record.centerId,
        action: "tenant_controls.branding.saved",
        resource: "brandCustomization",
        resourceId: record.id,
        metadata: { scopeType: record.scopeType, brandName: record.brandName },
      });
      return NextResponse.json({ ok: true, record });
    }

    if (action === "saveFeatureFlags") {
      const requestedId = clean(body.customizationId);
      const customization = requestedId
        ? await prisma.brandCustomization.findFirst({
            where: { id: requestedId, tenantId: user.tenantId },
            select: { id: true, customCss: true, centerId: true },
          })
        : await ensureTenantCustomization(user.tenantId);
      if (!customization) return NextResponse.json({ ok: false, error: "Customization record was not found." }, { status: 404 });

      const existingCss = jsonObject(customization.customCss);
      const featureFlags = normalizeFeatureFlags(body.featureFlags);
      const record = await prisma.brandCustomization.update({
        where: { id: customization.id },
        data: {
          customCss: {
            ...existingCss,
            featureFlags,
          },
        },
      });
      await writeAuditLog(user, {
        centerId: record.centerId,
        action: "tenant_controls.feature_flags.saved",
        resource: "brandCustomization",
        resourceId: record.id,
        metadata: {
          enabledFlags: Object.entries(featureFlags)
            .filter(([, row]) => bool(jsonObject(row).enabled))
            .map(([key]) => key),
        },
      });
      return NextResponse.json({ ok: true, record });
    }

    if (action === "requestDomainVerification") {
      const id = clean(body.customizationId);
      const domain = clean(body.domain).toLowerCase();
      if (!id || !domain) return NextResponse.json({ ok: false, error: "Customization and domain are required." }, { status: 400 });
      if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) {
        return NextResponse.json({ ok: false, error: "Enter a valid domain name." }, { status: 400 });
      }
      const customization = await prisma.brandCustomization.findFirst({
        where: { id, tenantId: user.tenantId },
        select: { id: true, customCss: true, centerId: true },
      });
      if (!customization) return NextResponse.json({ ok: false, error: "Customization record was not found." }, { status: 404 });
      const verification = {
        domain,
        status: "pending_dns",
        txtRecordName: `_bee-suite.${domain}`,
        txtRecordValue: `bee-suite-verify-${customization.id.slice(-8)}`,
        requestedAt: new Date().toISOString(),
      };
      const record = await prisma.brandCustomization.update({
        where: { id },
        data: {
          customDomainPlaceholder: domain,
          customCss: {
            ...jsonObject(customization.customCss),
            domainVerification: verification,
          },
        },
      });
      await writeAuditLog(user, {
        centerId: record.centerId,
        action: "tenant_controls.domain_verification.requested",
        resource: "brandCustomization",
        resourceId: record.id,
        metadata: verification,
      });
      return NextResponse.json({ ok: true, record, verification });
    }

    if (action === "saveAsset") {
      const id = clean(body.id);
      const assetType = clean(body.assetType);
      if (!assetType) return NextResponse.json({ ok: false, error: "Asset type is required." }, { status: 400 });
      const scope = await validateContainer({
        tenantId: user.tenantId,
        scopeType: clean(body.scopeType) || "TENANT",
        brandId: clean(body.brandId),
        ownerGroupId: clean(body.ownerGroupId),
        centerId: clean(body.centerId),
      });
      if (id) {
        const existing = await prisma.brandAsset.findFirst({ where: { id, tenantId: user.tenantId }, select: { id: true } });
        if (!existing) return NextResponse.json({ ok: false, error: "Asset was not found." }, { status: 404 });
      }
      const data = {
        brandId: scope.brandId,
        ownerGroupId: scope.ownerGroupId,
        centerId: scope.centerId,
        assetType,
        url: clean(body.url) || null,
        storageKey: clean(body.storageKey) || null,
        altText: clean(body.altText) || null,
        metadata: { scopeType: scope.scopeType, updatedFromTenantControls: true },
      };
      if (!data.url && !data.storageKey) {
        return NextResponse.json({ ok: false, error: "Asset URL or storage key is required." }, { status: 400 });
      }
      const record = id
        ? await prisma.brandAsset.update({ where: { id }, data })
        : await prisma.brandAsset.create({ data: { tenantId: user.tenantId, ...data } });
      await writeAuditLog(user, {
        centerId: record.centerId,
        action: "tenant_controls.asset.saved",
        resource: "brandAsset",
        resourceId: record.id,
        metadata: { assetType: record.assetType, scopeType: scope.scopeType },
      });
      return NextResponse.json({ ok: true, record });
    }

    if (action === "requestSupportAccess") {
      const targetScope = clean(body.targetScope) || "tenant";
      const targetId = clean(body.targetId);
      const reason = clean(body.reason);
      if (!reason || reason.length < 12) {
        return NextResponse.json({ ok: false, error: "A clear support-access reason is required." }, { status: 400 });
      }
      const label = await supportTargetLabel(user.tenantId, targetScope, targetId);
      const metadata = {
        targetScope,
        targetId: targetId || null,
        targetLabel: label,
        reason,
        durationHours: intRange(body.durationHours, 2, 1, 24),
        emergency: bool(body.emergency),
        status: "requested",
        requestedAt: new Date().toISOString(),
        warning: "This request records intent only. It does not grant impersonation or bypass role scopes.",
      };
      await writeAuditLog(user, {
        action: "tenant_controls.support_access.requested",
        resource: "supportAccess",
        resourceId: targetId || user.tenantId,
        metadata,
      });
      return NextResponse.json({ ok: true, request: metadata });
    }

    return NextResponse.json({ ok: false, error: "Unsupported tenant control action." }, { status: 400 });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Tenant controls request failed." },
      { status: 500 },
    );
  }
}
