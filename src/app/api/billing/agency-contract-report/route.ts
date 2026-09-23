import { NextRequest, NextResponse } from "next/server";
import { canAccessCenter, canManageBilling, getCurrentUser } from "@/lib/auth";
import { agencyContractReportRow, contractReportCsvCell, contractReportRange } from "@/lib/agency-contract-report";
import { prisma } from "@/lib/prisma";
import { withApiLogging } from "@/lib/request-response-logging";

export const runtime = "nodejs";
async function GETHandler(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!canManageBilling(user) && user.role !== "READ_ONLY_AUDITOR") return NextResponse.json({ error: "Agency billing access required." }, { status: 403 });
  const centerId = request.nextUrl.searchParams.get("centerId") ?? "";
  if (!centerId || !user.centerIds.includes(centerId) || !canAccessCenter(user, centerId)) return NextResponse.json({ error: "Select an authorized school." }, { status: 403 });
  const range = contractReportRange(request.nextUrl.searchParams.get("start"), request.nextUrl.searchParams.get("end"));
  if (!range) return NextResponse.json({ error: "Enter valid start and end dates in chronological order." }, { status: 400 });
  const contracts = await prisma.subsidyAuthorization.findMany({
    where: { centerId, agencyProgram: { centerId }, family: { centerId }, child: { family: { centerId } }, coverageStart: { lt: range.endExclusive }, coverageEnd: { gte: range.start } },
    select: { id: true, childId: true, coverageStart: true, coverageEnd: true, authorizedRateCents: true, familyCopayCents: true, unitType: true, status: true,
      authorizationNumber: true, child: { select: { fullName: true } }, family: { select: { name: true } }, agencyProgram: { select: { name: true } } },
    orderBy: [{ coverageStart: "asc" }, { id: "asc" }], take: 10001,
  });
  if (contracts.length > 10000) return NextResponse.json({ error: "More than 10,000 contracts match. Choose a smaller date range; no partial report was produced." }, { status: 422 });
  const rows = contracts.flatMap(contract => {
    const row = agencyContractReportRow(contract, range);
    return row ? [{ ...row, childName: contract.child.fullName, familyName: contract.family.name, agencyName: contract.agencyProgram.name, authorizationNumber: contract.authorizationNumber }] : [];
  });
  const note = "Stored contracts overlapping the selected dates. Monthly rates use monthly / 4 for the weekly reporting equivalent. Equivalents are not range totals, claims, or payments. Copays are shown separately. Review overlapping authorizations and missing historical contracts; current rates are not extrapolated outside their coverage dates.";
  const headers = { "Cache-Control": "private, no-store" };
  if (request.nextUrl.searchParams.get("format") === "csv") {
    const csvRows: unknown[][] = [[note], ["Authorization", "Child", "Family", "Agency", "Coverage start", "Coverage end", "Applicable start", "Applicable end", "Status", "Rate", "Cadence", "Copay", "Weekly reporting equivalent", "Review"]];
    for (const row of rows) csvRows.push([row.authorizationNumber, row.childName, row.familyName, row.agencyName, row.coverageStart, row.coverageEnd, row.applicableStart, row.applicableEnd, row.status, (row.authorizedRateCents / 100).toFixed(2), row.unitType, (row.familyCopayCents / 100).toFixed(2), row.weeklyEquivalentCents === null ? "" : (row.weeklyEquivalentCents / 100).toFixed(2), row.reviewReason]);
    return new NextResponse(csvRows.map(row => row.map(contractReportCsvCell).join(",")).join("\r\n"), { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="agency-contract-history.csv"' } });
  }
  return NextResponse.json({ rows, note }, { headers });
}
export const GET = withApiLogging("GET", GETHandler);
