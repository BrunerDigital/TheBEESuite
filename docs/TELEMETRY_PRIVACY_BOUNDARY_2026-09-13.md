# Telemetry privacy boundary — September 13, 2026

## Current truth before editing

Inspected main `12612f539a6287e1332683202e9a74a13a3358d9` in the isolated release worktree. Two independent read-only investigations and a local fake-input reproduction confirmed: the global Vercel Analytics wrapper queues raw pathname as well as route; Speed Insights exposes an outbound URL; the first-party error reporter serializes raw error text, metadata and pathname. The server path sanitizer misses dotted payment tokens, short aliases and encoded identifiers. Same-origin Referer can copy a bearer URL into operational logs. No real token or production diagnostic contents were sampled, and no historical exposure is asserted.

Installed Analytics 2.0.1 and Speed Insights 2.0.0 support per-event cancellation through `beforeSend`; their scripts persist after component unmount. Installed Next.js pathname, client-component and metadata guidance was read. The fix must guard initial injection and every delayed event, sanitize before serialization and again at storage, and protect the Referer copy. Useful first-party diagnostics, release attribution, occurrence counts, rate limits and same-origin checks must remain.

Authorization: code/configuration/tests only. No deletion of historical reports/logs, provider configuration, identity changes, payment attempts or outbound messages. Production and local evidence will be appended after validation. This document is not an assertion that past telemetry is clean.

Official references: [Vercel analytics redaction](https://vercel.com/docs/analytics/redacting-sensitive-data), [Speed Insights configuration](https://vercel.com/docs/speed-insights/package), [Analytics privacy data points](https://vercel.com/docs/analytics/privacy-policy).

## Implemented boundary

Third-party SDKs are limited to six reviewed static public information paths: `/`, `/privacy`, `/terms`, `/eula`, `/support`, `/resources`, without query strings or fragments. Authenticated, credential, enrollment and unknown pages do not inject the SDKs. Stable callbacks recheck the event URL, current location and document referrer, reject untrusted/encoded/foreign/credentialed URLs and custom events, and replace the vital route with the reviewed static path. Existing third-party dashboard/portal telemetry is intentionally no longer collected; first-party error monitoring remains.

Client diagnostics suppress payment/setup/recovery credential paths before serialization. Server handling independently suppresses cached/direct credential reports before attribution or storage. Other reports use normalized routes, known error types, PII/URL/token redaction before truncation, and fixed numeric/status/digest metadata keys. Quoted/spaced credential assignments suppress the entire text field. Source, severity, safe stack context, line/column, release attribution, occurrence counts, same-origin enforcement and rate limiting remain. The reporter's in-memory duplicate set is bounded. Neither normal nor pre-parse failure logging samples this endpoint's raw body; Referer is fully redacted in operational logs. Application document metadata, response headers and fallback fetch use `no-referrer`.

Independent candidate review found two additional boundary cases (quoted credential strings and pre-parse failure body sampling). Both were fixed and verified against the actual request wrapper; the reviewer found no remaining material blocker in those corrections. No provider script implementation or historical report contents were claimed inspected.

## Local verification

`npm run vercel-build` passed: Prisma generation, lint (zero errors, one existing unrelated warning), TypeScript, all **2,299 tests**, optimized Next.js build. Focused diagnostics/privacy/real-route/regression suite: **71 passed**. Native/store static checks passed without native-source changes. Logs: `output/wave22-vercel-build.log`, `output/wave22-focused-final.log`, `output/wave22-mobile-store-check.log`.

Actual reporting components and installed SDKs passed eight cases in each engine, including seven cold starts and five delayed-navigation callback cases. Both beacon and fallback fetch bodies were received by the local fake HTTP server and checked for redaction and absent Referer. SDK collector scripts were intercepted locally; no provider traffic occurred. Safe public pageview/vital and ordinary diagnostic positive controls passed. Five source hashes remained stable per run:

- Chromium: `output/playwright/telemetry-privacy-chromium-2026-09-13T23-42-02-613Z/results.json`.
- WebKit: `output/playwright/telemetry-privacy-webkit-2026-09-13T23-41-43-632Z/results.json`.

Earlier harness failures are retained: WebKit beacon bodies are not available through Playwright's intercepted `postData`, so the final test reads the actual local receiver; redacted duplicate reports also correctly collapsed until the fallback positive control used a distinct safe diagnostic. No production error was induced or report row created. Production deployment and read-only privacy observations remain to be recorded after protected release.
