import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export function AppReviewScopeBlocked({ portal }: { portal: "Parent" | "Teacher" }) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 py-10">
      <div>
        <p className="text-sm font-semibold text-primary">{portal} App Review</p>
        <h1 className="mt-2 text-balance text-3xl font-semibold tracking-tight">Review workspace paused safely</h1>
      </div>
      <Alert className="border-amber-500/40 bg-amber-500/10">
        <ShieldAlert />
        <AlertTitle>The synthetic review fixture needs to be refreshed</AlertTitle>
        <AlertDescription>
          No family, child, staff, message, document, media, or billing details are being shown. Contact BEE Suite support so the isolated App Review workspace can be revalidated.
        </AlertDescription>
      </Alert>
      <Button nativeButton={false} render={<Link href="/support" />}>Contact support</Button>
    </div>
  );
}
