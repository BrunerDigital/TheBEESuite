"use client";

import { useEffect } from "react";
import Link from "next/link";
import { reportClientError } from "@/components/client-error-reporter";
import { PageState } from "@/components/page-state";
import { Button } from "@/components/ui/button";

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
    <PageState
      title="We couldn't load this page"
      description="Try loading it again. If the problem continues, return to The BEE Suite home or contact support."
      actions={(
        <>
          <Button variant="outline" nativeButton={false} render={<Link href="/" />}>
            Go to home
          </Button>
          <Button type="button" onClick={reset}>
            Try again
          </Button>
        </>
      )}
    />
  );
}
