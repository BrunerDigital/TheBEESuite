/**
 * School-scoped directory queries stay bounded, while still covering a normal
 * full-school ProCare export in one response. The UI compares loaded rows with
 * the corresponding database count so larger schools are never truncated
 * silently.
 */
export const SCHOOL_DASHBOARD_LIST_LIMIT = 1_000;
