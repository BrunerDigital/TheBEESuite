"use client";

import { useEffect } from "react";
import Link from "next/link";
import { reportClientError } from "@/components/client-error-reporter";
import { PageState } from "@/components/page-state";
import { Button } from "@/components/ui/button";

const PARENT_LOAD_RECOVERY_KEY = "bee-suite-parent-load-recovery-at";
const PARENT_LOAD_RECOVERY_WINDOW_MS = 60_000;

function isParentLoadFailure(error: Error) {
  return window.location.pathname.startsWith("/parent-portal")
    && /load failed|network error|failed to fetch/i.test(error.message);
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
    if (!isParentLoadFailure(error)) return;

    try {
      const lastRecoveryAt = Number(window.sessionStorage.getItem(PARENT_LOAD_RECOVERY_KEY) || "0");
      if (Date.now() - lastRecoveryAt < PARENT_LOAD_RECOVERY_WINDOW_MS) return;
      window.sessionStorage.setItem(PARENT_LOAD_RECOVERY_KEY, String(Date.now()));
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
