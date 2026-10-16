import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { canAccessCenter, canManageBilling, getCurrentUser } from "@/lib/auth";
import { contractReportRange } from "@/lib/agency-contract-report";
import { AGENCY_REGISTER_LIMIT, agencyServiceRegister } from "@/lib/agency-service-register";
import { prisma } from "@/lib/prisma";
import { withApiLogging } from "@/lib/request-response-logging";

export const runtime = "nodejs";
async function GETHandler(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!canManageBilling(user) && user.role !== "READ_ONLY_AUDITOR") return NextResponse.json({ error: "Agency billing access required." }, { status: 403 });
  const centerId = request.nextUrl.searchParams.get("centerId") ?? "";
  if (!centerId || !user.centerIds.includes(centerId) || !canAccessCenter(user, centerId)) return NextResponse.json({ error: "Select one authorized school." }, { status: 403 });
  const range = contractReportRange(request.nextUrl.searchParams.get("start"), request.nextUrl.searchParams.get("end"));
  if (!range || range.endExclusive.getTime() - range.start.getTime() > 366 * 86400000) return NextResponse.json({ error: "Choose valid service dates spanning at most 366 days." }, { status: 400 });
  // One read snapshot keeps receipt totals and coverage consistent. No writes or provider calls.
  const { claims, authorizations } = await prisma.$transaction(async tx => {
    const [claims, authorizations] = await Promise.all([
      tx.subsidyClaim.findMany({
        where: { centerId, agencyProgram: { centerId }, servicePeriodStart: { lt: range.endExclusive }, servicePeriodEnd: { gte: range.start },
          OR: [{ authorizationId: null }, { authorization: { centerId, agencyProgram: { centerId }, family: { centerId }, child: { family: { centerId } } } }] },
        select: { id: true, number: true, authorizationId: true, status: true, servicePeriodStart: true, servicePeriodEnd: true,
          claimedCents: true, approvedCents: true, paidCents: true, agencyProgram: { select: { name: true } },
          authorization: { select: { child: { select: { fullName: true } } } },
          remittances: { select: { amountCents: true, reversedAt: true } } },
        orderBy: [{ servicePeriodStart: "asc" }, { id: "asc" }], take: AGENCY_REGISTER_LIMIT + 1,
      }),
      tx.subsidyAuthorization.findMany({
        where: { centerId, agencyProgram: { centerId }, family: { centerId }, child: { family: { centerId } },
          coverageStart: { lt: range.endExclusive }, coverageEnd: { gte: range.start }, status: { in: ["active", "expired"] } },
        select: { id: true, coverageStart: true, coverageEnd: true, status: true,
          agencyProgram: { select: { name: true } }, child: { select: { fullName: true } } },
        orderBy: [{ coverageStart: "asc" }, { id: "asc" }], take: AGENCY_REGISTER_LIMIT + 1,
      }),
    ]);
    return { claims, authorizations };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  if (claims.length > AGENCY_REGISTER_LIMIT || authorizations.length > AGENCY_REGISTER_LIMIT) return NextResponse.json({ error: "Too many records. Choose a smaller date range; no partial totals were produced." }, { status: 422 });
  return NextResponse.json(agencyServiceRegister(claims, authorizations, range), { headers: { "Cache-Control": "private, no-store" } });
}
export const GET = withApiLogging("GET", GETHandler);
