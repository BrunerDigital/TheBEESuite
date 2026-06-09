export type RegistrationPaymentPlan = {
  registrationFeeCents: number;
  depositCents: number;
  totalCents: number;
  required: boolean;
  label: string;
};

export type RegistrationPaymentStatus = {
  required: boolean;
  status: "not_required" | "invoice_open" | "paid";
  invoiceId: string | null;
  invoiceNumber: string | null;
  dueDate: string | null;
  registrationFeeCents: number;
  depositCents: number;
  totalCents: number;
  paidAt?: string | null;
  paymentId?: string | null;
};

const MAX_REGISTRATION_PAYMENT_CENTS = 500_000;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function clampCents(cents: number) {
  if (!Number.isFinite(cents)) return 0;
  return Math.min(Math.max(0, Math.round(cents)), MAX_REGISTRATION_PAYMENT_CENTS);
}

function centsFromCentsValue(value: unknown) {
  if (typeof value === "number") return clampCents(value);
  const text = clean(value).replace(/[$,\s]/g, "");
  if (!text) return 0;
  const parsed = Number.parseInt(text, 10);
  return Number.isFinite(parsed) ? clampCents(parsed) : 0;
}

function centsFromDollarValue(value: unknown) {
  if (typeof value === "number") return clampCents(value * 100);
  const text = clean(value).replace(/[$,\s]/g, "");
  if (!text) return 0;
  const parsed = Number.parseFloat(text);
  return Number.isFinite(parsed) ? clampCents(parsed * 100) : 0;
}

function firstPositiveCents(values: unknown[], parser: (value: unknown) => number) {
  for (const value of values) {
    const cents = parser(value);
    if (cents > 0) return cents;
  }
  return 0;
}

export function formatRegistrationPaymentAmount(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export function normalizeRegistrationPaymentPlan(input: {
  customFields?: unknown;
  registrationFeeCents?: unknown;
  depositCents?: unknown;
  defaultRegistrationFeeCents?: unknown;
  defaultDepositCents?: unknown;
}): RegistrationPaymentPlan {
  const fields = asRecord(input.customFields);
  const nested = asRecord(fields.registrationPaymentPlan);
  const registrationFeeCents = firstPositiveCents(
    [
      input.registrationFeeCents,
      nested.registrationFeeCents,
      nested.feeCents,
      fields.registrationFeeCents,
      fields.registrationFeeAmountCents,
      fields.registrationApplicationFeeCents,
      input.defaultRegistrationFeeCents,
    ],
    centsFromCentsValue,
  ) || firstPositiveCents(
    [nested.registrationFee, nested.fee, fields.registrationFee, fields.registrationApplicationFee],
    centsFromDollarValue,
  );
  const depositCents = firstPositiveCents(
    [
      input.depositCents,
      nested.depositCents,
      nested.registrationDepositCents,
      fields.registrationDepositCents,
      fields.depositCents,
      fields.enrollmentDepositCents,
      input.defaultDepositCents,
    ],
    centsFromCentsValue,
  ) || firstPositiveCents(
    [nested.deposit, nested.registrationDeposit, fields.registrationDeposit, fields.enrollmentDeposit, fields.deposit],
    centsFromDollarValue,
  );
  const totalCents = registrationFeeCents + depositCents;
  const parts = [
    registrationFeeCents > 0 ? `${formatRegistrationPaymentAmount(registrationFeeCents)} registration fee` : "",
    depositCents > 0 ? `${formatRegistrationPaymentAmount(depositCents)} deposit` : "",
  ].filter(Boolean);

  return {
    registrationFeeCents,
    depositCents,
    totalCents,
    required: totalCents > 0,
    label: parts.length ? parts.join(" + ") : "No registration fee/deposit configured",
  };
}

export function registrationInvoiceExternalId(submissionId: string) {
  return `registration-fee-deposit:${submissionId}`;
}

export function registrationLedgerExternalId(submissionId: string) {
  return `registration-fee-deposit-charge:${submissionId}`;
}

export function registrationInvoiceNumber(submissionId: string) {
  const normalized = submissionId.replace(/[^a-z0-9]/gi, "").slice(-10).toUpperCase() || "PENDING";
  return `REG-${normalized}`;
}

export function registrationPaymentFromData(data: unknown): RegistrationPaymentStatus {
  const payment = asRecord(asRecord(data).registrationPayment);
  const status = clean(payment.status).toLowerCase();
  const totalCents = centsFromCentsValue(payment.totalCents);
  const registrationFeeCents = centsFromCentsValue(payment.registrationFeeCents);
  const depositCents = centsFromCentsValue(payment.depositCents);
  const required = payment.required === true || totalCents > 0;
  return {
    required,
    status: status === "paid" ? "paid" : status === "invoice_open" ? "invoice_open" : required ? "invoice_open" : "not_required",
    invoiceId: clean(payment.invoiceId) || null,
    invoiceNumber: clean(payment.invoiceNumber) || null,
    dueDate: clean(payment.dueDate) || null,
    registrationFeeCents,
    depositCents,
    totalCents,
    paidAt: clean(payment.paidAt) || null,
    paymentId: clean(payment.paymentId) || null,
  };
}
