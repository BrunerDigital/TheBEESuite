import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import {
  comparePublicKidCityLocations,
  filterPublicKidCityLocations,
  isActivePublicSchoolCandidate,
  mergePublicKidCityLocations,
  toPublicKidCityLocation,
  type PublicKidCityLocation,
} from "@/lib/active-school-locations";
import { prisma } from "@/lib/prisma";
import { filterPublicInquiryLocations } from "@/lib/public-inquiry-policy";
import { isEligiblePublicInquiryCenter } from "@/lib/inquiry-routing";

import { logOperationalError, withApiLogging } from "@/lib/request-response-logging";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PublicLocationFile = {
  locations: PublicKidCityLocation[];
};

const responseHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "no-store",
};

async function loadStaticLocations() {
  const file = await readFile(path.join(process.cwd(), "public", "kidcity-locations.json"), "utf8");
  return JSON.parse(file) as PublicLocationFile;
}

async function loadStaticLocationsSafely() {
  try {
    return await loadStaticLocations();
  } catch (error) {
    logOperationalError("public.kidcity_locations.static_lookup_failed", error);
    return { locations: [] } satisfies PublicLocationFile;
  }
}

async function findKidCityTenantId() {
  const tenant = await prisma.tenant.findUnique({
    where: { slug: "kid-city-usa" },
    select: { id: true },
  });
  return tenant?.id ?? null;
}

async function getLiveLocations() {
  const kidCityTenantId = await findKidCityTenantId();
  const centers = await prisma.center.findMany({
    where: {
      status: "active",
      crmLocationId: { not: null },
      organization: kidCityTenantId
        ? { tenantId: kidCityTenantId }
        : {
            OR: [
              { name: { contains: "Kid City", mode: "insensitive" } },
              { brand: { name: { contains: "Kid City", mode: "insensitive" } } },
              { tenant: { slug: "kid-city-usa" } },
            ],
          },
    },
    orderBy: [{ state: "asc" }, { city: "asc" }, { name: "asc" }],
    select: {
      crmLocationId: true,
      locationId: true,
      name: true,
      address: true,
      city: true,
      state: true,
      postalCode: true,
      phone: true,
      status: true,
    },
  });

  return centers
    .filter(isActivePublicSchoolCandidate)
    .map(toPublicKidCityLocation)
    .sort(comparePublicKidCityLocations);
}

async function GETHandler(request: Request) {
  const params = new URL(request.url).searchParams;
  const inquiryOnly = params.get("purpose") === "inquiry";
  const requestedCenterId = inquiryOnly ? (params.get("centerId") ?? "").trim() : "";
  let inquiryCenterEligible: boolean | undefined;

  // Opaque fixed-center embeds need a read-only decision before rendering.
  // Never expose center records or use the intake fallback (which can write).
  if (requestedCenterId) {
    try {
      const center = requestedCenterId.length <= 200
        ? await prisma.center.findFirst({
            where: { id: requestedCenterId, status: { not: "closed" } },
            select: { crmLocationId: true, locationId: true, name: true, status: true },
          })
        : null;
      inquiryCenterEligible = Boolean(center && isEligiblePublicInquiryCenter(center, false));
    } catch (error) {
      logOperationalError("public.kidcity_locations.inquiry_eligibility_failed", error);
      return NextResponse.json({ error: "Inquiry availability could not be checked." }, { status: 503, headers: responseHeaders });
    }
  }

  function respond(locations: PublicKidCityLocation[]) {
    return NextResponse.json({
      locations: inquiryOnly ? filterPublicInquiryLocations(locations) : locations,
      ...(inquiryCenterEligible === undefined ? {} : { inquiryCenterEligible }),
    }, { headers: responseHeaders });
  }

  try {
    const liveLocations = await getLiveLocations();
    if (liveLocations.length) {
      const staticLocations = await loadStaticLocationsSafely();
      const locations = mergePublicKidCityLocations(liveLocations, staticLocations.locations);
      return respond(locations);
    }
  } catch (error) {
    logOperationalError("public.kidcity_locations.lookup_failed", error);
  }

  const fallback = await loadStaticLocations();
  return respond(filterPublicKidCityLocations(fallback.locations));
}

function OPTIONSHandler() {
  return new NextResponse(null, {
    status: 204,
    headers: responseHeaders,
  });
}

export const GET = withApiLogging("GET", GETHandler);
export const OPTIONS = withApiLogging("OPTIONS", OPTIONSHandler);
