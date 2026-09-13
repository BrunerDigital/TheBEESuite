// Local-only entry point. Real reporting and installed SDK components; fake URLs.
import { createRoot } from "react-dom/client";
import { Suspense } from "react";
import { ClientErrorReporter, reportClientError } from "../../src/components/client-error-reporter";
import { PrivacySafeTelemetry, beforeAnalytics, beforeSpeedInsights } from "../../src/components/privacy-safe-telemetry";

const fixture = {
  navigate(path: string) { history.pushState({}, "", path); dispatchEvent(new Event("fixture-navigation")); },
  report(message: string) { reportClientError(new TypeError(message), "manual", { line: 12, column: 4, filename: location.href, token: "FakeShortCode" }); },
  analytics: beforeAnalytics,
  speed: beforeSpeedInsights,
};
Object.assign(window, { telemetryFixture: fixture });
createRoot(document.getElementById("root")!).render(<Suspense fallback={null}><main>Fake telemetry fixture</main><PrivacySafeTelemetry /><ClientErrorReporter /></Suspense>);
