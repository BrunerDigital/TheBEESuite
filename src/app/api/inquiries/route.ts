import { NextRequest, NextResponse } from "next/server";
import { EnrollmentStage, UserRole } from "@prisma/client";
import {
  appendRowToGoogleSheet,
  hasGoogleSheetsApiConfig,
  type GoogleSheetValue,
} from "@/lib/google-sheets";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, requestIp, retryAfterSeconds } from "@/lib/rate-limit";

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

type IntegrationResult = {
  ok: boolean;
  skipped?: boolean;
  error?: string;
  mode?: "google_sheets_api" | "webhook";
  spreadsheetId?: string;
  sheetName?: string;
  updatedRange?: string;
  recipients?: number;
  locationRecipients?: number;
};

type IntakeCenter = {
  id: string;
  name: string;
  crmLocationId: string | null;
  locationId: string | null;
  email: string | null;
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

const GOOGLE_SHEET_COLUMNS = [
  { header: "Submitted At", field: "submittedAt" },
  { header: "Bee Suite Lead ID", field: "leadId" },
  { header: "Parent Name", field: "parentName" },
  { header: "Email", field: "email" },
  { header: "Phone", field: "phone" },
  { header: "Program", field: "program" },
  { header: "Center ID", field: "centerId" },
  { header: "Location ID", field: "locationId" },
  { header: "Public Location ID", field: "publicLocationId" },
  { header: "Location Name", field: "locationName" },
  { header: "City", field: "city" },
  { header: "State", field: "state" },
  { header: "Address", field: "address" },
  { header: "Postal Code", field: "postalCode" },
  { header: "Location Phone", field: "locationPhone" },
  { header: "Page URL", field: "pageUrl" },
  { header: "Lead Source", field: "leadSource" },
  { header: "Brand Name", field: "brandName" },
  { header: "UTM Source", field: "utmSource" },
  { header: "UTM Medium", field: "utmMedium" },
  { header: "UTM Campaign", field: "utmCampaign" },
  { header: "UTM Term", field: "utmTerm" },
  { header: "UTM Content", field: "utmContent" },
  { header: "Lead Score", field: "leadScore" },
  { header: "Stage", field: "stage" },
] as const;

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

async function findCenterById(centerId: string): Promise<IntakeCenter | null> {
  return prisma.center.findFirst({
    where: {
      id: centerId,
      status: { not: "closed" },
    },
    select: {
      id: true,
      name: true,
      crmLocationId: true,
      locationId: true,
      email: true,
    },
  });
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
    select: {
      id: true,
      name: true,
      crmLocationId: true,
      locationId: true,
      email: true,
    },
  });

  if (unassignedCenter) return unassignedCenter;

  const organization = await prisma.organization.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  if (!organization) {
    throw new Error("No organization exists for inquiry intake.");
  }

  return prisma.center.create({
    data: {
      organizationId: organization.id,
      name: "Website Inquiry Center",
      crmLocationId: "UNASSIGNED",
      locationId: "UNASSIGNED",
      licensedCapacity: 0,
    },
    select: {
      id: true,
      name: true,
      crmLocationId: true,
      locationId: true,
      email: true,
    },
  });
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
    const routedCenter = await prisma.center.findFirst({
      where: {
        status: { not: "closed" },
        OR: [
          { crmLocationId: { in: locationIds } },
          { locationId: { in: locationIds } },
          { name: { in: locationIds } },
        ],
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        crmLocationId: true,
        locationId: true,
        email: true,
      },
    });

    if (routedCenter) return routedCenter;

    if (strictLocationRouting) {
      throw new InquiryRoutingError(
        "The selected Kid City USA location is not currently mapped in The Bee Suite. Please choose another location or contact the center.",
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
    return uniqueEmails(locationUsers.map((grant) => grant.user.email)).slice(0, 3);
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

  return uniqueEmails(directorProfiles.map((profile) => profile.user.email)).slice(0, 3);
}

async function forwardToGoogleSheets(payload: Record<string, unknown>): Promise<IntegrationResult> {
  if (hasGoogleSheetsApiConfig()) {
    return appendRowToGoogleSheet({
      headers: GOOGLE_SHEET_COLUMNS.map((column) => column.header),
      row: GOOGLE_SHEET_COLUMNS.map((column) =>
        sheetValue(payload[column.field]),
      ),
    });
  }

  const url = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
  if (!url) return { ok: true, skipped: true };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      return { ok: false, error: `Google Sheets webhook returned ${response.status}.` };
    }

    return { ok: true, mode: "webhook" };
  } catch (error) {
    return {
      ok: false,
      mode: "webhook",
      error: error instanceof Error ? error.message : "Google Sheets webhook failed.",
    };
  }
}

function sheetValue(value: unknown): GoogleSheetValue {
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return value;
  return "";
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

async function sendNotificationEmail(
  payload: Record<string, unknown>,
  locationRecipients: string[] = [],
): Promise<IntegrationResult> {
  const apiKey = process.env.SENDGRID_API_KEY;
  const recipients = uniqueEmails([
    ...(process.env.INQUIRY_NOTIFICATION_EMAILS?.split(",") ?? []),
    ...locationRecipients,
  ]);
  const from = process.env.SENDGRID_FROM_EMAIL;

  if (!apiKey || !recipients.length || !from) {
    return { ok: true, skipped: true };
  }

  const brand = String(payload.brandName || "Kid City USA");
  const subject = `New ${brand} Inquiry - ${payload.program} - ${payload.locationId || payload.locationName || payload.centerId}`;
  const lines = [
    `Parent: ${payload.parentName}`,
    `Email: ${payload.email}`,
    `Phone: ${payload.phone}`,
    `Program: ${payload.program}`,
    `Location ID: ${payload.locationId}`,
    `Public Location ID: ${payload.publicLocationId || ""}`,
    `Location: ${payload.locationName || ""}`,
    `City/State: ${payload.city || ""}, ${payload.state || ""}`,
    `Page: ${payload.pageUrl || ""}`,
    `Bee Suite Lead ID: ${payload.leadId}`,
  ];

  try {
    const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{ to: recipients.map((email) => ({ email })) }],
        from: { email: from, name: "The Bee Suite" },
        subject,
        content: [
          {
            type: "text/plain",
            value: lines.join("\n"),
          },
        ],
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      return { ok: false, error: `SendGrid returned ${response.status}.` };
    }

    return {
      ok: true,
      recipients: recipients.length,
      locationRecipients: uniqueEmails(locationRecipients).length,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Notification email failed.",
    };
  }
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(request.headers.get("origin")),
  });
}

export async function POST(request: NextRequest) {
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
      resolvedCenterName: center.name,
      resolvedCrmLocationId: center.crmLocationId,
      resolvedLocationId: center.locationId,
      leadId: lead.id,
      leadScore: lead.score,
      stage: lead.stage,
      submittedAt: new Date().toISOString(),
    };

    const [googleSheets, email] = await Promise.all([
      forwardToGoogleSheets(integrationPayload),
      sendNotificationEmail(integrationPayload, locationRecipients),
    ]);

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

    console.error("Inquiry intake failed", error);
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
