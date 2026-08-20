"use client";

import { useEffect } from "react";
import Link from "next/link";
import { reportClientError } from "@/components/client-error-reporter";
import { PageState } from "@/components/page-state";
import { Button } from "@/components/ui/button";

const CLIENT_LOAD_RECOVERY_KEY = "bee-suite-client-load-recovery-at";
const CLIENT_LOAD_RECOVERY_WINDOW_MS = 60_000;

function isRecoverableClientLoadFailure(error: Error) {
  const assetLoadFailure = error.name === "ChunkLoadError"
    || /failed to load chunk|loading chunk .* failed/i.test(error.message);
  const parentNetworkFailure = window.location.pathname.startsWith("/parent-portal")
    && /load failed|network error|failed to fetch/i.test(error.message);
  return assetLoadFailure || parentNetworkFailure;
}

function reloadDocument() {
  window.location.reload();
}

export default function AppError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    reportClientError(error, "react.error_boundary", { digest: error.digest });
    if (!isRecoverableClientLoadFailure(error)) return;

    try {
      const lastRecoveryAt = Number(window.sessionStorage.getItem(CLIENT_LOAD_RECOVERY_KEY) || "0");
      if (Date.now() - lastRecoveryAt < CLIENT_LOAD_RECOVERY_WINDOW_MS) return;
      window.sessionStorage.setItem(CLIENT_LOAD_RECOVERY_KEY, String(Date.now()));
    } catch {
      // Avoid a reload loop when storage cannot record that recovery was attempted.
      return;
    }
    reloadDocument();
  }, [error]);

  return (
    <PageState
      title="We couldn't load this page"
      description="Try loading it again. If the problem continues, return to The BEE Suite home or contact support."
      actions={(
        <>
          <Button variant="outline" nativeButton={false} render={<Link href="/" />}>
            Go to home
          </Button>
          <Button type="button" onClick={unstable_retry}>
            Try again
          </Button>
          <Button type="button" onClick={reloadDocument}>
            Reload this page
          </Button>
        </>
      )}
    />
  );
}
