import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const SESSION_COOKIE = "bee_suite_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12;

export type AppSession = {
  userId: string;
  email: string;
  role: UserRole;
  exp: number;
};

export type CurrentUser = {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  role: UserRole;
  organizationId: string | null;
  centerIds: string[];
  primaryCenterId: string | null;
};

const allCenterRoles = new Set<UserRole>([
  UserRole.PLATFORM_OWNER,
  UserRole.BRAND_ADMIN,
  UserRole.REGIONAL_MANAGER,
  UserRole.READ_ONLY_AUDITOR,
]);

const leadWriteRoles = new Set<UserRole>([
  UserRole.PLATFORM_OWNER,
  UserRole.BRAND_ADMIN,
  UserRole.REGIONAL_MANAGER,
  UserRole.CENTER_DIRECTOR,
  UserRole.ASSISTANT_DIRECTOR,
  UserRole.BILLING_ADMIN,
]);

const operationsWriteRoles = new Set<UserRole>([
  UserRole.PLATFORM_OWNER,
  UserRole.BRAND_ADMIN,
  UserRole.REGIONAL_MANAGER,
  UserRole.CENTER_DIRECTOR,
  UserRole.ASSISTANT_DIRECTOR,
]);

const teacherWriteRoles = new Set<UserRole>([
  UserRole.PLATFORM_OWNER,
  UserRole.BRAND_ADMIN,
  UserRole.REGIONAL_MANAGER,
  UserRole.CENTER_DIRECTOR,
  UserRole.ASSISTANT_DIRECTOR,
  UserRole.TEACHER,
]);

const billingWriteRoles = new Set<UserRole>([
  UserRole.PLATFORM_OWNER,
  UserRole.BRAND_ADMIN,
  UserRole.REGIONAL_MANAGER,
  UserRole.CENTER_DIRECTOR,
  UserRole.ASSISTANT_DIRECTOR,
  UserRole.BILLING_ADMIN,
]);

const executiveDemoRoles = new Set<UserRole>([
  UserRole.PLATFORM_OWNER,
  UserRole.BRAND_ADMIN,
  UserRole.REGIONAL_MANAGER,
]);

function getAuthSecret() {
  const secret = process.env.AUTH_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV !== "production") return "dev-only-bee-suite-auth-secret";
  throw new Error("AUTH_SECRET is required in production.");
}

function base64Url(input: string | Buffer) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function fromBase64Url(input: string) {
  const padded = input + "=".repeat((4 - (input.length % 4)) % 4);
  return Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

function sign(data: string) {
  return base64Url(createHmac("sha256", getAuthSecret()).update(data).digest());
}

function verifySignature(data: string, signature: string) {
  const expected = Buffer.from(sign(data));
  const actual = Buffer.from(signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function createSessionToken(user: Pick<CurrentUser, "id" | "email" | "role">) {
  const payload: AppSession = {
    userId: user.id,
    email: user.email,
    role: user.role,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  const data = base64Url(JSON.stringify(payload));
  return `${data}.${sign(data)}`;
}

export function verifySessionToken(token?: string) {
  if (!token) return null;
  const [data, signature] = token.split(".");
  if (!data || !signature || !verifySignature(data, signature)) return null;

  try {
    const session = JSON.parse(fromBase64Url(data)) as AppSession;
    if (!session.userId || session.exp < Math.floor(Date.now() / 1000)) return null;
    return session;
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}

export async function getSession() {
  const cookieStore = await cookies();
  return verifySessionToken(cookieStore.get(SESSION_COOKIE)?.value);
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await getSession();
  if (!session) return null;

  const user = await prisma.user.findFirst({
    where: {
      id: session.userId,
      email: session.email,
      isActive: true,
    },
    include: {
      staffProfile: {
        select: { centerId: true },
      },
    },
  });

  if (!user) return null;

  let centerIds = user.staffProfile?.centerId ? [user.staffProfile.centerId] : [];
  if (user.role !== UserRole.PLATFORM_OWNER && allCenterRoles.has(user.role)) {
    const tenantCenters = await prisma.center.findMany({
      where: {
        organization: {
          tenantId: user.tenantId,
        },
      },
      select: { id: true },
    });
    centerIds = tenantCenters.map((center) => center.id);
  }

  return {
    id: user.id,
    tenantId: user.tenantId,
    email: user.email,
    name: user.name,
    role: user.role,
    organizationId: user.organizationId,
    centerIds,
    primaryCenterId: centerIds[0] ?? null,
  };
}

export async function requireCurrentUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export function canAccessAllCenters(user: Pick<CurrentUser, "role">) {
  return allCenterRoles.has(user.role);
}

export function getLeadScopeWhere(user: CurrentUser) {
  if (user.role === UserRole.PLATFORM_OWNER) return {};
  if (canAccessAllCenters(user)) {
    return {
      organization: {
        tenantId: user.tenantId,
      },
    };
  }
  if (!user.centerIds.length) return { id: "__no_authorized_center__" };
  return { id: { in: user.centerIds } };
}

export function canAccessCenter(user: CurrentUser, centerId: string) {
  return user.role === UserRole.PLATFORM_OWNER || user.centerIds.includes(centerId);
}

export function canManageCrmLeads(user: Pick<CurrentUser, "role">) {
  return leadWriteRoles.has(user.role);
}

export function canManageOperations(user: Pick<CurrentUser, "role">) {
  return operationsWriteRoles.has(user.role);
}

export function canManageClassroomTasks(user: Pick<CurrentUser, "role">) {
  return teacherWriteRoles.has(user.role);
}

export function canManageBilling(user: Pick<CurrentUser, "role">) {
  return billingWriteRoles.has(user.role);
}

export function canViewExecutiveDemoData(user: Pick<CurrentUser, "role">) {
  return executiveDemoRoles.has(user.role);
}

export function isParentGuardian(user: Pick<CurrentUser, "role">) {
  return user.role === UserRole.PARENT_GUARDIAN;
}
