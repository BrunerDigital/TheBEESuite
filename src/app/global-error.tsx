"use client";

import { useEffect } from "react";
import { reportClientError } from "@/components/client-error-reporter";
import Link from "next/link";
import "./globals.css";

const CLIENT_LOAD_RECOVERY_KEY = "bee-suite-client-load-recovery-at";
const CLIENT_LOAD_RECOVERY_WINDOW_MS = 60_000;

function isRecoverableClientLoadFailure(error: Error) {
  const assetLoadFailure = error.name === "ChunkLoadError"
    || /failed to load chunk|loading chunk .* failed/i.test(error.message);
  const parentNetworkFailure = window.location.pathname.startsWith("/parent-portal")
    && /load failed|network error|failed to fetch/i.test(error.message);
  return assetLoadFailure || parentNetworkFailure;
}

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    reportClientError(error, "react.global_error", { digest: error.digest });
    if (!isRecoverableClientLoadFailure(error)) return;

    try {
      const lastRecoveryAt = Number(window.sessionStorage.getItem(CLIENT_LOAD_RECOVERY_KEY) || "0");
      if (Date.now() - lastRecoveryAt < CLIENT_LOAD_RECOVERY_WINDOW_MS) return;
      window.sessionStorage.setItem(CLIENT_LOAD_RECOVERY_KEY, String(Date.now()));
    } catch {
      return;
    }
    window.location.reload();
  }, [error]);

  return (
    <html lang="en" className="dark h-full antialiased">
      <body className="min-h-full bg-[#05070a] text-white">
        <main className="flex min-h-screen items-center justify-center px-6">
          <section className="max-w-md space-y-5 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-300">The BEE Suite</p>
            <h1 className="text-3xl font-semibold">We couldn&apos;t load this page.</h1>
            <p className="text-sm leading-6 text-slate-300">
              Try loading it again. If the problem continues, return to The BEE Suite home or contact support.
            </p>
            <Link href="/" className="inline-flex min-h-11 items-center justify-center rounded-md bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/20">
              Go to The BEE Suite home
            </Link>
            <button
              type="button"
              onClick={unstable_retry}
              className="rounded-md bg-amber-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
            >
              Try loading again
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-md bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20"
            >
              Reload this page
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
