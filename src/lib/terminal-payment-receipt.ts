/** Only a recognized receipt can unlock a submitted reader payment. */
export function terminalPaymentReceiptStatus(httpOk: boolean, value: unknown, paymentId: string): "succeeded" | "failed" | "processing" | "review" {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "review";
  const receipt = value as Record<string, unknown>;
  if (receipt.paymentId !== undefined && receipt.paymentId !== paymentId) return "review";
  if (receipt.status === "processing") return "processing";
  if (httpOk && receipt.status === "succeeded" && receipt.ok === true && receipt.paymentId === paymentId) return "succeeded";
  // The server's confirmed failure receipt intentionally has ok:false.
  if (httpOk && receipt.ok === false && receipt.status === "failed" && receipt.paymentId === paymentId) return "failed";
  return "review";
}
