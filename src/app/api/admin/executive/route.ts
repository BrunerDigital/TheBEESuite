import { NextRequest, NextResponse } from "next/server";
import { Prisma, UserRole } from "@prisma/client";
import { canAccessAllCenters, canAccessCenter, canManageOperations, getCurrentUser } from "@/lib/auth";
import { type AccessGrantTarget } from "@/lib/access-grant-guardrails";
import { prisma } from "@/lib/prisma";
import {
  getPasswordResetRedirectUrl,
  requestSupabasePasswordReset,
  upsertSupabaseAuthUserWithPassword,
} from "@/lib/supabase-auth";

export const runtime = "nodejs";

type Payload = {
  action?: unknown;
  centerId?: unknown;
  ownerGroupId?: unknown;
  organizationId?: unknown;
  name?: unknown;
  crmLocationId?: unknown;
  locationId?: unknown;
  address?: unknown;
  city?: unknown;
  state?: unknown;
  postalCode?: unknown;
  phone?: unknown;
  email?: unknown;
  status?: unknown;
  licensedCapacity?: unknown;
  ownerType?: unknown;
  billingEmail?: unknown;
  contactName?: unknown;
  role?: unknown;
  title?: unknown;
  password?: unknown;
  accessScopeType?: unknown;
  sendPasswordReset?: unknown;
};

const editableCenterStatuses = new Set(["active", "trial_setup", "paused", "closed"]);
const assignableRoles = new Set<UserRole>([
  UserRole.BRAND_ADMIN,
  UserRole.REGIONAL_MANAGER,
  UserRole.CENTER_DIRECTOR,
  UserRole.ASSISTANT_DIRECTOR,
  UserRole.TEACHER,
  UserRole.BILLING_ADMIN,
  UserRole.READ_ONLY_AUDITOR,
]);
const classroomStaffProfileRoles = new Set<UserRole>([
  UserRole.TEACHER,
]);
const tenantAccessRoles = new Set<UserRole>([
  UserRole.BRAND_ADMIN,
  UserRole.REGIONAL_MANAGER,
  UserRole.READ_ONLY_AUDITOR,
]);

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function parseCapacity(value: unknown) {
  const parsed = Number.parseInt(clean(value), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || `owner-${Date.now()}`;
}

async function requireExecutiveAccess() {
  const user = await getCurrentUser();
  if (!user) {
    throw new Response(JSON.stringify({ ok: false, error: "Authentication is required." }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!canManageOperations(user) || !canAccessAllCenters(user) || user.role === UserRole.READ_ONLY_AUDITOR) {
    throw new Response(JSON.stringify({ ok: false, error: "Executive admin access is required." }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }
  return user;
}

async function getDefaultOrganization(tenantId: string, preferredOrganizationId?: string | null) {
  const organization = await prisma.organization.findFirst({
    where: {
      tenantId,
      ...(preferredOrganizationId ? { id: preferredOrganizationId } : {}),
    },
    orderBy: { createdAt: "asc" },
    include: { brand: { select: { id: true, name: true, settings: true } } },
  });
  if (organization) return organization;

  const fallback = await prisma.organization.findFirst({
    where: { tenantId },
    orderBy: { createdAt: "asc" },
    include: { brand: { select: { id: true, name: true, settings: true } } },
  });
  if (!fallback) throw new Error("No organization is available for this tenant.");
  return fallback;
}

async function getOwnerGroup(tenantId: string, organizationId: string, ownerGroupId?: string) {
  if (ownerGroupId) {
    const group = await prisma.ownerGroup.findFirst({ where: { id: ownerGroupId, tenantId } });
    if (!group) throw new Error("Owner group is not available in this tenant.");
    return group;
  }

  const existing = await prisma.ownerGroup.findFirst({
    where: { tenantId, organizationId, status: { not: "closed" } },
    orderBy: { createdAt: "asc" },
  });
  if (existing) return existing;

  return prisma.ownerGroup.create({
    data: {
      tenantId,
      organizationId,
      name: "Corporate and Franchise Network",
      slug: `corporate-franchise-network-${Date.now()}`,
      ownerType: "brand_network",
      status: "active",
      customFields: { createdFromExecutiveConsole: true },
    },
  });
}

async function ensureCenterCustomization(input: {
  tenantId: string;
  brandId?: string | null;
  organizationId: string;
  ownerGroupId?: string | null;
  centerId: string;
  brandName: string;
  email?: string | null;
  primaryColor?: string | null;
  accentColor?: string | null;
  themeMode?: string | null;
}) {
  const existing = await prisma.brandCustomization.findFirst({
    where: {
      tenantId: input.tenantId,
      centerId: input.centerId,
      scopeType: "CENTER",
    },
    select: { id: true },
  });

  const data = {
    brandName: input.brandName,
    emailSenderPlaceholder: input.email ?? null,
    primaryColor: input.primaryColor ?? "#f5b51b",
    accentColor: input.accentColor ?? "#10b981",
    themeMode: input.themeMode ?? "dark",
    legalFooterText: `${input.brandName} childcare operations powered by The Bee Suite.`,
  };

  if (existing) {
    await prisma.brandCustomization.update({ where: { id: existing.id }, data });
    return;
  }

  await prisma.brandCustomization.create({
    data: {
      tenantId: input.tenantId,
      brandId: input.brandId ?? null,
      organizationId: input.organizationId,
      ownerGroupId: input.ownerGroupId ?? null,
      centerId: input.centerId,
      scopeType: "CENTER",
      mascotUrlPlaceholder: "/mr-bee.png",
      ...data,
    },
  });
}

async function audit(input: {
  tenantId: string;
  centerId?: string | null;
  userId: string;
  action: string;
  resource: string;
  resourceId?: string | null;
  metadata?: Prisma.InputJsonValue;
}) {
  await prisma.auditLog.create({
    data: {
      tenantId: input.tenantId,
      centerId: input.centerId ?? null,
      userId: input.userId,
      action: input.action,
      resource: input.resource,
      resourceId: input.resourceId ?? null,
      metadata: input.metadata,
    },
  });
}

async function saveCenter(payload: Payload, actor: Awaited<ReturnType<typeof requireExecutiveAccess>>) {
  const centerId = clean(payload.centerId);
  const name = clean(payload.name);
  if (!name) throw new Error("Location name is required.");

  const organization = await getDefaultOrganization(actor.tenantId, clean(payload.organizationId) || actor.organizationId);
  const ownerGroup = await getOwnerGroup(actor.tenantId, organization.id, clean(payload.ownerGroupId));
  const crmLocationId = clean(payload.crmLocationId);
  const locationId = clean(payload.locationId) || crmLocationId;
  const email = clean(payload.email).toLowerCase();
  const status = clean(payload.status) || "active";
  if (!editableCenterStatuses.has(status)) throw new Error("Unsupported location status.");
  if (email && !isEmail(email)) throw new Error("A valid location email is required.");

  if (centerId) {
    const existingCenter = await prisma.center.findFirst({
      where: { id: centerId, organization: { tenantId: actor.tenantId } },
      select: { id: true },
    });
    if (!existingCenter) throw new Error("Center not found.");
    if (!canAccessCenter(actor, centerId)) throw new Error("You do not have access to update this center.");
  }

  if (crmLocationId || locationId) {
    const existing = await prisma.center.findFirst({
      where: {
        organization: { tenantId: actor.tenantId },
        status: { not: "closed" },
        ...(centerId ? { NOT: { id: centerId } } : {}),
        OR: [
          crmLocationId ? { crmLocationId } : undefined,
          locationId ? { locationId } : undefined,
        ].filter(Boolean) as Prisma.CenterWhereInput[],
      },
      select: { id: true, name: true },
    });
    if (existing) throw new Error(`A live location already uses that ID: ${existing.name}`);
  }

  const data = {
    organizationId: organization.id,
    ownerGroupId: ownerGroup.id,
    name,
    crmLocationId: crmLocationId || null,
    locationId: locationId || null,
    address: clean(payload.address) || null,
    city: clean(payload.city) || null,
    state: clean(payload.state) || null,
    postalCode: clean(payload.postalCode) || null,
    phone: clean(payload.phone) || null,
    email: email || null,
    status,
    sourceSystem: "bee_suite_executive_admin",
    licensedCapacity: parseCapacity(payload.licensedCapacity),
  };

  const center = centerId
    ? await prisma.center.update({
        where: { id: centerId },
        data,
        include: { organization: { include: { brand: { include: { settings: true } } } } },
      })
    : await prisma.center.create({
        data: {
          ...data,
          externalId: crmLocationId || locationId || null,
          customFields: { createdFromExecutiveConsole: true, createdById: actor.id },
        },
        include: { organization: { include: { brand: { include: { settings: true } } } } },
      });

  await ensureCenterCustomization({
    tenantId: actor.tenantId,
    brandId: center.organization.brandId,
    organizationId: center.organizationId,
    ownerGroupId: center.ownerGroupId,
    centerId: center.id,
    brandName: center.crmLocationId ?? center.name,
    email: center.email,
    primaryColor: center.organization.brand?.settings?.primaryColor,
    accentColor: center.organization.brand?.settings?.accentColor,
    themeMode: center.organization.brand?.settings?.themeMode,
  });

  await audit({
    tenantId: actor.tenantId,
    centerId: center.id,
    userId: actor.id,
    action: centerId ? "executive.center.updated" : "executive.center.created",
    resource: "Center",
    resourceId: center.id,
    metadata: { name: center.name, crmLocationId: center.crmLocationId, status: center.status },
  });

  return { center };
}

async function setCenterStatus(payload: Payload, actor: Awaited<ReturnType<typeof requireExecutiveAccess>>) {
  const centerId = clean(payload.centerId);
  const status = clean(payload.status);
  if (!centerId || !editableCenterStatuses.has(status)) throw new Error("Center and supported status are required.");
  if (!canAccessCenter(actor, centerId)) throw new Error("You do not have access to this center.");

  const center = await prisma.center.findFirst({
    where: { id: centerId, organization: { tenantId: actor.tenantId } },
    select: { id: true, customFields: true },
  });
  if (!center) throw new Error("Center not found.");
  const existingFields = center.customFields && typeof center.customFields === "object" && !Array.isArray(center.customFields)
    ? center.customFields as Record<string, unknown>
    : {};
  const updated = await prisma.center.update({
    where: { id: centerId },
    data: {
      status,
      customFields: {
        ...existingFields,
        executiveStatusChangedAt: new Date().toISOString(),
        executiveStatusChangedBy: actor.email,
      },
    },
    select: { id: true, name: true, status: true },
  });

  await audit({
    tenantId: actor.tenantId,
    centerId,
    userId: actor.id,
    action: status === "closed" ? "executive.center.archived" : "executive.center.status_updated",
    resource: "Center",
    resourceId: centerId,
    metadata: { status },
  });

  return { center: updated };
}

async function createOwnerGroup(payload: Payload, actor: Awaited<ReturnType<typeof requireExecutiveAccess>>) {
  const name = clean(payload.name);
  if (!name) throw new Error("Owner group name is required.");
  const organization = await getDefaultOrganization(actor.tenantId, clean(payload.organizationId) || actor.organizationId);
  const slug = slugify(name);
  const existing = await prisma.ownerGroup.findUnique({
    where: { tenantId_slug: { tenantId: actor.tenantId, slug } },
    select: { id: true },
  });
  if (existing) throw new Error("An owner group with this name already exists.");

  const ownerGroup = await prisma.ownerGroup.create({
    data: {
      tenantId: actor.tenantId,
      brandId: organization.brandId,
      organizationId: organization.id,
      name,
      slug,
      ownerType: clean(payload.ownerType) || "franchisee",
      billingEmail: clean(payload.billingEmail).toLowerCase() || null,
      contactName: clean(payload.contactName) || null,
      status: "active",
      customFields: { createdFromExecutiveConsole: true, createdById: actor.id },
    },
  });

  await audit({
    tenantId: actor.tenantId,
    userId: actor.id,
    action: "executive.owner_group.created",
    resource: "OwnerGroup",
    resourceId: ownerGroup.id,
    metadata: { name: ownerGroup.name, ownerType: ownerGroup.ownerType },
  });

  return { ownerGroup };
}

async function ensureAccessGrant(input: {
  userId: string;
  tenantId: string;
  role: UserRole;
  scopeType: string;
  brandId?: string | null;
  organizationId?: string | null;
  ownerGroupId?: string | null;
  centerId?: string | null;
}) {
  const existing = await prisma.userAccessGrant.findFirst({
    where: {
      userId: input.userId,
      tenantId: input.tenantId,
      role: input.role,
      scopeType: input.scopeType,
      brandId: input.brandId ?? null,
      organizationId: input.organizationId ?? null,
      ownerGroupId: input.ownerGroupId ?? null,
      centerId: input.centerId ?? null,
    },
    select: { id: true },
  });

  if (existing) {
    return prisma.userAccessGrant.update({ where: { id: existing.id }, data: { isActive: true } });
  }

  return prisma.userAccessGrant.create({
    data: {
      userId: input.userId,
      tenantId: input.tenantId,
      role: input.role,
      scopeType: input.scopeType,
      brandId: input.brandId ?? null,
      organizationId: input.organizationId ?? null,
      ownerGroupId: input.ownerGroupId ?? null,
      centerId: input.centerId ?? null,
      permissions: { createdFromExecutiveConsole: true },
    },
  });
}

async function saveUser(payload: Payload, actor: Awaited<ReturnType<typeof requireExecutiveAccess>>, requestUrl: string) {
  const email = clean(payload.email).toLowerCase();
  const name = clean(payload.name);
  const roleValue = clean(payload.role) as UserRole;
  const password = clean(payload.password);
  if (!name) throw new Error("User name is required.");
  if (!isEmail(email)) throw new Error("A valid user email is required.");
  if (!assignableRoles.has(roleValue)) throw new Error("This role cannot be assigned from the executive console.");
  if (password && password.length < 8) throw new Error("Temporary passwords must be at least 8 characters.");

  const centerId = clean(payload.centerId);
  const ownerGroupId = clean(payload.ownerGroupId);
  let center: Prisma.CenterGetPayload<{ include: { organization: true } }> | null = null;
  if (centerId) {
    if (!canAccessCenter(actor, centerId)) throw new Error("You do not have access to this center.");
    center = await prisma.center.findFirst({
      where: { id: centerId, organization: { tenantId: actor.tenantId } },
      include: { organization: true },
    });
    if (!center) throw new Error("Center not found.");
  }

  const organization = center?.organization ?? await getDefaultOrganization(actor.tenantId, actor.organizationId);
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing && existing.tenantId !== actor.tenantId) {
    throw new Error("That email belongs to a different tenant.");
  }

  const appUser = await prisma.user.upsert({
    where: { email },
    update: {
      name,
      role: roleValue,
      organizationId: organization.id,
      isActive: true,
    },
    create: {
      tenantId: actor.tenantId,
      organizationId: organization.id,
      email,
      name,
      role: roleValue,
      isActive: true,
    },
  });

  if (center && classroomStaffProfileRoles.has(roleValue)) {
    await prisma.staffProfile.upsert({
      where: { userId: appUser.id },
      update: {
        centerId: center.id,
        title: clean(payload.title) || roleValue.replaceAll("_", " ").toLowerCase(),
      },
      create: {
        userId: appUser.id,
        centerId: center.id,
        title: clean(payload.title) || roleValue.replaceAll("_", " ").toLowerCase(),
      },
    });
  }

  const scopeType = clean(payload.accessScopeType) || (center ? "CENTER" : ownerGroupId ? "OWNER_GROUP" : "TENANT");
  const ownerGroup = ownerGroupId ? await getOwnerGroup(actor.tenantId, organization.id, ownerGroupId) : null;
  if (scopeType === "CENTER" && !center) throw new Error("Center-scoped users require a location.");
  if (scopeType === "OWNER_GROUP" && !ownerGroup && !center?.ownerGroupId) throw new Error("Owner-group-scoped users require an owner group.");
  if (scopeType === "TENANT" && !tenantAccessRoles.has(roleValue)) {
    throw new Error("Tenant-wide access is limited to executive, regional, or auditor roles.");
  }
  const accessGrantTarget: AccessGrantTarget & { role: UserRole } = {
    role: roleValue,
    scopeType,
    brandId: organization.brandId,
    organizationId: organization.id,
    ownerGroupId: scopeType === "OWNER_GROUP" ? ownerGroup?.id ?? center?.ownerGroupId ?? null : null,
    centerId: scopeType === "CENTER" ? center?.id ?? null : null,
  };
  let auth: Prisma.InputJsonValue = { skipped: true };
  if (password) {
    auth = await upsertSupabaseAuthUserWithPassword({ email, name, password, role: roleValue });
  } else if (payload.sendPasswordReset === true) {
    const reset = await requestSupabasePasswordReset(email, getPasswordResetRedirectUrl(requestUrl));
    auth = { passwordResetSent: reset.ok, status: reset.status };
  }

  await prisma.userAccessGrant.updateMany({
    where: {
      userId: appUser.id,
      tenantId: actor.tenantId,
      isActive: true,
    },
    data: { isActive: false },
  });
  await ensureAccessGrant({
    userId: appUser.id,
    tenantId: actor.tenantId,
    ...accessGrantTarget,
  });

  await audit({
    tenantId: actor.tenantId,
    centerId: center?.id,
    userId: actor.id,
    action: existing ? "executive.user.updated" : "executive.user.created",
    resource: "User",
    resourceId: appUser.id,
    metadata: { email, role: roleValue, scopeType, centerId: center?.id ?? null, auth },
  });

  return { user: appUser, auth };
}

async function resetUserPassword(payload: Payload, actor: Awaited<ReturnType<typeof requireExecutiveAccess>>, requestUrl: string) {
  const email = clean(payload.email).toLowerCase();
  const password = clean(payload.password);
  if (!isEmail(email)) throw new Error("A valid user email is required.");
  if (password && password.length < 8) throw new Error("Temporary passwords must be at least 8 characters.");

  const appUser = await prisma.user.findFirst({ where: { email, tenantId: actor.tenantId } });
  if (!appUser) throw new Error("User not found in this tenant.");

  const auth = password
    ? await upsertSupabaseAuthUserWithPassword({ email, name: appUser.name, password, role: appUser.role })
    : await requestSupabasePasswordReset(email, getPasswordResetRedirectUrl(requestUrl)).then((response) => ({
        ok: response.ok,
        passwordResetSent: response.ok,
        status: response.status,
      }));

  await audit({
    tenantId: actor.tenantId,
    userId: actor.id,
    action: password ? "executive.user.password_set" : "executive.user.password_reset_sent",
    resource: "User",
    resourceId: appUser.id,
    metadata: { email, method: password ? "temporary_password" : "reset_email" },
  });

  return { user: { id: appUser.id, email: appUser.email }, auth };
}

async function setUserStatus(payload: Payload, actor: Awaited<ReturnType<typeof requireExecutiveAccess>>) {
  const email = clean(payload.email).toLowerCase();
  const status = clean(payload.status);
  if (!isEmail(email)) throw new Error("A valid user email is required.");
  if (!["active", "inactive"].includes(status)) throw new Error("Supported user statuses are active or inactive.");

  const appUser = await prisma.user.findFirst({ where: { email, tenantId: actor.tenantId } });
  if (!appUser) throw new Error("User not found in this tenant.");
  if (appUser.id === actor.id && status === "inactive") throw new Error("You cannot deactivate your own account.");

  const updated = await prisma.user.update({
    where: { id: appUser.id },
    data: { isActive: status === "active" },
    select: { id: true, email: true, isActive: true },
  });

  await audit({
    tenantId: actor.tenantId,
    userId: actor.id,
    action: updated.isActive ? "executive.user.activated" : "executive.user.deactivated",
    resource: "User",
    resourceId: updated.id,
    metadata: { email },
  });

  return { user: updated };
}

export async function POST(request: NextRequest) {
  try {
    const actor = await requireExecutiveAccess();
    const payload = (await request.json().catch(() => ({}))) as Payload;
    const action = clean(payload.action);

    if (action === "saveCenter") {
      return NextResponse.json({ ok: true, ...(await saveCenter(payload, actor)) });
    }
    if (action === "setCenterStatus") {
      return NextResponse.json({ ok: true, ...(await setCenterStatus(payload, actor)) });
    }
    if (action === "createOwnerGroup") {
      return NextResponse.json({ ok: true, ...(await createOwnerGroup(payload, actor)) });
    }
    if (action === "saveUser") {
      return NextResponse.json({ ok: true, ...(await saveUser(payload, actor, request.url)) });
    }
    if (action === "resetUserPassword") {
      return NextResponse.json({ ok: true, ...(await resetUserPassword(payload, actor, request.url)) });
    }
    if (action === "setUserStatus") {
      return NextResponse.json({ ok: true, ...(await setUserStatus(payload, actor)) });
    }

    return NextResponse.json({ ok: false, error: "Unsupported executive action." }, { status: 400 });
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Executive action failed." },
      { status: 400 },
    );
  }
}
