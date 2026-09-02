import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export function ParentPortalPaymentReturn() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 py-10">
      <Alert className="border-emerald-500/40 bg-emerald-500/10">
        <CheckCircle2 />
        <AlertTitle>Payment submitted</AlertTitle>
        <AlertDescription>
          Your secure checkout returned successfully. Card payments usually update right away, while bank payments can remain processing until the bank confirms them. Please do not submit the payment again while it is processing.
        </AlertDescription>
      </Alert>
      <Button nativeButton={false} variant="outline" render={<Link href="/support" />}>Get payment help</Button>
    </div>
  );
}
