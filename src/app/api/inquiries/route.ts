import { NextRequest, NextResponse } from "next/server";
import { EnrollmentStage } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type InquiryPayload = {
  parentName?: string;
  parent_name?: string;
  email?: string;
  phone?: string;
  program?: string;
  locationId?: string;
  location_id?: string;
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
};

type IntegrationResult = {
  ok: boolean;
  skipped?: boolean;
  error?: string;
};

const DEFAULT_ALLOWED_ORIGINS = [
  "https://kidcityusa.com",
  "https://www.kidcityusa.com",
  "https://the-bee-suite-beta.vercel.app",
];

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

  const configured = process.env.INQUIRY_ALLOWED_ORIGINS?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const allowed = configured?.length ? configured : DEFAULT_ALLOWED_ORIGINS;

  return allowed.includes(origin) ? origin : allowed[0];
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
  const locationId = clean(input.locationId || input.location_id);

  return {
    parentName,
    email,
    phone,
    program,
    locationId,
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
  };
}

function validate(payload: ReturnType<typeof normalizePayload>) {
  const errors: Record<string, string> = {};

  if (!payload.parentName) errors.parentName = "Parent name is required.";
  if (!payload.email || !isEmail(payload.email)) errors.email = "A valid email is required.";
  if (!payload.phone) errors.phone = "Phone number is required.";
  if (!payload.program) errors.program = "Program is required.";
  if (!payload.locationId) errors.locationId = "Location is required.";

  return errors;
}

function scoreLead(program: string, locationId: string) {
  let score = 70;
  if (program === "Daycare" || program === "Preschool") score += 10;
  if (locationId) score += 5;
  return Math.min(score, 95);
}

async function getIntakeCenterId() {
  const configuredCenterId = process.env.INQUIRY_DEFAULT_CENTER_ID;

  if (configuredCenterId) {
    const center = await prisma.center.findUnique({ where: { id: configuredCenterId } });
    if (center) return center.id;
  }

  const center = await prisma.center.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  if (center) return center.id;

  const organization = await prisma.organization.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  if (!organization) {
    throw new Error("No organization exists for inquiry intake.");
  }

  const created = await prisma.center.create({
    data: {
      organizationId: organization.id,
      name: "Kid City USA",
      licensedCapacity: 0,
    },
    select: { id: true },
  });

  return created.id;
}

async function forwardToGoogleSheets(payload: Record<string, unknown>): Promise<IntegrationResult> {
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

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Google Sheets webhook failed.",
    };
  }
}

async function sendNotificationEmail(payload: Record<string, unknown>): Promise<IntegrationResult> {
  const apiKey = process.env.SENDGRID_API_KEY;
  const recipients = process.env.INQUIRY_NOTIFICATION_EMAILS?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const from = process.env.SENDGRID_FROM_EMAIL;

  if (!apiKey || !recipients?.length || !from) {
    return { ok: true, skipped: true };
  }

  const subject = `New Kid City USA Inquiry - ${payload.program} - ${payload.locationId}`;
  const lines = [
    `Parent: ${payload.parentName}`,
    `Email: ${payload.email}`,
    `Phone: ${payload.phone}`,
    `Program: ${payload.program}`,
    `Location ID: ${payload.locationId}`,
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

    return { ok: true };
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
    const payload = normalizePayload(await readPayload(request));
    const errors = validate(payload);

    if (Object.keys(errors).length) {
      return json({ ok: false, errors }, 400, origin);
    }

    const centerId = await getIntakeCenterId();
    const lead = await prisma.lead.create({
      data: {
        centerId,
        familyName: payload.parentName,
        leadSource: payload.leadSource,
        programInterest: payload.program,
        ageGroupInterest: payload.program,
        stage: EnrollmentStage.NEW_INQUIRY,
        score: scoreLead(payload.program, payload.locationId),
        status: "open",
        customFields: {
          intakeType: "wordpress_inquiry_form",
          parentName: payload.parentName,
          email: payload.email,
          phone: payload.phone,
          program: payload.program,
          locationId: payload.locationId,
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
      leadId: lead.id,
      leadScore: lead.score,
      stage: lead.stage,
      submittedAt: new Date().toISOString(),
    };

    const [googleSheets, email] = await Promise.all([
      forwardToGoogleSheets(integrationPayload),
      sendNotificationEmail(integrationPayload),
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
