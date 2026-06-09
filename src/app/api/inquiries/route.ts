import { NextRequest, NextResponse } from "next/server";
import { EnrollmentStage, UserRole } from "@prisma/client";
import {
  forwardInquiryToGoogleSheets,
  sendInquiryNotificationEmail,
  uniqueInquiryEmails,
} from "@/lib/inquiry-integrations";
import { recordIntegrationDeliveryAttempt } from "@/lib/integration-deliveries";
import { selectPreferredInquiryCenter } from "@/lib/inquiry-routing";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, requestIp, retryAfterSeconds } from "@/lib/rate-limit";

import { logOperationalError, withApiLogging } from "@/lib/request-response-logging";
export const runtime = "nodejs";

type InquiryPayload = {
  parentName?: string;
  parent_name?: string;
  email?: string;
  phone?: string;
  program?: string;
  centerId?: string;
  center_id?: string;
  locationId?: string;
  location_id?: string;
  publicLocationId?: string;
  public_location_id?: string;
  locationName?: string;
  location_name?: string;
  city?: string;
  location_city?: string;
  state?: string;
  location_state?: string;
  address?: string;
  location_address?: string;
  postalCode?: string;
  location_postal_code?: string;
  locationPhone?: string;
  location_phone?: string;
  pageUrl?: string;
  page_url?: string;
  leadSource?: string;
  lead_source?: string;
  utmSource?: string;
  utm_source?: string;
  utmMedium?: string;
  utm_medium?: string;
  utmCampaign?: string;
  utm_campaign?: string;
  utmTerm?: string;
  utm_term?: string;
  utmContent?: string;
  utm_content?: string;
  brandName?: string;
  brand_name?: string;
  company?: string;
  website?: string;
  turnstileToken?: string;
  turnstile_token?: string;
  "cf-turnstile-response"?: string;
};

type IntakeCenter = {
  id: string;
  name: string;
  crmLocationId: string | null;
  locationId: string | null;
  email: string | null;
  status: string | null;
  tenantId: string;
};

type IntakeCenterRecord = {
  id: string;
  name: string;
  crmLocationId: string | null;
  locationId: string | null;
  email: string | null;
  status: string | null;
  organization: {
    tenantId: string;
  };
};

class InquiryRoutingError extends Error {
  constructor(
    message: string,
    public code: string,
    public status = 400,
  ) {
    super(message);
  }
}

const DEFAULT_ALLOWED_ORIGINS = [
  "https://kidcityusa.com",
  "https://www.kidcityusa.com",
  "https://the-bee-suite-beta.vercel.app",
];

const intakeCenterSelect = {
  id: true,
  name: true,
  crmLocationId: true,
  locationId: true,
  email: true,
  status: true,
  organization: {
    select: {
      tenantId: true,
    },
  },
} as const;

function toIntakeCenter(center: IntakeCenterRecord): IntakeCenter {
  return {
    id: center.id,
    name: center.name,
    crmLocationId: center.crmLocationId,
    locationId: center.locationId,
    email: center.email,
    status: center.status,
    tenantId: center.organization.tenantId,
  };
}

function json(data: unknown, status = 200, origin?: string | null) {
  return NextResponse.json(data, {
    status,
    headers: corsHeaders(origin),
  });
}

function corsHeaders(origin?: string | null) {
  const allowedOrigin = getAllowedOrigin(origin);

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function getAllowedOrigin(origin?: string | null) {
  if (!origin) return DEFAULT_ALLOWED_ORIGINS[0];

  return isAllowedOrigin(origin) ? origin : getConfiguredAllowedOrigins()[0];
}

function getConfiguredAllowedOrigins() {
  const configured = process.env.INQUIRY_ALLOWED_ORIGINS?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return configured?.length ? configured : DEFAULT_ALLOWED_ORIGINS;
}

function isAllowedOrigin(origin?: string | null) {
  if (!origin) return true;
  return getConfiguredAllowedOrigins().includes(origin);
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEmail(value: unknown) {
  return clean(value).toLowerCase();
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalizeProgram(program: string) {
  const allowed = new Set([
    "Daycare",
    "Preschool",
    "Before & After School Care",
    "Summer Camp",
  ]);

  return allowed.has(program) ? program : "";
}

async function readPayload(request: NextRequest): Promise<InquiryPayload> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return request.json();
  }

  const formData = await request.formData();
  return Object.fromEntries(formData.entries()) as InquiryPayload;
}

function normalizePayload(input: InquiryPayload) {
  const parentName = clean(input.parentName || input.parent_name);
  const email = normalizeEmail(input.email);
  const phone = clean(input.phone);
  const program = normalizeProgram(clean(input.program));
  const centerId = clean(input.centerId || input.center_id);
  const locationId = clean(input.locationId || input.location_id);
  const publicLocationId = clean(input.publicLocationId || input.public_location_id);

  return {
    parentName,
    email,
    phone,
    program,
    centerId,
    locationId,
    publicLocationId,
    locationName: clean(input.locationName || input.location_name),
    city: clean(input.city || input.location_city),
    state: clean(input.state || input.location_state),
    address: clean(input.address || input.location_address),
    postalCode: clean(input.postalCode || input.location_postal_code),
    locationPhone: clean(input.locationPhone || input.location_phone),
    pageUrl: clean(input.pageUrl || input.page_url),
    leadSource: clean(input.leadSource || input.lead_source) || "Kid City USA Website Inquiry",
    utmSource: clean(input.utmSource || input.utm_source),
    utmMedium: clean(input.utmMedium || input.utm_medium),
    utmCampaign: clean(input.utmCampaign || input.utm_campaign),
    utmTerm: clean(input.utmTerm || input.utm_term),
    utmContent: clean(input.utmContent || input.utm_content),
    brandName: clean(input.brandName || input.brand_name),
    company: clean(input.company),
    website: clean(input.website),
    turnstileToken: clean(input.turnstileToken || input.turnstile_token || input["cf-turnstile-response"]),
  };
}

function validate(payload: ReturnType<typeof normalizePayload>) {
  const errors: Record<string, string> = {};

  if (!payload.parentName) errors.parentName = "Parent name is required.";
  if (!payload.email || !isEmail(payload.email)) errors.email = "A valid email is required.";
  if (!payload.phone) errors.phone = "Phone number is required.";
  if (!payload.program) errors.program = "Program is required.";
  if (!payload.locationId && !payload.centerId) errors.locationId = "Location is required.";

  return errors;
}

function scoreLead(program: string, locationId: string, centerId = "") {
  let score = 70;
  if (program === "Daycare" || program === "Preschool") score += 10;
  if (locationId || centerId) score += 5;
  return Math.min(score, 95);
}

function uniqueValues(values: string[]) {
  const seen = new Set<string>();
  return values
    .map(clean)
    .filter(Boolean)
    .filter((value) => {
      const key = value.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function isKidCityInquiry(payload: ReturnType<typeof normalizePayload>) {
  const values = [
    payload.leadSource,
    payload.brandName,
    payload.locationId,
    payload.publicLocationId,
    payload.locationName,
  ].join(" ");

  return /kid city usa/i.test(values) || /^[A-Z]{2}\s\|\s/.test(payload.locationId);
}

async function findCenterById(centerId: string): Promise<IntakeCenter | null> {
  const center = await prisma.center.findFirst({
    where: {
      id: centerId,
      status: { not: "closed" },
    },
    select: intakeCenterSelect,
  });

  return center ? toIntakeCenter(center) : null;
}

async function getFallbackIntakeCenter(): Promise<IntakeCenter> {
  const configuredCenterId = process.env.INQUIRY_DEFAULT_CENTER_ID;

  if (configuredCenterId) {
    const center = await findCenterById(configuredCenterId);
    if (center) return center;
  }

  const unassignedCenter = await prisma.center.findFirst({
    where: {
      status: { not: "closed" },
      OR: [
        { crmLocationId: "UNASSIGNED" },
        { locationId: "UNASSIGNED" },
        { name: "Website Inquiry Center" },
      ],
    },
    orderBy: { createdAt: "asc" },
    select: intakeCenterSelect,
  });

  if (unassignedCenter) return toIntakeCenter(unassignedCenter);

  const organization = await prisma.organization.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  if (!organization) {
    throw new Error("No organization exists for inquiry intake.");
  }

  const center = await prisma.center.create({
    data: {
      organizationId: organization.id,
      name: "Website Inquiry Center",
      crmLocationId: "UNASSIGNED",
      locationId: "UNASSIGNED",
      licensedCapacity: 0,
    },
    select: intakeCenterSelect,
  });

  return toIntakeCenter(center);
}

async function getIntakeCenter({
  locationId,
  publicLocationId,
  centerId,
  strictLocationRouting,
}: {
  locationId: string;
  publicLocationId?: string;
  centerId?: string;
  strictLocationRouting: boolean;
}): Promise<IntakeCenter> {
  const requestedCenterId = clean(centerId);
  if (requestedCenterId) {
    const center = await findCenterById(requestedCenterId);

    if (center) return center;
  }

  const locationIds = uniqueValues([locationId, publicLocationId ?? ""]);
  if (locationIds.length) {
    const routedCenters = await prisma.center.findMany({
      where: {
        status: { not: "closed" },
        OR: [
          { crmLocationId: { in: locationIds } },
          { locationId: { in: locationIds } },
          { name: { in: locationIds } },
        ],
      },
      orderBy: { createdAt: "asc" },
      take: 20,
      select: intakeCenterSelect,
    });
    const routedCenter = selectPreferredInquiryCenter(routedCenters, locationIds);

    if (routedCenter) return toIntakeCenter(routedCenter);

    if (strictLocationRouting) {
      throw new InquiryRoutingError(
        "The selected Kid City USA location is not currently mapped in The BEE Suite. Please choose another location or contact the center.",
        "unknown_kidcity_location",
      );
    }
  }

  return getFallbackIntakeCenter();
}

async function getLocationNotificationEmails(centerId: string, centerEmail?: string | null) {
  if (centerEmail && isEmail(centerEmail)) return [centerEmail];

  const locationUsers = await prisma.userAccessGrant.findMany({
    where: {
      centerId,
      isActive: true,
      role: { in: [UserRole.CENTER_DIRECTOR, UserRole.ASSISTANT_DIRECTOR, UserRole.BILLING_ADMIN] },
      user: {
        isActive: true,
        email: { endsWith: "@kidcityusa.com" },
      },
    },
    orderBy: { createdAt: "asc" },
    select: {
      user: {
        select: {
          email: true,
        },
      },
    },
  });

  if (locationUsers.length) {
    return uniqueInquiryEmails(locationUsers.map((grant) => grant.user.email)).slice(0, 3);
  }

  const directorProfiles = await prisma.staffProfile.findMany({
    where: {
      centerId,
      user: {
        isActive: true,
        email: { endsWith: "@kidcityusa.com" },
        role: { in: [UserRole.CENTER_DIRECTOR, UserRole.ASSISTANT_DIRECTOR, UserRole.BILLING_ADMIN] },
      },
    },
    orderBy: { id: "asc" },
    select: {
      user: {
        select: {
          email: true,
        },
      },
    },
  });

  return uniqueInquiryEmails(directorProfiles.map((profile) => profile.user.email)).slice(0, 3);
}

async function verifyTurnstileToken({
  token,
  remoteIp,
}: {
  token: string;
  remoteIp: string;
}) {
  const secret = process.env.INQUIRY_TURNSTILE_SECRET_KEY;
  if (!secret) return { ok: true, skipped: true };
  if (!token) return { ok: false, error: "Bot verification is required." };

  try {
    const body = new URLSearchParams({
      secret,
      response: token,
    });
    if (remoteIp) body.set("remoteip", remoteIp);

    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) return { ok: false, error: `Bot verification returned ${response.status}.` };

    const result = (await response.json()) as { success?: boolean; "error-codes"?: string[] };
    if (!result.success) {
      return {
        ok: false,
        error: result["error-codes"]?.length
          ? `Bot verification failed: ${result["error-codes"].join(", ")}`
          : "Bot verification failed.",
      };
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Bot verification could not be completed.",
    };
  }
}

async function OPTIONSHandler(request: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(request.headers.get("origin")),
  });
}

async function POSTHandler(request: NextRequest) {
  const origin = request.headers.get("origin");

  try {
    if (!isAllowedOrigin(origin)) {
      return json({ ok: false, error: "Origin is not allowed." }, 403, origin);
    }
    const ip = requestIp(request.headers);
    const rate = checkRateLimit({
      key: `inquiry:${ip}`,
      limit: 30,
      windowMs: 10 * 60 * 1000,
    });
    if (!rate.ok) {
      const response = json({ ok: false, error: "Too many inquiry attempts. Please try again shortly." }, 429, origin);
      response.headers.set("Retry-After", String(retryAfterSeconds(rate.resetAt)));
      return response;
    }

    const payload = normalizePayload(await readPayload(request));
    if (payload.company || payload.website) {
      return json({ ok: true, leadId: null, spamFiltered: true }, 202, origin);
    }
    const errors = validate(payload);

    if (Object.keys(errors).length) {
      return json({ ok: false, errors }, 400, origin);
    }

    const botCheck = await verifyTurnstileToken({
      token: payload.turnstileToken,
      remoteIp: ip,
    });
    if (!botCheck.ok) {
      return json({ ok: false, error: botCheck.error }, 403, origin);
    }

    const center = await getIntakeCenter({
      locationId: payload.locationId,
      publicLocationId: payload.publicLocationId,
      centerId: payload.centerId,
      strictLocationRouting: isKidCityInquiry(payload),
    });
    const locationRecipients = await getLocationNotificationEmails(center.id, center.email);
    const [parentFirstName, ...parentLastNameParts] = payload.parentName.split(/\s+/);
    const lead = await prisma.lead.create({
      data: {
        centerId: center.id,
        familyName: payload.parentName,
        parentFirstName,
        parentLastName: parentLastNameParts.join(" ") || null,
        email: payload.email,
        phone: payload.phone,
        leadSource: payload.leadSource,
        programInterest: payload.program,
        ageGroupInterest: payload.program,
        stage: EnrollmentStage.NEW_INQUIRY,
        score: scoreLead(payload.program, payload.locationId, payload.centerId),
        status: "open",
        customFields: {
          intakeType: "wordpress_inquiry_form",
          parentName: payload.parentName,
          email: payload.email,
          phone: payload.phone,
          program: payload.program,
          centerId: payload.centerId,
          resolvedCenterId: center.id,
          resolvedCenterName: center.name,
          resolvedCrmLocationId: center.crmLocationId,
          resolvedLocationId: center.locationId,
          locationId: payload.locationId,
          publicLocationId: payload.publicLocationId,
          locationName: payload.locationName,
          city: payload.city,
          state: payload.state,
          address: payload.address,
          postalCode: payload.postalCode,
          locationPhone: payload.locationPhone,
          pageUrl: payload.pageUrl,
          utmSource: payload.utmSource,
          utmMedium: payload.utmMedium,
          utmCampaign: payload.utmCampaign,
          utmTerm: payload.utmTerm,
          utmContent: payload.utmContent,
          brandName: payload.brandName,
        },
        tasks: {
          create: [
            {
              title: `Follow up with ${payload.parentName}`,
              status: "open",
            },
          ],
        },
        notes: {
          create: [
            {
              body: `Website inquiry for ${payload.program} at ${payload.locationId}. Parent email: ${payload.email}. Phone: ${payload.phone}.`,
            },
          ],
        },
      },
      select: {
        id: true,
        score: true,
        stage: true,
      },
    });

    const integrationPayload = {
      ...payload,
      centerId: center.id,
      tenantId: center.tenantId,
      resolvedCenterName: center.name,
      resolvedCrmLocationId: center.crmLocationId,
      resolvedLocationId: center.locationId,
      leadId: lead.id,
      leadScore: lead.score,
      stage: lead.stage,
      submittedAt: new Date().toISOString(),
    };

    const [googleSheets, email] = await Promise.all([
      forwardInquiryToGoogleSheets(integrationPayload),
      sendInquiryNotificationEmail(integrationPayload, locationRecipients),
    ]);

    await Promise.all([
      recordIntegrationDeliveryAttempt({
        tenantId: center.tenantId,
        centerId: center.id,
        leadId: lead.id,
        provider: "google_sheets",
        purpose: "inquiry_backup",
        payload: integrationPayload,
        result: googleSheets,
      }),
      recordIntegrationDeliveryAttempt({
        tenantId: center.tenantId,
        centerId: center.id,
        leadId: lead.id,
        provider: "sendgrid",
        purpose: "inquiry_notification",
        payload: {
          ...integrationPayload,
          locationRecipients,
        },
        result: email,
      }),
    ]).catch((error) => {
      logOperationalError("inquiries.integration_delivery_logging_failed", error, {
        centerId: center.id,
        leadId: lead.id,
      });
    });

    return json(
      {
        ok: true,
        leadId: lead.id,
        integrations: {
          googleSheets,
          email,
        },
      },
      201,
      origin,
    );
  } catch (error) {
    if (error instanceof InquiryRoutingError) {
      return json(
        {
          ok: false,
          code: error.code,
          error: error.message,
        },
        error.status,
        origin,
      );
    }

    logOperationalError("inquiries.intake_failed", error);
    return json(
      {
        ok: false,
        error: "Inquiry could not be submitted. Please try again or call the center.",
      },
      500,
      origin,
    );
  }
}

export const OPTIONS = withApiLogging("OPTIONS", OPTIONSHandler);
export const POST = withApiLogging("POST", POSTHandler);
