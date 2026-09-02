import { NextResponse } from "next/server";
import {
  createSessionToken,
  getCurrentUser,
  getSession,
  sessionCookieOptions,
  SESSION_COOKIE,
} from "@/lib/auth";
import {
  centerIdFromWorkspaceSelection,
  isWorkspaceSelectionValue,
  workspaceDestinationAfterSelection,
} from "@/lib/workspace-selection";

type WorkspaceSelectionBody = {
  selection?: unknown;
  nextPath?: unknown;
};

export async function POST(request: Request) {
  const [session, user] = await Promise.all([
    getSession(),
    getCurrentUser({ allowPasswordResetRequired: true }),
  ]);
  if (!session || !user) {
    return NextResponse.json({ ok: false, error: "Your session has expired. Please sign in again." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({})) as WorkspaceSelectionBody;
  if (!isWorkspaceSelectionValue(body.selection)) {
    return NextResponse.json({ ok: false, error: "Choose a valid workspace." }, { status: 400 });
  }

  const selectedCenterId = centerIdFromWorkspaceSelection(body.selection);
  const selectionAllowed = body.selection === "all"
    ? Boolean(user.workspace?.canSelectAll)
    : Boolean(selectedCenterId && (user.authorizedCenterIds ?? user.centerIds).includes(selectedCenterId));
  if (!selectionAllowed) {
    return NextResponse.json({ ok: false, error: "That workspace is no longer authorized for this account." }, { status: 403 });
  }

  const nextPath = workspaceDestinationAfterSelection({
    nextPath: body.nextPath,
    selection: body.selection,
    previousSelection: session.workspaceSelection,
  });
  const response = NextResponse.json({ ok: true, nextPath });
  response.cookies.set(
    SESSION_COOKIE,
    createSessionToken({
      id: user.id,
      email: user.email,
      role: user.role,
      sessionVersion: session.sessionVersion,
      deviceSessionId: session.deviceSessionId,
      workspaceSelection: body.selection,
    }),
    sessionCookieOptions(),
  );
  return response;
}
