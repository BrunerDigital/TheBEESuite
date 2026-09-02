import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export function ParentPortalAccessBlocked() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 py-10">
      <div>
        <p className="text-sm font-semibold text-primary">Parent portal</p>
        <h1 className="mt-2 text-balance text-3xl font-semibold tracking-tight">Family access needs review</h1>
      </div>
      <Alert className="border-amber-500/40 bg-amber-500/10">
        <AlertTriangle />
        <AlertTitle>Your family link needs review</AlertTitle>
        <AlertDescription>
          We paused access because this login is connected to more than one family record. No family or child details are being shown. Please contact your school or BEE Suite support so the correct record can be confirmed.
        </AlertDescription>
      </Alert>
      <Button nativeButton={false} render={<Link href="/support" />}>Contact support</Button>
    </div>
  );
}
