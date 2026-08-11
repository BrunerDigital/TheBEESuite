"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { AlertCircle, ArrowRight, Printer, QrCode, ShieldCheck } from "lucide-react";
import QRCode from "qrcode";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { GuardianKioskCredential } from "@/lib/kiosk-credentials";
import { useSchoolTimeZone } from "@/components/school-time-zone-context";
import { formatZonedTimestamp } from "@/lib/zoned-date-time";

type Props = {
  credential: GuardianKioskCredential;
  previewMode?: boolean;
};

function formatDateTime(value: string | null, timeZone: string) {
  return formatZonedTimestamp(value, timeZone);
}

export function GuardianKioskCredentialCard({ credential, previewMode = false }: Props) {
  const timeZone = useSchoolTimeZone();
  const [qrImage, setQrImage] = useState<{ token: string; dataUrl: string }>({ token: "", dataUrl: "" });
  const [qrError, setQrError] = useState<{ token: string; message: string }>({ token: "", message: "" });

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
        if (active) {
          setQrError({
            token: credential.qrToken ?? "",
            message: "The QR code did not load. Refresh this page, or use your Family PIN at the school.",
          });
        }
      });

    return () => {
      active = false;
    };
  }, [credential.qrToken]);

  const dataUrl = qrImage.token === credential.qrToken ? qrImage.dataUrl : "";

  function printCheckInCard() {
    if (!dataUrl) return;
    const printWindow = window.open("", "_blank", "width=560,height=760");
    if (!printWindow) {
      setQrError({ token: credential.qrToken ?? "", message: "Allow pop-ups to print the check-in card." });
      return;
    }

    printWindow.opener = null;
    printWindow.document.title = `${credential.familyName} school check-in`;
    const style = printWindow.document.createElement("style");
    style.textContent = `
      body { margin: 0; background: #fff; color: #172033; font-family: Arial, sans-serif; }
      main { box-sizing: border-box; width: 100%; max-width: 520px; margin: 0 auto; padding: 40px; text-align: center; }
      .label { color: #6b7280; font-size: 12px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
      h1 { margin: 10px 0 4px; font-size: 28px; }
      p { margin: 6px 0; color: #4b5563; font-size: 15px; }
      img { display: block; width: 280px; height: 280px; margin: 28px auto; }
      .help { padding-top: 20px; border-top: 1px solid #d1d5db; font-size: 13px; }
      @page { margin: 0.5in; }
    `;
    const card = printWindow.document.createElement("main");
    const label = printWindow.document.createElement("div");
    label.className = "label";
    label.textContent = "School Check-In";
    const heading = printWindow.document.createElement("h1");
    heading.textContent = credential.familyName;
    const guardian = printWindow.document.createElement("p");
    guardian.textContent = credential.guardianName;
    const school = printWindow.document.createElement("p");
    school.textContent = credential.centerName ?? "Your school";
    const image = printWindow.document.createElement("img");
    image.src = dataUrl;
    image.alt = "School check-in QR code";
    const help = printWindow.document.createElement("p");
    help.className = "help";
    help.textContent = "Bring this card to the school lobby and scan the QR code at check-in.";
    card.append(label, heading, guardian, school, image, help);
    printWindow.document.head.append(style);
    printWindow.document.body.replaceChildren(card);
    printWindow.document.close();
    window.setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 100);
  }

  return (
    <div className="space-y-3 rounded-lg border bg-background/45 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-medium">
            <QrCode className="size-4 text-primary" aria-hidden="true" />
            {credential.guardianName}
          </h3>
          <div className="text-xs text-muted-foreground">
            {credential.familyName}
            {credential.centerName ? ` · ${credential.centerName}` : ""}
          </div>
        </div>
        <Badge variant={credential.qrToken ? "default" : "outline"}>
          {credential.qrToken ? "QR code ready" : "Family PIN needed"}
        </Badge>
      </div>

      {credential.qrToken ? (
        <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
          <div className="flex min-h-[176px] w-full items-center justify-center rounded-lg border bg-white p-3 sm:w-[176px]">
            {dataUrl ? (
              <Image
                src={dataUrl}
                alt={`School check-in QR code for ${credential.guardianName}`}
                width={160}
                height={160}
                className="h-auto w-40 max-w-full"
                unoptimized
              />
            ) : (
              <div role="status" aria-live="polite" className="grid place-items-center gap-2 text-slate-500">
                <QrCode className="size-10" aria-hidden="true" />
                <span className="sr-only">Preparing QR code…</span>
              </div>
            )}
          </div>
          <div className="space-y-2">
            <div className="grid gap-2 text-xs text-muted-foreground">
              <span>PIN updated {formatDateTime(credential.pinSetAt, timeZone)}</span>
              <span>Use your Family PIN or this QR code at the school lobby.</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" disabled={previewMode || !dataUrl} onClick={printCheckInCard}>
                <Printer data-icon="inline-start" aria-hidden="true" />
                Print Check-In Card
              </Button>
              {previewMode ? (
                <Button type="button" size="sm" variant="outline" disabled>
                  <ArrowRight data-icon="inline-start" aria-hidden="true" />
                  Open Family Check-In
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  nativeButton={false}
                  render={<Link href={credential.kioskPath} prefetch={false} />}
                >
                  <ArrowRight data-icon="inline-start" aria-hidden="true" />
                  Open Family Check-In
                </Button>
              )}
            </div>
          </div>
        </div>
      ) : (
        <Alert>
          <ShieldCheck className="size-4" aria-hidden="true" />
          <AlertTitle>Set up school check-in</AlertTitle>
          <AlertDescription>Set a 4-Digit Family PIN to create the matching QR code.</AlertDescription>
        </Alert>
      )}

      {qrError.token === credential.qrToken && qrError.message ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" aria-hidden="true" />
          <AlertTitle>Needs attention</AlertTitle>
          <AlertDescription>{qrError.message}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
