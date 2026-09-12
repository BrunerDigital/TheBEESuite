/**
 * Parent shopping is not an activated product surface: SSR supplies no catalog.
 * Do not replace this code gate with an environment switch. Re-enabling requires
 * a reviewed atomic purchase/replay contract and school fulfillment approval;
 * see docs/PARENT_PRODUCT_PURCHASE_GATE_2026-09-12.md. Existing invoices and their
 * payment/reconciliation paths are deliberately outside this gate.
 */
export function parentProductPurchasingEnabled(): boolean {
  return false;
}
