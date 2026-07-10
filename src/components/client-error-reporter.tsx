"use client";

import { useEffect } from "react";

type ReportSource =
  | "window.error"
  | "window.unhandledrejection"
  | "react.error_boundary"
  | "react.global_error"
  | "manual";

type ClientErrorReportInput = {
  source: ReportSource;
  errorType?: string;
  message?: string;
  stackSample?: string;
  componentStack?: string;
  metadata?: Record<string, unknown>;
};

const reportedKeys = new Set<string>();

function reportingEnabled() {
  return process.env.NEXT_PUBLIC_CLIENT_ERROR_REPORTING !== "off";
}

function errorLike(input: unknown) {
  if (input instanceof Error) {
    return {
      errorType: input.name || "Error",
      message: input.message || "",
      stackSample: input.stack || "",
    };
  }
  if (input && typeof input === "object") {
    const value = input as { name?: unknown; message?: unknown; stack?: unknown };
    return {
      errorType: typeof value.name === "string" ? value.name : "Error",
      message: typeof value.message === "string" ? value.message : String(input),
      stackSample: typeof value.stack === "string" ? value.stack : "",
    };
  }
  return {
    errorType: "Error",
    message: typeof input === "string" ? input : "Unknown client error",
    stackSample: "",
  };
}

function reportKey(payload: ClientErrorReportInput) {
  return [
    payload.source,
    payload.errorType || "",
    payload.message || "",
    typeof window !== "undefined" ? window.location.pathname : "",
  ].join(":").slice(0, 500);
}

export function reportClientError(error: unknown, source: ReportSource, metadata?: Record<string, unknown>) {
  if (!reportingEnabled() || typeof window === "undefined") return;

  const normalized = errorLike(error);
  const payload: ClientErrorReportInput & { path: string } = {
    source,
    errorType: normalized.errorType,
    message: normalized.message,
    stackSample: normalized.stackSample,
    path: window.location.pathname,
    metadata,
  };
  const key = reportKey(payload);
  if (reportedKeys.has(key)) return;
  reportedKeys.add(key);

  const body = JSON.stringify(payload);
  if (navigator.sendBeacon) {
    const blob = new Blob([body], { type: "application/json" });
    if (navigator.sendBeacon("/api/system/client-error-reports", blob)) return;
  }

  void fetch("/api/system/client-error-reports", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => undefined);
}

export function ClientErrorReporter() {
  useEffect(() => {
    function handleError(event: ErrorEvent) {
      reportClientError(event.error || event.message, "window.error", {
        filename: event.filename,
        line: event.lineno,
        column: event.colno,
      });
    }

    function handleUnhandledRejection(event: PromiseRejectionEvent) {
      reportClientError(event.reason, "window.unhandledrejection");
    }

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, []);

  return null;
}
