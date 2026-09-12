"use client";

import { useEffect } from "react";
import { initializeUnsavedChangesHistory } from "./use-unsaved-changes-guard";

/** Root lifetime covers login-to-workspace and every client-side route. */
export function UnsavedChangesHistoryRuntime() {
  useEffect(() => { initializeUnsavedChangesHistory(); }, []);
  return null;
}
