"use client";

import { useEffect } from "react";
import Link from "next/link";
import { reportClientError } from "@/components/client-error-reporter";
import { PageState } from "@/components/page-state";
import { Button } from "@/components/ui/button";
import { isRecoverableClientLoadFailure, recoverClientAssetsAndReload } from "@/lib/client-load-recovery";

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

    void recoverClientAssetsAndReload();
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
