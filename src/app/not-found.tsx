import Link from "next/link";
import { PageState } from "@/components/page-state";
import { Button } from "@/components/ui/button";

export default function NotFoundPage() {
  return (
    <PageState
      title="Page not found"
      description="The link may be outdated, or the page may have moved. Choose a destination below."
      actions={(
        <>
          <Button variant="outline" nativeButton={false} render={<Link href="/" />}>
            Go to home
          </Button>
          <Button nativeButton={false} render={<Link href="/parents" />}>
            Open Parent Portal
          </Button>
        </>
      )}
    />
  );
}

