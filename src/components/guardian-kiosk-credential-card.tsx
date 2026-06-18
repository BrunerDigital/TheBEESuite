"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Copy, ExternalLink, Printer, QrCode, ShieldCheck } from "lucide-react";
import QRCode from "qrcode";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { GuardianKioskCredential } from "@/lib/kiosk-credentials";

type Props = {
  credential: GuardianKioskCredential;
  showToken?: boolean;
};

function formatDateTime(value: string | null) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  }).format(new Date(value));
}

export function GuardianKioskCredentialCard({ credential, showToken = true }: Props) {
  const [qrImage, setQrImage] = useState<{ token: string; dataUrl: string }>({ token: "", dataUrl: "" });
  const [qrError, setQrError] = useState<{ token: string; message: string }>({ token: "", message: "" });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    if (!credential.qrToken) return;

    QRCode.toDataURL(credential.qrToken, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 220,
      color: { dark: "#111827", light: "#ffffff" },
    })
      .then((nextDataUrl) => {
        if (active) setQrImage({ token: credential.qrToken ?? "", dataUrl: nextDataUrl });
      })
      .catch(() => {
        if (active) setQrError({ token: credential.qrToken ?? "", message: "QR code could not be rendered." });
      });

    return () => {
      active = false;
    };
  }, [credential.qrToken]);

  async function copyToken() {
    if (!credential.qrToken) return;
    await navigator.clipboard?.writeText(credential.qrToken);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  const dataUrl = qrImage.token === credential.qrToken ? qrImage.dataUrl : "";

  return (
    <div className="space-y-3 rounded-lg border bg-background/45 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium">
            <QrCode className="size-4 text-primary" />
            {credential.guardianName}
          </div>
          <div className="text-xs text-muted-foreground">
            {credential.familyName}
            {credential.centerName ? ` · ${credential.centerName}` : ""}
          </div>
        </div>
        <Badge variant={credential.qrToken ? "default" : "outline"}>
          {credential.qrToken ? "QR ready" : "PIN required"}
        </Badge>
      </div>

      {credential.qrToken ? (
        <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
          <div className="flex min-h-[176px] w-full items-center justify-center rounded-lg border bg-white p-3 sm:w-[176px]">
            {dataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={dataUrl} alt={`Kiosk QR code for ${credential.guardianName}`} className="size-40" />
            ) : (
              <QrCode className="size-10 text-slate-400" />
            )}
          </div>
          <div className="space-y-2">
            <div className="grid gap-2 text-xs text-muted-foreground">
              <span>PIN set: {formatDateTime(credential.pinSetAt)}</span>
              <span>Kiosk: {credential.kioskPath}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" onClick={copyToken}>
                <Copy data-icon="inline-start" />
                {copied ? "Copied" : "Copy QR"}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => window.print()}>
                <Printer data-icon="inline-start" />
                Print
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => window.location.assign(credential.kioskPath)}>
                <ExternalLink data-icon="inline-start" />
                Open Kiosk
              </Button>
            </div>
            {showToken ? (
              <Textarea
                readOnly
                value={credential.qrToken}
                aria-label={`QR scan payload for ${credential.guardianName}`}
                className="max-h-24 min-h-16 resize-none font-mono text-xs"
              />
            ) : null}
          </div>
        </div>
      ) : (
        <Alert>
          <ShieldCheck className="size-4" />
          <AlertTitle>Credential not active</AlertTitle>
          <AlertDescription>Set a 4 digit kiosk PIN to create the matching QR code.</AlertDescription>
        </Alert>
      )}

      {qrError.token === credential.qrToken && qrError.message ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Needs attention</AlertTitle>
          <AlertDescription>{qrError.message}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
