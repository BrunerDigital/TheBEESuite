"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  directorInvoiceStatusOptions,
  type DirectorInvoiceStatus,
} from "@/lib/director-invoice-status";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function DirectorInvoiceStatusFilter({ value }: { value: DirectorInvoiceStatus }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  function changeStatus(nextStatus: DirectorInvoiceStatus | null) {
    if (!nextStatus || nextStatus === value) return;

    const params = new URLSearchParams(searchParams.toString());
    params.set("invoiceStatus", nextStatus);
    router.replace(`${pathname}?${params.toString()}#invoices`, { scroll: false });
  }

  return (
    <div className="flex min-w-44 flex-col gap-1.5">
      <label htmlFor="invoice-status-filter" className="text-xs font-medium text-muted-foreground">
        Invoice status
      </label>
      <Select value={value} onValueChange={changeStatus}>
        <SelectTrigger id="invoice-status-filter" aria-label="Filter invoices by status">
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end">
          {directorInvoiceStatusOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
