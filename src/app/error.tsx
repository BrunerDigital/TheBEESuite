"use client";

import { useEffect } from "react";
import { reportClientError } from "@/components/client-error-reporter";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportClientError(error, "react.error_boundary", { digest: error.digest });
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#05070a] px-6 text-white">
      <section className="max-w-md space-y-5 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-300">The BEE Suite</p>
        <h1 className="text-3xl font-semibold">Something went wrong.</h1>
        <p className="text-sm leading-6 text-slate-300">
          The issue has been logged. Please try again, or contact support if it continues.
        </p>
        <button
          type="button"
          onClick={reset}
          className="rounded-md bg-amber-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
        >
          Try again
        </button>
      </section>
    </main>
  );
}
