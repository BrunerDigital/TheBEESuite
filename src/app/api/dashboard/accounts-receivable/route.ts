import { NextResponse } from "next/server";
import {
  accountBalanceCenterIds,
  accountsReceivableFamilySelect,
  buildAccountsReceivableSnapshot,
  canViewAccountBalances,
} from "@/lib/accounts-receivable";
import { canManageBilling, getCurrentUser } from "@/lib/auth";
import { loadAgencyBalanceSummary } from "@/lib/agency-balance-summary";
import { visibleFamilyWhere } from "@/lib/corporate-view-scope";
import { currentlyEnrolledChildWhere } from "@/lib/enrollment-status";
import { prisma } from "@/lib/prisma";
import { withApiLogging } from "@/lib/request-response-logging";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function GETHandler() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  }
  if (!canViewAccountBalances(user)) {
    return NextResponse.json({ ok: false, error: "School account balances are not available for this role." }, { status: 403 });
  }

  const centerIds = accountBalanceCenterIds(user);
  const centers = await prisma.center.findMany({
    where: { id: { in: centerIds }, status: { not: "closed" } },
    orderBy: [{ state: "asc" }, { city: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      crmLocationId: true,
    },
  });
  const activeCenterIds = centers.map((center) => center.id);
  const families = await prisma.family.findMany({
    where: {
      ...visibleFamilyWhere(activeCenterIds),
      children: { some: currentlyEnrolledChildWhere() },
    },
    orderBy: { name: "asc" },
    select: accountsReceivableFamilySelect,
  });

  const centerNameById = Object.fromEntries(
    centers.map((center) => [center.id, center.crmLocationId ?? center.name]),
  );
  const asOf = new Date();
  const accountsReceivable = buildAccountsReceivableSnapshot(families, centerNameById, asOf);
  const canReadAgency = canManageBilling(user) || user.role === "READ_ONLY_AUDITOR";
  const agencyBalances = canReadAgency ? await loadAgencyBalanceSummary(activeCenterIds, centerNameById, asOf) : undefined;

  return NextResponse.json(
    { ok: true, accountsReceivable, agencyBalances, canManageBilling: canManageBilling(user) },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export const GET = withApiLogging("GET", GETHandler);
