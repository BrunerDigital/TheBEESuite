import { NextResponse } from "next/server";
import { canManageClassroomTasks, deriveClassroomOfflineQueueCredentials, getCurrentUser } from "@/lib/auth";
import { withApiLogging } from "@/lib/request-response-logging";

export const runtime = "nodejs";

async function GETHandler() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  if (!canManageClassroomTasks(user) || !user.assignedClassroomId) {
    return NextResponse.json({ ok: false, error: "An assigned classroom is required for offline recovery." }, { status: 403 });
  }
  return NextResponse.json({ ok: true, ...deriveClassroomOfflineQueueCredentials(user) });
}

export const GET = withApiLogging("GET", GETHandler);
