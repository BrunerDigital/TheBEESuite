import type { Prisma } from "@prisma/client";

export const STAFF_PAY_TYPES = ["hourly", "salary"] as const;
export type StaffPayType = typeof STAFF_PAY_TYPES[number];

export const STAFF_PAYROLL_STATUSES = ["active", "pending", "inactive", "on_hold"] as const;
export type StaffPayrollStatus = typeof STAFF_PAYROLL_STATUSES[number];

export type StaffCompensation = {
  payType: StaffPayType;
  hourlyRateCents: number | null;
  annualSalaryCents: number | null;
  payrollId: string | null;
  payrollStatus: StaffPayrollStatus;
  payCode: string | null;
  department: string | null;
  overtimeEligible: boolean;
  effectiveDate: string | null;
};

export const defaultStaffCompensation: StaffCompensation = {
  payType: "hourly",
  hourlyRateCents: null,
  annualSalaryCents: null,
  payrollId: null,
  payrollStatus: "active",
  payCode: null,
  department: null,
  overtimeEligible: true,
  effectiveDate: null,
};

const compensationPayloadKeys = new Set([
  "staffPayType",
  "payType",
  "hourlyRate",
  "hourlyRateCents",
  "annualSalary",
  "annualSalaryCents",
  "yearlySalary",
  "payrollId",
  "payrollStatus",
  "payCode",
  "payDepartment",
  "department",
  "overtimeEligible",
  "payEffectiveDate",
  "effectiveDate",
]);

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function nullableString(value: unknown) {
  const text = cleanString(value);
  return text ? text : null;
}

function normalizePayType(value: unknown): StaffPayType {
  return value === "salary" ? "salary" : "hourly";
}

function normalizePayrollStatus(value: unknown): StaffPayrollStatus {
  const status = cleanString(value);
  return STAFF_PAYROLL_STATUSES.includes(status as StaffPayrollStatus) ? status as StaffPayrollStatus : "active";
}

function centsValue(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return null;
  return Math.round(number);
}

function moneyToCents(value: unknown) {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) return null;
    return Math.round(value * 100);
  }
  const text = cleanString(value).replace(/[$,]/g, "");
  if (!text) return null;
  const number = Number(text);
  if (!Number.isFinite(number) || number < 0) return null;
  return Math.round(number * 100);
}

function parseMoneyInput(value: unknown, label: string) {
  const text = cleanString(value);
  if (!text && typeof value !== "number") return { ok: true as const, cents: null };
  const cents = moneyToCents(value);
  if (cents === null) return { ok: false as const, error: `${label} must be a valid non-negative dollar amount.` };
  return { ok: true as const, cents };
}

function parseCentsInput(value: unknown, label: string) {
  const text = cleanString(value);
  if (!text && typeof value !== "number") return { ok: true as const, cents: null };
  const cents = centsValue(value);
  if (cents === null) return { ok: false as const, error: `${label} must be a valid non-negative cent amount.` };
  return { ok: true as const, cents };
}

function parseMoneyOrCentsInput(moneyValue: unknown, centsInput: unknown, label: string) {
  const hasMoney = Boolean(cleanString(moneyValue)) || typeof moneyValue === "number";
  if (hasMoney) return parseMoneyInput(moneyValue, label);
  return parseCentsInput(centsInput, label);
}

function normalizeDateOnly(value: unknown) {
  const text = cleanString(value);
  if (!text) return null;
  const date = new Date(`${text.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : text.slice(0, 10);
}

function booleanValue(value: unknown, fallback = true) {
  if (typeof value === "boolean") return value;
  const text = cleanString(value).toLowerCase();
  if (!text) return fallback;
  if (["true", "1", "yes", "on"].includes(text)) return true;
  if (["false", "0", "no", "off"].includes(text)) return false;
  return fallback;
}

export function hasStaffCompensationPayload(input: Record<string, unknown>) {
  return Object.keys(input).some((key) => compensationPayloadKeys.has(key));
}

export function readStaffCompensation(customFields: unknown): StaffCompensation {
  const fields = asRecord(customFields);
  const nested = Object.keys(asRecord(fields.staffCompensation)).length
    ? asRecord(fields.staffCompensation)
    : asRecord(fields.compensation);

  const payType = normalizePayType(nested.payType ?? fields.staffPayType ?? fields.payType);
  const hourlyRateCents =
    centsValue(nested.hourlyRateCents ?? fields.hourlyRateCents) ??
    moneyToCents(nested.hourlyRate ?? nested.hourlyRateDollars ?? fields.hourlyRate);
  const annualSalaryCents =
    centsValue(nested.annualSalaryCents ?? fields.annualSalaryCents ?? fields.yearlySalaryCents) ??
    moneyToCents(nested.annualSalary ?? nested.yearlySalary ?? fields.annualSalary ?? fields.yearlySalary);

  return {
    payType,
    hourlyRateCents,
    annualSalaryCents,
    payrollId: nullableString(nested.payrollId ?? fields.payrollId),
    payrollStatus: normalizePayrollStatus(nested.payrollStatus ?? fields.payrollStatus),
    payCode: nullableString(nested.payCode ?? fields.payCode),
    department: nullableString(nested.department ?? fields.payDepartment ?? fields.department),
    overtimeEligible: booleanValue(nested.overtimeEligible ?? fields.overtimeEligible, true),
    effectiveDate: normalizeDateOnly(nested.effectiveDate ?? fields.payEffectiveDate ?? fields.effectiveDate),
  };
}

export function normalizeStaffCompensationPayload(input: Record<string, unknown>) {
  const hourlyRate = parseMoneyOrCentsInput(input.hourlyRate ?? input.hourlyRateDollars, input.hourlyRateCents, "Hourly rate");
  if (!hourlyRate.ok) return hourlyRate;

  const annualSalary = parseMoneyOrCentsInput(input.annualSalary ?? input.yearlySalary, input.annualSalaryCents ?? input.yearlySalaryCents, "Annual salary");
  if (!annualSalary.ok) return annualSalary;

  return {
    ok: true as const,
    compensation: {
      payType: normalizePayType(input.staffPayType ?? input.payType),
      hourlyRateCents: hourlyRate.cents,
      annualSalaryCents: annualSalary.cents,
      payrollId: nullableString(input.payrollId),
      payrollStatus: normalizePayrollStatus(input.payrollStatus),
      payCode: nullableString(input.payCode),
      department: nullableString(input.payDepartment ?? input.department),
      overtimeEligible: booleanValue(input.overtimeEligible, true),
      effectiveDate: normalizeDateOnly(input.payEffectiveDate ?? input.effectiveDate),
    } satisfies StaffCompensation,
  };
}

export function staffCompensationCustomFields({
  customFields,
  compensation,
  updatedAt,
  updatedById,
}: {
  customFields: unknown;
  compensation: StaffCompensation;
  updatedAt: Date;
  updatedById: string;
}) {
  return {
    ...asRecord(customFields),
    staffCompensation: {
      ...compensation,
      updatedAt: updatedAt.toISOString(),
      updatedById,
    },
  } as Prisma.InputJsonObject;
}

export function centsToDollarInput(cents: number | null) {
  return cents === null ? "" : (cents / 100).toFixed(2);
}

export function formatMoneyCents(cents: number | null, maximumFractionDigits = 2) {
  if (cents === null) return "Not set";
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: maximumFractionDigits,
    maximumFractionDigits,
  });
}

export function formatStaffPayRate(compensation: StaffCompensation) {
  if (compensation.payType === "salary") {
    return compensation.annualSalaryCents === null
      ? "Salary not set"
      : `${formatMoneyCents(compensation.annualSalaryCents, 0)}/yr`;
  }

  return compensation.hourlyRateCents === null
    ? "Hourly rate not set"
    : `${formatMoneyCents(compensation.hourlyRateCents)}/hr`;
}

export function formatStaffPayrollStatus(status: StaffPayrollStatus) {
  return status.replaceAll("_", " ");
}

export function estimatedHourlyGrossPayCents({
  compensation,
  regularMinutes,
  overtimeMinutes,
}: {
  compensation: StaffCompensation;
  regularMinutes: number;
  overtimeMinutes: number;
}) {
  if (compensation.payType !== "hourly" || compensation.hourlyRateCents === null) return null;
  const regularPay = (Math.max(0, regularMinutes) / 60) * compensation.hourlyRateCents;
  const overtimeRate = compensation.overtimeEligible ? 1.5 : 1;
  const overtimePay = (Math.max(0, overtimeMinutes) / 60) * compensation.hourlyRateCents * overtimeRate;
  return Math.round(regularPay + overtimePay);
}
