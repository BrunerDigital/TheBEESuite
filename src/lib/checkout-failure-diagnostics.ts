// Only fixed diagnostic labels may enter operational logs. Provider messages,
// request bodies, customer/account identifiers and redirect URLs remain private.
export function checkoutFailureDiagnostics(payload: unknown) {
  const error = payload && typeof payload === "object" && "error" in payload
    ? (payload as { error?: unknown }).error : null;
  const record = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const categories = new Set([
    "parameter_invalid_empty", "parameter_invalid_integer", "parameter_invalid_string_blank",
    "parameter_invalid_string_empty", "parameter_missing", "parameter_unknown",
    "resource_missing", "payment_method_unactivated", "payment_method_configuration_invalid",
    "amount_too_small", "amount_too_large", "idempotency_key_in_use",
  ]);
  const fields = new Set([
    "customer", "customer_email", "payment_method_configuration", "payment_method_types",
    "payment_method_types[0]", "payment_method_options[us_bank_account][verification_method]",
    "payment_method_options[us_bank_account][financial_connections][permissions]",
    "payment_method_options[us_bank_account][financial_connections][permissions][0]",
    "payment_intent_data[application_fee_amount]", "metadata", "payment_intent_data[metadata]",
    "success_url", "cancel_url", "branding_settings", "line_items",
  ]);
  return {
    category: typeof record.code === "string" && categories.has(record.code) ? record.code : "unclassified",
    filter: typeof record.param === "string" && fields.has(record.param) ? record.param : "unclassified",
    type: ["invalid_request_error", "api_error", "authentication_error", "idempotency_error", "rate_limit_error"]
      .includes(String(record.type)) ? String(record.type) : "unclassified",
  };
}
