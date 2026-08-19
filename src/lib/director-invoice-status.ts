export const directorInvoiceStatusOptions = [
  { value: "open", label: "Open", paymentStatus: "OPEN" },
  { value: "paid", label: "Paid", paymentStatus: "PAID" },
  { value: "voided", label: "Voided", paymentStatus: "VOID" },
] as const;

export type DirectorInvoiceStatus = (typeof directorInvoiceStatusOptions)[number]["value"];
export type DirectorInvoicePaymentStatus = (typeof directorInvoiceStatusOptions)[number]["paymentStatus"];

export function normalizeDirectorInvoiceStatus(value: string | undefined): DirectorInvoiceStatus {
  return directorInvoiceStatusOptions.some((option) => option.value === value)
    ? value as DirectorInvoiceStatus
    : "open";
}

export function paymentStatusForDirectorInvoiceStatus(status: DirectorInvoiceStatus): DirectorInvoicePaymentStatus {
  return directorInvoiceStatusOptions.find((option) => option.value === status)?.paymentStatus ?? "OPEN";
}
