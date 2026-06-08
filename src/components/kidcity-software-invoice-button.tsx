"use client";

import { useState, useTransition } from "react";
import { AlertCircle, CheckCircle2, FileText, Send } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

type Props = {
  disabled?: boolean;
};

type ResponseBody = {
  ok?: boolean;
  error?: string;
  mode?: string;
  stripe?: {
    id?: string;
    url?: string | null;
    invoicePdf?: string | null;
  };
};

export function KidCitySoftwareInvoiceButton({ disabled }: Props) {
  const [isPending, startTransition] = useTransition();
  const [statusMessage, setStatusMessage] = useState("");
  const [invoiceUrl, setInvoiceUrl] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  function sendInvoice() {
    startTransition(async () => {
      setStatusMessage("");
      setInvoiceUrl("");
      setErrorMessage("");
      const response = await fetch("/api/billing/corporate/kidcity-software-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sendInvoice: true }),
      });
      const json = await response.json().catch(() => null) as ResponseBody | null;
      if (!response.ok || !json?.ok) {
        setErrorMessage(json?.error || "Kid City software invoice could not be created.");
        return;
      }
      setInvoiceUrl(json.stripe?.url || "");
      setStatusMessage(`Stripe invoice ${json.stripe?.id || ""} was created and sent.`.trim());
    });
  }

  return (
    <div className="space-y-3">
      {statusMessage ? (
        <Alert>
          <CheckCircle2 className="size-4" />
          <AlertTitle>Invoice sent</AlertTitle>
          <AlertDescription>
            {statusMessage}
            {invoiceUrl ? (
              <>
                {" "}
                <a className="font-medium underline underline-offset-4" href={invoiceUrl} target="_blank" rel="noreferrer">
                  Open Stripe invoice
                </a>
              </>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}
      {errorMessage ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Needs attention</AlertTitle>
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      ) : null}
      <Button disabled={disabled || isPending} onClick={sendInvoice} className="w-full">
        {isPending ? <FileText data-icon="inline-start" /> : <Send data-icon="inline-start" />}
        {isPending ? "Creating Stripe invoice..." : "Create and Send Kid City Invoice"}
      </Button>
    </div>
  );
}
