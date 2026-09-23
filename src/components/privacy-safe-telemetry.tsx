"use client";

import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { Analytics, type BeforeSendEvent } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { filterTelemetryEvent, isPublicTelemetryLocation } from "@/lib/telemetry-privacy";

export function beforeAnalytics(event: BeforeSendEvent) {
  return filterTelemetryEvent(event, window.location.href, document.referrer);
}

export function beforeSpeedInsights(event: { type: "vital"; url: string; route?: string }) {
  return filterTelemetryEvent(event, window.location.href, document.referrer);
}

const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

export function PrivacySafeTelemetry() {
  const pathname = usePathname();
  const hydrated = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
  // A callback must recheck location when invoked: SDK scripts survive unmounts
  // and a delayed vital may originate on a different page.
  if (!hydrated || !pathname || typeof window === "undefined" ||
      !isPublicTelemetryLocation(window.location.href) ||
      (document.referrer && !isPublicTelemetryLocation(document.referrer))) return null;
  return <><Analytics beforeSend={beforeAnalytics} debug={false} /><SpeedInsights beforeSend={beforeSpeedInsights} debug={false} /></>;
}
