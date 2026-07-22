"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DEFAULT_SCHOOL_TIME_ZONE, useSchoolTimeZone } from "@/components/school-time-zone-context";
import { formatZonedTimestamp } from "@/lib/zoned-date-time";

export function formatPrintDateTime(value: Date | string | null | undefined, timeZone = DEFAULT_SCHOOL_TIME_ZONE) {
  return formatZonedTimestamp(value, timeZone);
}

export function ReportPrintStyles() {
  return (
    <style>{`
      @media print {
        body.bee-report-printing * {
          visibility: hidden !important;
        }

        body.bee-report-printing .bee-print-report-active,
        body.bee-report-printing .bee-print-report-active * {
          visibility: visible !important;
        }

        body.bee-report-printing .bee-print-report-active {
          display: block !important;
          position: absolute !important;
          inset: 0 auto auto 0 !important;
          width: 100% !important;
          min-height: 100% !important;
          padding: 0.25in !important;
          background: #ffffff !important;
          color: #111827 !important;
          font-family: Arial, sans-serif !important;
          font-size: 11px !important;
          line-height: 1.35 !important;
        }

        body.bee-report-printing .bee-print-report-active h1 {
          margin: 0 0 8px !important;
          font-size: 22px !important;
          line-height: 1.2 !important;
        }

        body.bee-report-printing .bee-print-report-active h2 {
          margin: 18px 0 8px !important;
          font-size: 15px !important;
        }

        body.bee-report-printing .bee-print-report-active p {
          margin: 0 0 4px !important;
        }

        body.bee-report-printing .bee-print-report-active table {
          width: 100% !important;
          border-collapse: collapse !important;
          page-break-inside: auto !important;
        }

        body.bee-report-printing .bee-print-report-active tr {
          page-break-inside: avoid !important;
          page-break-after: auto !important;
        }

        body.bee-report-printing .bee-print-report-active th,
        body.bee-report-printing .bee-print-report-active td {
          border: 1px solid #111827 !important;
          padding: 5px !important;
          text-align: left !important;
          vertical-align: top !important;
        }

        body.bee-report-printing .bee-print-report-active th {
          background: #f3f4f6 !important;
          font-weight: 700 !important;
        }
      }
    `}</style>
  );
}

export function usePrintableReport() {
  const [active, setActive] = useState(false);
  const [generatedAt, setGeneratedAt] = useState<Date | null>(null);

  useEffect(() => {
    function handleAfterPrint() {
      document.body.classList.remove("bee-report-printing");
      setActive(false);
    }
    window.addEventListener("afterprint", handleAfterPrint);
    return () => {
      document.body.classList.remove("bee-report-printing");
      window.removeEventListener("afterprint", handleAfterPrint);
    };
  }, []);

  function print() {
    setGeneratedAt(new Date());
    setActive(true);
    window.setTimeout(() => {
      document.body.classList.add("bee-report-printing");
      window.print();
    }, 0);
  }

  return { active, generatedAt, print };
}

export function PrintableReport({
  active,
  children,
  label,
}: {
  active: boolean;
  children: ReactNode;
  label: string;
}) {
  if (!active) return null;

  return (
    <section className="bee-print-report-active hidden" aria-label={label}>
      {children}
    </section>
  );
}

export function ReportPrintAction({
  buttonLabel = "Print report",
  reportTitle,
  meta = [],
  label,
  disabled = false,
  children,
}: {
  buttonLabel?: string;
  reportTitle: string;
  meta?: Array<string | null | undefined>;
  label: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  const timeZone = useSchoolTimeZone();
  const { active, generatedAt, print } = usePrintableReport();

  return (
    <>
      <ReportPrintStyles />
      <Button variant="outline" onClick={print} disabled={disabled}>
        <Printer data-icon="inline-start" />
        {buttonLabel}
      </Button>
      <PrintableReport active={active} label={label}>
        <header>
          <h1>{reportTitle}</h1>
          {meta.flatMap((item) => (item ? [item] : [])).map((item) => <p key={item}>{item}</p>)}
          <p>Generated: {formatPrintDateTime(generatedAt, timeZone)}</p>
        </header>
        {children}
      </PrintableReport>
    </>
  );
}
